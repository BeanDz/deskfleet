#![allow(unsafe_code)]

use std::ffi::c_void;

use objc2_core_foundation::CFRetained;
use objc2_core_video::CVPixelBuffer;
use objc2_io_surface::{IOSurfaceLockOptions, IOSurfaceRef};

use crate::CaptureError;

pub struct PlatformInner {
    pub(crate) surface: CFRetained<IOSurfaceRef>,
    // Keep the originating pixel buffer alive so ScreenCaptureKit cannot reuse its
    // backing storage while the frame is waiting for the encoder.
    pub(crate) pixel_buffer: CFRetained<CVPixelBuffer>,
}

pub fn as_raw_ptr(inner: &PlatformInner) -> *const c_void {
    let ptr: *const IOSurfaceRef = &raw const *inner.surface;
    ptr.cast()
}

pub fn copy_pixels(inner: &PlatformInner) -> Result<Vec<u8>, CaptureError> {
    let inner = &inner.surface;
    // SAFETY: The retained IOSurface is locked read-only before accessing its
    // allocation. The pixel slice is copied before the matching unlock.
    unsafe {
        let lock_result = inner.lock(IOSurfaceLockOptions::ReadOnly, std::ptr::null_mut());
        if lock_result != 0 {
            return Err(CaptureError::Platform(format!(
                "IOSurfaceLock failed with kern_return {lock_result}"
            )));
        }

        let height = inner.height();
        let stride = inner.bytes_per_row();
        let base = inner.base_address();
        let len = height * stride;

        let data = if len > 0 {
            std::slice::from_raw_parts(base.as_ptr().cast::<u8>(), len).to_vec()
        } else {
            Vec::new()
        };

        let _ = inner.unlock(IOSurfaceLockOptions::ReadOnly, std::ptr::null_mut());

        Ok(data)
    }
}
