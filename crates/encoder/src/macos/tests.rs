use super::*;
use objc2_core_video::CVPixelBufferCreateWithIOSurface;
use objc2_io_surface::IOSurfaceRef;
use objc2_io_surface::{
    kIOSurfaceBytesPerElement, kIOSurfaceHeight, kIOSurfacePixelFormat, kIOSurfaceWidth,
};

#[test]
#[ignore = "requires a working VideoToolbox encoder; uses a synthetic surface, no screen capture"]
fn encodes_synthetic_surface_and_preserves_timestamp() {
    let size = CFNumber::new_i32(64);
    let bytes = CFNumber::new_i32(4);
    let format = CFNumber::new_i64(i64::from(u32::from_be_bytes(*b"BGRA")));
    // SAFETY: these immutable CoreFoundation constants have process lifetime.
    let keys = unsafe {
        [
            kIOSurfaceWidth,
            kIOSurfaceHeight,
            kIOSurfaceBytesPerElement,
            kIOSurfacePixelFormat,
        ]
    };
    let properties = CFDictionary::<CFString, CFNumber>::from_slices(
        &keys,
        &[
            size.as_ref(),
            size.as_ref(),
            bytes.as_ref(),
            format.as_ref(),
        ],
    );
    // SAFETY: keys and values have the CoreFoundation types required by IOSurface.
    let surface = unsafe { IOSurfaceRef::new(properties.as_ref()) }.expect("synthetic IOSurface");
    let mut pixel_buffer = ptr::null_mut();
    // SAFETY: surface is retained and pixel_buffer points to valid output storage.
    let status = unsafe {
        CVPixelBufferCreateWithIOSurface(None, &surface, None, NonNull::from(&mut pixel_buffer))
    };
    assert_eq!(status, 0);
    // SAFETY: the successful Create call returns an owned, non-null pixel buffer.
    let pixel_buffer = unsafe { CFRetained::from_raw(NonNull::new(pixel_buffer).unwrap()) };
    let config = EncoderConfig {
        width: 64,
        height: 64,
        fps: 30.0,
        h264_profile: H264Profile::ConstrainedBaseline,
        ..EncoderConfig::default()
    };
    let mut encoder = MacOSEncoder::new(&config).expect("VideoToolbox H.264 encoder");
    let timestamp = 86_400_000_000_000;
    encoder.request_keyframe();
    let mut packets = encoder
        .encode_pixel_buffer(&pixel_buffer, timestamp)
        .expect("encode");
    packets.extend(encoder.flush().expect("flush"));
    assert_eq!(packets.len(), 1);
    assert!(packets[0].is_keyframe);
    assert!(packets[0].data.starts_with(&[0, 0, 0, 1]));
    assert_eq!(packets[0].timestamp_ns, timestamp);
    assert!(packets[0].duration_ns > 0);
}
