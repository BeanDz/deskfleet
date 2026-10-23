//! Windows display discovery and D3D11 device setup.

#![allow(unsafe_code)]

use std::sync::Arc;

use windows::Win32::Foundation::HMODULE;
use windows::Win32::Graphics::Direct3D::D3D_DRIVER_TYPE_HARDWARE;
use windows::Win32::Graphics::Direct3D11::{
    D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_DEFAULT,
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Multithread, ID3D11Texture2D,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::{
    DXGI_OUTPUT_DESC, IDXGIAdapter, IDXGIDevice, IDXGIOutput, IDXGIOutput1, IDXGIOutputDuplication,
};
use windows::Win32::Graphics::Gdi::{
    ENUM_CURRENT_SETTINGS, EnumDisplayMonitors, EnumDisplaySettingsW, GetMonitorInfoW, HDC,
    HMONITOR, MONITORINFOEXW,
};
use windows::core::Interface;

use crate::error::CaptureError;
use crate::surface::windows::TexturePool;
use crate::types::Display;

/// Enumerate displays using the Win32 GDI API.
pub fn displays() -> Result<Vec<Display>, CaptureError> {
    let mut monitors: Vec<Display> = Vec::new();

    // SAFETY: Enumeration is synchronous; LPARAM points to the live monitors Vec.
    unsafe {
        // EnumDisplayMonitors callback — pushes each monitor into the vec.
        unsafe extern "system" fn enum_cb(
            hmon: HMONITOR,
            _hdc: HDC,
            _rect: *mut windows::Win32::Foundation::RECT,
            lparam: windows::Win32::Foundation::LPARAM,
        ) -> windows::core::BOOL {
            // SAFETY: EnumDisplayMonitors receives the live monitors Vec pointer below
            // and invokes this callback synchronously on the enumerating thread.
            let monitors = unsafe { &mut *(lparam.0 as *mut Vec<Display>) };
            let mut info = MONITORINFOEXW::default();
            info.monitorInfo.cbSize = size_of::<MONITORINFOEXW>() as u32;
            // SAFETY: Windows supplied hmon; info has its required size initialized.
            if unsafe { GetMonitorInfoW(hmon, &raw mut info as *mut _ as *mut _) }.as_bool() {
                let width = (info.monitorInfo.rcMonitor.right - info.monitorInfo.rcMonitor.left)
                    .unsigned_abs();
                let height = (info.monitorInfo.rcMonitor.bottom - info.monitorInfo.rcMonitor.top)
                    .unsigned_abs();
                let mut refresh_rate_hz = 0.0;
                let mut devmode = windows::Win32::Graphics::Gdi::DEVMODEW {
                    dmSize: size_of::<windows::Win32::Graphics::Gdi::DEVMODEW>() as u16,
                    ..Default::default()
                };
                // SAFETY: The device name is a terminated Win32 array and devmode
                // has its size initialized for EnumDisplaySettingsW.
                if unsafe {
                    EnumDisplaySettingsW(
                        windows::core::PCWSTR(info.szDevice.as_ptr()),
                        ENUM_CURRENT_SETTINGS,
                        &raw mut devmode,
                    )
                }
                .as_bool()
                {
                    let freq = devmode.dmDisplayFrequency;
                    if freq > 1 {
                        refresh_rate_hz = freq as f64;
                    }
                }
                monitors.push(Display {
                    id: hmon.0 as usize as u32,
                    width,
                    height,
                    refresh_rate_hz,
                });
            }
            windows::core::BOOL(1) // continue enumeration
        }

        let lp = windows::Win32::Foundation::LPARAM(std::ptr::addr_of_mut!(monitors) as isize);
        let _ = EnumDisplayMonitors(None, None, Some(enum_cb), lp);
    }

    if monitors.is_empty() {
        return Err(CaptureError::NoDisplays);
    }

    Ok(monitors)
}

/// Create a D3D11 device suitable for DXGI desktop duplication.
pub(super) fn create_d3d11_device() -> Result<(ID3D11Device, ID3D11DeviceContext), CaptureError> {
    let mut device = None;
    let mut context = None;

    // SAFETY: Out pointers reference live Options; no single-threaded device flag
    // is requested, and the hardware driver is selected without a software module.
    unsafe {
        D3D11CreateDevice(
            None, // default adapter
            D3D_DRIVER_TYPE_HARDWARE,
            HMODULE::default(), // no software module
            D3D11_CREATE_DEVICE_BGRA_SUPPORT,
            None, // default feature levels
            D3D11_SDK_VERSION,
            Some(&raw mut device),
            None, // actual feature level out
            Some(&raw mut context),
        )
        .map_err(|e| CaptureError::Platform(format!("D3D11CreateDevice failed: {e}")))?;
    }

    let device = device.ok_or(CaptureError::Platform("D3D11 device was null".into()))?;
    let context = context.ok_or(CaptureError::Platform("D3D11 context was null".into()))?;

    let multithread: ID3D11Multithread = context
        .cast()
        .map_err(|error| CaptureError::Platform(format!("D3D11 multithread interface: {error}")))?;
    // SAFETY: The live device context supports this interface. Protection is enabled
    // before its references are shared by capture, surface readback, and encoding.
    unsafe {
        let _ = multithread.SetMultithreadProtected(true);
    }
    Ok((device, context))
}

/// Locate the DXGI output whose `HMONITOR` matches `monitor_id`.
///
/// Returns the output cast to `IDXGIOutput1` (required for `DuplicateOutput`)
/// along with its description.
pub(super) fn find_dxgi_output(
    device: &ID3D11Device,
    monitor_id: u32,
) -> Result<(IDXGIOutput1, DXGI_OUTPUT_DESC), CaptureError> {
    let dxgi_device: IDXGIDevice = device
        .cast()
        .map_err(|e| CaptureError::Platform(format!("cast to IDXGIDevice: {e}")))?;

    // SAFETY: dxgi_device is a live interface obtained from the retained device.
    let adapter: IDXGIAdapter = unsafe { dxgi_device.GetAdapter() }
        .map_err(|e| CaptureError::Platform(format!("GetAdapter: {e}")))?;

    let hmon = HMONITOR(monitor_id as isize as *mut _);

    let mut idx = 0u32;
    loop {
        // SAFETY: adapter remains retained and an absent index returns an error.
        let output: IDXGIOutput = match unsafe { adapter.EnumOutputs(idx) } {
            Ok(o) => o,
            Err(_) => break, // exhausted all outputs
        };
        idx += 1;

        // SAFETY: output is retained for this immutable description query.
        let desc = match unsafe { output.GetDesc() } {
            Ok(d) => d,
            Err(_) => continue,
        };

        if desc.Monitor == hmon {
            let output1: IDXGIOutput1 = output
                .cast()
                .map_err(|e| CaptureError::Platform(format!("cast to IDXGIOutput1: {e}")))?;
            return Ok((output1, desc));
        }
    }

    Err(CaptureError::Platform(format!(
        "no DXGI output found for monitor 0x{monitor_id:x}"
    )))
}

/// Create a DXGI output duplication for the given monitor.
pub(super) fn create_duplication(
    device: &ID3D11Device,
    display_id: u32,
) -> Result<IDXGIOutputDuplication, CaptureError> {
    let (output1, _desc) = find_dxgi_output(device, display_id)?;
    // SAFETY: This output was found on the supplied D3D11 device's adapter.
    unsafe { output1.DuplicateOutput(device) }
        .map_err(|e| CaptureError::Platform(format!("DuplicateOutput: {e}")))
}

/// Recreate the output duplication after `DXGI_ERROR_ACCESS_LOST`.
///
/// Updates `width`, `height`, and `texture_pool` if the resolution changed.
pub(super) fn try_recreate_duplication(
    device: &ID3D11Device,
    display_id: u32,
    width: &mut u32,
    height: &mut u32,
    texture_pool: &mut Arc<TexturePool>,
) -> Result<IDXGIOutputDuplication, CaptureError> {
    let (output1, desc) = find_dxgi_output(device, display_id)?;

    let new_w = (desc.DesktopCoordinates.right - desc.DesktopCoordinates.left).unsigned_abs();
    let new_h = (desc.DesktopCoordinates.bottom - desc.DesktopCoordinates.top).unsigned_abs();

    if new_w != *width || new_h != *height {
        tracing::info!(
            "display resolution changed: {}x{} -> {}x{}",
            *width,
            *height,
            new_w,
            new_h,
        );
        *width = new_w;
        *height = new_h;
        // Create a fresh pool sized for the new dimensions.
        *texture_pool = Arc::new(TexturePool::new());
        pre_allocate_pool(device, texture_pool, *width, *height);
    }

    // SAFETY: This output was found on the supplied D3D11 device's adapter.
    unsafe { output1.DuplicateOutput(device) }
        .map_err(|e| CaptureError::Platform(format!("DuplicateOutput: {e}")))
}

/// Pre-allocate textures in the pool to avoid per-frame `CreateTexture2D`.
pub(super) fn pre_allocate_pool(
    device: &ID3D11Device,
    pool: &TexturePool,
    width: u32,
    height: u32,
) {
    let desc = D3D11_TEXTURE2D_DESC {
        Width: width,
        Height: height,
        MipLevels: 1,
        ArraySize: 1,
        Format: DXGI_FORMAT_B8G8R8A8_UNORM,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_DEFAULT,
        BindFlags: 0,
        CPUAccessFlags: 0,
        MiscFlags: 0,
    };

    // Pre-allocate 8 textures to cover the in-flight pipeline depth:
    // mpsc channel + tokio channel (capacity 3) + encoder + headroom.
    for _ in 0..8 {
        if let Ok(tex) = create_pool_texture(device, &desc) {
            pool.release(tex);
        }
    }
}

/// Create a `D3D11_USAGE_DEFAULT` texture for GPU-to-GPU copies.
pub(super) fn create_pool_texture(
    device: &ID3D11Device,
    desc: &D3D11_TEXTURE2D_DESC,
) -> Result<ID3D11Texture2D, CaptureError> {
    // SAFETY: desc describes a supported BGRA texture and tex is a valid out pointer.
    unsafe {
        let mut tex: Option<ID3D11Texture2D> = None;
        device
            .CreateTexture2D(desc, None, Some(&raw mut tex))
            .map_err(|e| CaptureError::Platform(format!("CreateTexture2D pool: {e}")))?;
        tex.ok_or_else(|| CaptureError::Platform("pool texture was null".into()))
    }
}
