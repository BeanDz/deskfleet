use std::ffi::c_void;

use crate::CaptureError;

pub type PlatformInner = ();

pub fn as_raw_ptr(_inner: &PlatformInner) -> *const c_void {
    std::ptr::null()
}

pub fn copy_pixels(_inner: &PlatformInner) -> Result<Vec<u8>, CaptureError> {
    Err(CaptureError::Unsupported(
        "no capture backend for this platform",
    ))
}
