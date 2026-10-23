//! Thin Node-API boundary for the TypeScript daemon and desktop integrations.

use napi_derive::napi;

mod media;
mod rtc;
mod terminal;

pub use media::{DesktopConfig, DisplayInfo, capture_displays, supported_video_codecs};
pub use rtc::{
    IceCandidate, IceServer, NativePeer, PeerConfig, PeerEvent, VideoCodec, create_peer,
};
pub use terminal::{NativeTerminal, TerminalConfig, TerminalEvent, create_terminal};

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
