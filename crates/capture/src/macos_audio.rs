//! Normalize ScreenCaptureKit's PCM buffers for the interleaved Opus encoder.
#![allow(unsafe_code)]

use std::ptr::{self, NonNull};

use objc2_core_audio_types::{
    AudioBuffer, AudioBufferList, kAudioFormatFlagIsBigEndian, kAudioFormatFlagIsFloat,
    kAudioFormatFlagIsNonInterleaved, kAudioFormatLinearPCM,
};
use objc2_core_foundation::CFRetained;
use objc2_core_media::{
    CMAudioFormatDescriptionGetStreamBasicDescription, CMBlockBuffer, CMSampleBuffer,
    kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
};

use crate::audio::{AudioFrame, interleave_stereo};

// AudioBufferList is a C flexible array. Capture supports at most two channels,
// so reserve space for both planes with the same header/alignment as the API.
#[repr(C)]
struct StereoBufferList {
    count: u32,
    buffers: [AudioBuffer; 2],
}

pub(super) fn audio_from_sample_buffer(
    sample: &CMSampleBuffer,
    sample_rate: u32,
    channels: u16,
) -> Option<AudioFrame> {
    // SAFETY: ScreenCaptureKit owns a valid sample for the callback. Retaining the
    // returned block buffer keeps all AudioBuffer pointers alive while copied.
    unsafe {
        let description = sample.format_description()?;
        let format = CMAudioFormatDescriptionGetStreamBasicDescription(&description).as_ref()?;
        if format.mFormatID != kAudioFormatLinearPCM
            || format.mFormatFlags & kAudioFormatFlagIsFloat == 0
            || format.mFormatFlags & kAudioFormatFlagIsBigEndian != 0
            || format.mBitsPerChannel != 32
            || format.mSampleRate != f64::from(sample_rate)
            || format.mChannelsPerFrame != u32::from(channels)
        {
            return None;
        }
        let frames = usize::try_from(sample.num_samples()).ok()?;
        if frames == 0 {
            return None;
        }
        let mut list = StereoBufferList {
            count: 0,
            buffers: [AudioBuffer {
                mNumberChannels: 0,
                mDataByteSize: 0,
                mData: ptr::null_mut(),
            }; 2],
        };
        let mut block: *mut CMBlockBuffer = ptr::null_mut();
        let status = sample.audio_buffer_list_with_retained_block_buffer(
            ptr::null_mut(),
            (&raw mut list).cast::<AudioBufferList>(),
            size_of::<StereoBufferList>(),
            None,
            None,
            kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment,
            &raw mut block,
        );
        let _block = NonNull::new(block).map(|block| CFRetained::from_raw(block));
        if status != 0 || _block.is_none() {
            return None;
        }
        let samples =
            if format.mFormatFlags & kAudioFormatFlagIsNonInterleaved != 0 && channels == 2 {
                if list.count != 2 {
                    return None;
                }
                let left = float_samples(&list.buffers[0], frames, 1)?;
                let right = float_samples(&list.buffers[1], frames, 1)?;
                interleave_stereo(left, right)
            } else {
                if list.count != 1 {
                    return None;
                }
                float_samples(&list.buffers[0], frames, channels)?.to_vec()
            };
        Some(AudioFrame {
            samples,
            sample_rate,
            channels,
            timestamp_ns: super::timestamp_ns(sample.presentation_time_stamp()),
        })
    }
}

/// # Safety
/// The buffer must come from CoreMedia's aligned AudioBufferList API, and its
/// retained block buffer must remain alive for the returned slice's lifetime.
unsafe fn float_samples(buffer: &AudioBuffer, frames: usize, channels: u16) -> Option<&[f32]> {
    let samples = frames.checked_mul(usize::from(channels))?;
    let bytes = samples.checked_mul(size_of::<f32>())?;
    if buffer.mNumberChannels != u32::from(channels)
        || buffer.mData.is_null()
        || (buffer.mDataByteSize as usize) < bytes
    {
        return None;
    }
    // SAFETY: The caller retains CoreMedia's block and requested aligned data;
    // the byte-size check above bounds this read to the actual buffer allocation.
    Some(unsafe { std::slice::from_raw_parts(buffer.mData.cast::<f32>(), samples) })
}
