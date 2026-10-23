//! Windows-specific extensions for [`NativeSurface`].

use windows::Win32::Graphics::Direct3D11::{ID3D11Device, ID3D11DeviceContext, ID3D11Texture2D};

use super::NativeSurface;

impl NativeSurface {
    /// Returns a reference to the underlying `ID3D11Texture2D`.
    #[must_use]
    pub fn as_d3d11_texture(&self) -> &ID3D11Texture2D {
        &self.inner.texture
    }

    /// Returns a reference to the `ID3D11Device` that owns the texture.
    #[must_use]
    pub fn d3d11_device(&self) -> &ID3D11Device {
        &self.inner.device
    }

    /// Returns a reference to the `ID3D11DeviceContext`.
    #[must_use]
    pub fn d3d11_context(&self) -> &ID3D11DeviceContext {
        &self.inner.context
    }
}
