//! VideoToolbox output callback and compressed sample conversion.

#![allow(unsafe_code)]

use super::CallbackState;
use crate::bitstream::{convert_avcc_to_annex_b, time_to_nanoseconds};
use crate::{Codec, EncodedPacket};
use objc2_core_foundation::{CFBoolean, CFDictionary, CFRetained, CFString};
use objc2_core_media::{
    CMBlockBuffer, CMFormatDescription, CMSampleBuffer, CMTime, CMTimeFlags,
    CMVideoFormatDescriptionGetH264ParameterSetAtIndex,
    CMVideoFormatDescriptionGetHEVCParameterSetAtIndex, kCMSampleAttachmentKey_NotSync,
};
use objc2_video_toolbox::VTEncodeInfoFlags;
use std::borrow::Cow;
use std::ffi::c_void;
use std::ptr;
use std::sync::Mutex;

// ── VideoToolbox output callback ──────────────────────────────────────

/// C callback invoked by `VideoToolbox` when a frame has been encoded.
///
/// # Safety
///
/// - `output_callback_ref_con` must point to the encoder-owned `Mutex<CallbackState>`
///   and remain valid for this callback.
/// - `sample_buffer` is either null (on error/drop) or a valid `CMSampleBuffer`.
pub(super) unsafe extern "C-unwind" fn output_callback(
    output_callback_ref_con: *mut c_void,
    _source_frame_ref_con: *mut c_void,
    status: i32,
    info_flags: VTEncodeInfoFlags,
    sample_buffer: *mut CMSampleBuffer,
) {
    if status != 0 {
        tracing::warn!("VideoToolbox encode callback received error OSStatus {status}");
        return;
    }

    // Check if the frame was dropped.
    if info_flags.contains(VTEncodeInfoFlags::FrameDropped) {
        tracing::debug!("VideoToolbox dropped a frame");
        return;
    }

    if sample_buffer.is_null() {
        return;
    }

    // SAFETY: VideoToolbox supplies a valid sample for the duration of the callback.
    let sample_buffer = unsafe { &*sample_buffer };

    // SAFETY: the encoder owns this state until invalidate() finishes all callbacks.
    let state = unsafe { &*output_callback_ref_con.cast::<Mutex<CallbackState>>() };

    let codec = {
        let s = state.lock().expect("encoder state lock poisoned");
        s.codec
    };

    if let Some(packet) = extract_packet(sample_buffer, codec)
        && let Ok(mut s) = state.lock()
    {
        s.packets.push(packet);
    }
}

/// Extract an `EncodedPacket` from a compressed `CMSampleBuffer`.
///
/// For H.264/H.265: converts AVCC/HVCC-format NALUs to Annex B format.
/// For AV1: passes raw OBU data through without conversion.
fn extract_packet(sample_buffer: &CMSampleBuffer, codec: Codec) -> Option<EncodedPacket> {
    // SAFETY: this sample or attachment is retained for the duration of its CoreMedia accessor call.
    let data_buffer: CFRetained<CMBlockBuffer> = unsafe { sample_buffer.data_buffer()? };

    let format_desc: CFRetained<CMFormatDescription> =
        // SAFETY: this sample or attachment is retained for the duration of its CoreMedia accessor call.
        unsafe { sample_buffer.format_description()? };

    // Use sample-buffer attachment metadata for keyframe detection — O(1)
    // dictionary lookup, no data access required.
    let is_keyframe = is_keyframe_from_attachments(sample_buffer);

    // SAFETY: this sample or attachment is retained for the duration of its CoreMedia accessor call.
    let pts: CMTime = unsafe { sample_buffer.presentation_time_stamp() };
    let timestamp_ns = if pts.flags.contains(CMTimeFlags::Valid) {
        time_to_nanoseconds(pts.value, pts.timescale)
    } else {
        0
    };
    // SAFETY: this is the valid compressed sample supplied by VideoToolbox.
    let dur: CMTime = unsafe { sample_buffer.duration() };
    let duration_ns = if dur.flags.contains(CMTimeFlags::Valid) {
        time_to_nanoseconds(dur.value, dur.timescale)
    } else {
        0
    };

    // Read the encoded data once as a zero-copy slice from the block buffer.
    let raw_data = get_block_buffer_slice(&data_buffer)?;

    let data = match codec {
        Codec::H264 | Codec::H265 => {
            let mut annex_b_data: Vec<u8> = Vec::new();

            // If keyframe, prepend parameter sets (SPS/PPS for H.264; VPS/SPS/PPS for H.265).
            if is_keyframe && let Some(params) = extract_parameter_sets(&format_desc, codec) {
                annex_b_data.extend_from_slice(&params);
            }

            // Convert AVCC/HVCC data to Annex B in a single copy.
            let nalu_header_len = get_nalu_header_length(&format_desc, codec);
            convert_avcc_to_annex_b(&raw_data, nalu_header_len, &mut annex_b_data)?;

            annex_b_data
        }
        Codec::AV1 => {
            // AV1: VideoToolbox outputs raw OBU data. Pass it through
            // without format conversion. The sequence header OBU is
            // included by VideoToolbox in keyframe samples.
            raw_data.to_vec()
        }
    };

    if data.is_empty() {
        return None;
    }

    Some(EncodedPacket {
        data,
        timestamp_ns,
        duration_ns,
        is_keyframe,
    })
}

/// Check whether this sample is a keyframe via `CMSampleBuffer` attachments.
///
/// `VideoToolbox` tags every compressed sample with `kCMSampleAttachmentKey_NotSync`.
/// If the key is **absent**, the sample **is** a sync sample (keyframe).
/// If the key is present and `kCFBooleanTrue`, the sample is **not** a sync sample.
///
/// Uses an O(1) dictionary lookup without copying or parsing the encoded payload.
fn is_keyframe_from_attachments(sample_buffer: &CMSampleBuffer) -> bool {
    // SAFETY: this sample or attachment is retained for the duration of its CoreMedia accessor call.
    let attachments = unsafe { sample_buffer.sample_attachments_array(false) };
    let Some(attachments) = attachments else {
        // No attachments array → sync sample → keyframe.
        return true;
    };

    if attachments.count() == 0 {
        return true;
    }

    // The attachments array contains one CFMutableDictionary per sample.
    // SAFETY: sample attachments are CoreMedia dictionaries retained by the attachments array.
    let dict_ptr = unsafe { attachments.value_at_index(0) };
    if dict_ptr.is_null() {
        return true;
    }

    // SAFETY: sample attachments are CoreMedia dictionaries retained by the attachments array.
    let dict: &CFDictionary = unsafe { &*dict_ptr.cast::<CFDictionary>() };

    // Look up kCMSampleAttachmentKey_NotSync in the dictionary.
    let key_ptr: *const c_void =
        // SAFETY: the framework exports immutable constants with process lifetime.
        ptr::from_ref::<CFString>(unsafe { kCMSampleAttachmentKey_NotSync }).cast();
    let mut value: *const c_void = ptr::null();
    // SAFETY: the attachment dictionary and CFString key are valid; value is writable pointer storage.
    let present = unsafe { dict.value_if_present(key_ptr, &raw mut value) };

    if !present {
        // Key absent → sync sample → keyframe.
        return true;
    }

    // Compare against the kCFBooleanTrue singleton (pointer equality).
    // SAFETY: the framework exports immutable constants with process lifetime.
    let cf_true = unsafe { objc2_core_foundation::kCFBooleanTrue }.expect("kCFBooleanTrue is null");
    let cf_true_ptr: *const c_void = ptr::from_ref::<CFBoolean>(cf_true).cast();

    // NotSync == true ⟹ NOT a keyframe.
    value != cf_true_ptr
}

/// Extract parameter sets from the format description as Annex B.
///
/// For H.264: extracts SPS and PPS.
/// For H.265: extracts VPS, SPS, and PPS.
/// For AV1: not used (sequence header is included in OBU data by `VideoToolbox`).
fn extract_parameter_sets(format_desc: &CMFormatDescription, codec: Codec) -> Option<Vec<u8>> {
    let mut result = Vec::new();
    let mut count: usize = 0;

    let status = match codec {
        // SAFETY: the format description matches the selected codec; all non-null outputs point to writable storage.
        Codec::H264 => unsafe {
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                format_desc,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
                &raw mut count,
                ptr::null_mut(),
            )
        },
        // SAFETY: the format description matches the selected codec; all non-null outputs point to writable storage.
        Codec::H265 => unsafe {
            CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(
                format_desc,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
                &raw mut count,
                ptr::null_mut(),
            )
        },
        Codec::AV1 => return None, // Sequence header is in the OBU data.
    };

    if status != 0 {
        return None;
    }

    for i in 0..count {
        let mut param_ptr: *const u8 = ptr::null();
        let mut param_size: usize = 0;

        let status = match codec {
            // SAFETY: the format description matches the selected codec; all non-null outputs point to writable storage.
            Codec::H264 => unsafe {
                CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                    format_desc,
                    i,
                    &raw mut param_ptr,
                    &raw mut param_size,
                    ptr::null_mut(),
                    ptr::null_mut(),
                )
            },
            // SAFETY: the format description matches the selected codec; all non-null outputs point to writable storage.
            Codec::H265 => unsafe {
                CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(
                    format_desc,
                    i,
                    &raw mut param_ptr,
                    &raw mut param_size,
                    ptr::null_mut(),
                    ptr::null_mut(),
                )
            },
            Codec::AV1 => unreachable!(),
        };

        if status != 0 || param_ptr.is_null() || param_size == 0 {
            continue;
        }

        // Annex B start code.
        result.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
        // SAFETY: CoreMedia returned this non-null parameter-set pointer and length for the live format description.
        let param_data = unsafe { std::slice::from_raw_parts(param_ptr, param_size) };
        result.extend_from_slice(param_data);
    }

    if result.is_empty() {
        None
    } else {
        Some(result)
    }
}

/// Get the NALU length prefix size from the format description (typically 4).
///
/// Only valid for H.264/H.265 (AVCC/HVCC format). Not used for AV1.
fn get_nalu_header_length(format_desc: &CMFormatDescription, codec: Codec) -> usize {
    let mut header_len: std::ffi::c_int = 0;

    let status = match codec {
        // SAFETY: the format description matches the selected codec; all non-null outputs point to writable storage.
        Codec::H264 => unsafe {
            CMVideoFormatDescriptionGetH264ParameterSetAtIndex(
                format_desc,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                &raw mut header_len,
            )
        },
        // SAFETY: the format description matches the selected codec; all non-null outputs point to writable storage.
        Codec::H265 => unsafe {
            CMVideoFormatDescriptionGetHEVCParameterSetAtIndex(
                format_desc,
                0,
                ptr::null_mut(),
                ptr::null_mut(),
                ptr::null_mut(),
                &raw mut header_len,
            )
        },
        Codec::AV1 => return 0, // AV1 does not use NALU length prefixes.
    };

    if status == 0 && header_len > 0 {
        header_len.cast_unsigned() as usize
    } else {
        4 // default AVCC/HVCC NALU length prefix
    }
}

/// Get a zero-copy slice of the raw bytes inside a `CMBlockBuffer`.
///
/// The returned slice borrows directly from the block buffer's backing
/// store, avoiding the `Vec` allocation + memcpy that the old
/// `get_block_buffer_data` helper performed on every frame.
fn get_block_buffer_slice(block_buffer: &CMBlockBuffer) -> Option<Cow<'_, [u8]>> {
    let mut contiguous_length: usize = 0;
    let mut total_length: usize = 0;
    let mut data_ptr: *mut std::ffi::c_char = ptr::null_mut();

    // SAFETY: the block buffer is retained; length and pointer outputs are valid writable storage.
    let status = unsafe {
        block_buffer.data_pointer(
            0,
            &raw mut contiguous_length,
            &raw mut total_length,
            &raw mut data_ptr,
        )
    };

    if status != 0 || data_ptr.is_null() || total_length == 0 {
        return None;
    }

    if contiguous_length == total_length {
        // SAFETY: data_pointer confirms this entire range is contiguous and the
        // borrowed block buffer retains its storage throughout use of the slice.
        return Some(Cow::Borrowed(unsafe {
            std::slice::from_raw_parts(data_ptr.cast::<u8>(), total_length)
        }));
    }
    let mut bytes = vec![0; total_length];
    // SAFETY: the destination allocation covers total_length writable bytes.
    let status = unsafe {
        block_buffer.copy_data_bytes(
            0,
            total_length,
            std::ptr::NonNull::new(bytes.as_mut_ptr().cast())?,
        )
    };
    (status == 0).then_some(Cow::Owned(bytes))
}
