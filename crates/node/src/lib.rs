//! Thin Node-API boundary for the TypeScript daemon and desktop integrations.

use napi_derive::napi;

/// Build information for the loaded native addon.
#[napi(object)]
pub struct NativeInfo {
    pub version: String,
    pub os: String,
    pub arch: String,
}

/// Report the loaded addon version and platform without requiring a display.
#[napi]
pub fn native_info() -> NativeInfo {
    let platform = deskfleet_native::platform_info();
    NativeInfo {
        version: env!("CARGO_PKG_VERSION").to_owned(),
        os: platform.os.to_owned(),
        arch: platform.arch.to_owned(),
    }
}
