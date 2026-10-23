//! Platform-native GPU surface handle.

#[cfg(target_os = "macos")]
pub(crate) mod macos;

#[cfg(target_os = "windows")]
pub(crate) mod windows;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
mod stub;

#[cfg(target_os = "macos")]
use macos as platform;

#[cfg(target_os = "windows")]
use self::windows as platform;

#[cfg(not(any(target_os = "macos", target_os = "windows")))]
use stub as platform;

use std::ffi::c_void;
use std::fmt;

use crate::CaptureError;

/// A retained handle to a platform-native GPU surface.
pub struct NativeSurface {
    pub(crate) inner: platform::PlatformInner,
}

// SAFETY: The underlying platform handles are reference-counted / thread-safe.
// IOSurface on macOS, COM pointers on Windows. Windows contexts enable
// ID3D11Multithread protection before they are shared.
#[allow(unsafe_code, clippy::non_send_fields_in_send_ty)]
unsafe impl Send for NativeSurface {}
// SAFETY: Surface readback locks IOSurface or uses the protected D3D11 context;
// callers receive shared handles, while the wrapper retains the allocation.
#[allow(unsafe_code, clippy::non_send_fields_in_send_ty)]
unsafe impl Sync for NativeSurface {}

impl NativeSurface {
    /// Returns a raw pointer to the underlying platform surface.
    #[must_use]
    pub fn as_raw_ptr(&self) -> *const c_void {
        platform::as_raw_ptr(&self.inner)
    }

    /// Copy the surface pixel data into CPU-accessible memory.
    pub fn copy_pixels(&self) -> Result<Vec<u8>, CaptureError> {
        platform::copy_pixels(&self.inner)
    }
}

impl fmt::Debug for NativeSurface {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("NativeSurface")
            .field("ptr", &self.as_raw_ptr())
            .finish()
    }
}

#[cfg(target_os = "macos")]
mod macos_ext;

#[cfg(target_os = "windows")]
mod windows_ext;
