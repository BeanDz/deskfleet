//! Windows platform surface backed by a D3D11 texture.

#![allow(unsafe_code)]

use std::ffi::c_void;
use std::sync::{Arc, Mutex};

use windows::Win32::Graphics::Direct3D11::{
    D3D11_CPU_ACCESS_READ, D3D11_MAP_READ, D3D11_MAPPED_SUBRESOURCE, D3D11_TEXTURE2D_DESC,
    D3D11_USAGE_STAGING, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::DXGI_SAMPLE_DESC;
use windows::core::Interface;

use crate::CaptureError;

/// A reusable pool of pre-allocated `ID3D11Texture2D` objects.
///
/// Textures are acquired before each capture and returned automatically
/// when the [`PlatformInner`] that wraps them is dropped.
pub(crate) struct TexturePool {
    free: Mutex<Vec<ID3D11Texture2D>>,
}

impl TexturePool {
    /// Create an empty pool.
    pub fn new() -> Self {
        Self {
            free: Mutex::new(Vec::new()),
        }
    }

    /// Take a texture from the pool, or return `None` if empty.
    pub fn acquire(&self) -> Option<ID3D11Texture2D> {
        self.free
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .pop()
    }

    /// Return a texture to the pool for reuse.
    pub fn release(&self, tex: ID3D11Texture2D) {
        self.free
            .lock()
            .unwrap_or_else(|error| error.into_inner())
            .push(tex);
    }
}

/// Holds an `ID3D11Texture2D` plus references to the device and context
/// that own it, so the encoder can extract them later.
///
/// When dropped, the texture is returned to the [`TexturePool`] for reuse
/// (if a pool reference is set).
pub struct PlatformInner {
    pub(crate) texture: ID3D11Texture2D,
    pub(crate) device: ID3D11Device,
    pub(crate) context: ID3D11DeviceContext,
    /// Pool to return the texture to on drop (if any).
    pub(crate) pool: Option<Arc<TexturePool>>,
}

impl Drop for PlatformInner {
    fn drop(&mut self) {
        if let Some(pool) = self.pool.take() {
            pool.release(self.texture.clone());
        }
    }
}

pub fn as_raw_ptr(inner: &PlatformInner) -> *const c_void {
    inner.texture.as_raw()
}

pub fn copy_pixels(inner: &PlatformInner) -> Result<Vec<u8>, CaptureError> {
    // SAFETY: These COM interfaces retain their device and texture. The immediate
    // context has multithread protection enabled at creation; staging storage is
    // read only after Map succeeds and is unmapped before being released.
    unsafe {
        let mut desc = D3D11_TEXTURE2D_DESC::default();
        inner.texture.GetDesc(&raw mut desc);

        // Create a CPU-readable staging texture.
        let staging_desc = D3D11_TEXTURE2D_DESC {
            Width: desc.Width,
            Height: desc.Height,
            MipLevels: 1,
            ArraySize: 1,
            Format: desc.Format,
            SampleDesc: DXGI_SAMPLE_DESC {
                Count: 1,
                Quality: 0,
            },
            Usage: D3D11_USAGE_STAGING,
            BindFlags: 0,
            CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
            MiscFlags: 0,
        };

        let mut staging: Option<ID3D11Texture2D> = None;
        inner
            .device
            .CreateTexture2D(&staging_desc, None, Some(&raw mut staging))
            .map_err(|e| CaptureError::Platform(format!("CreateTexture2D staging: {e}")))?;

        let staging =
            staging.ok_or_else(|| CaptureError::Platform("staging texture was null".into()))?;

        let staging_res: ID3D11Resource = staging
            .cast()
            .map_err(|e| CaptureError::Platform(format!("cast staging to ID3D11Resource: {e}")))?;
        let src_res: ID3D11Resource = inner
            .texture
            .cast()
            .map_err(|e| CaptureError::Platform(format!("cast texture to ID3D11Resource: {e}")))?;

        inner.context.CopyResource(&staging_res, &src_res);

        let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
        inner
            .context
            .Map(&staging_res, 0, D3D11_MAP_READ, 0, Some(&raw mut mapped))
            .map_err(|e| CaptureError::Platform(format!("Map staging texture: {e}")))?;

        let row_bytes = (desc.Width * 4) as usize;
        let mut data = Vec::with_capacity(desc.Height as usize * row_bytes);

        for y in 0..desc.Height as usize {
            let src = (mapped.pData as *const u8).add(y * mapped.RowPitch as usize);
            let row = std::slice::from_raw_parts(src, row_bytes);
            data.extend_from_slice(row);
        }

        inner.context.Unmap(&staging_res, 0);

        Ok(data)
    }
}
