use objc2_core_video::CVPixelBuffer;
use objc2_io_surface::IOSurfaceRef;

use super::NativeSurface;

impl NativeSurface {
    /// Returns a reference to the underlying `IOSurfaceRef`.
    #[must_use]
    pub fn as_io_surface_ref(&self) -> &IOSurfaceRef {
        &self.inner.surface
    }

    /// Return the original pixel buffer retained from ScreenCaptureKit.
    ///
    /// Asynchronous encoders should submit this buffer directly so CoreVideo
    /// retains the capture-pool allocation until encoding finishes.
    #[must_use]
    pub fn as_pixel_buffer_ref(&self) -> &CVPixelBuffer {
        &self.inner.pixel_buffer
    }

    /// Returns the `IOSurfaceID`.
    #[must_use]
    pub fn io_surface_id(&self) -> u32 {
        self.inner.surface.id()
    }
}
