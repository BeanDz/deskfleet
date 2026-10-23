use deskfleet_capture::Frame;

use crate::error::EncoderError;
use crate::packet::EncodedPacket;
use crate::types::EncoderConfig;
use crate::windows;

pub struct PlatformEncoder {
    encoder: windows::WindowsEncoder,
}

impl PlatformEncoder {
    pub(crate) fn new(config: &EncoderConfig) -> Result<Self, EncoderError> {
        let encoder = windows::WindowsEncoder::new(config)?;
        Ok(Self { encoder })
    }

    pub(crate) fn encode(&mut self, frame: &Frame) -> Result<Vec<EncodedPacket>, EncoderError> {
        self.encoder.encode(frame)
    }

    pub(crate) fn flush(&mut self) -> Result<Vec<EncodedPacket>, EncoderError> {
        self.encoder.flush()
    }

    pub(crate) fn request_keyframe(&mut self) {
        self.encoder.request_keyframe();
    }

    pub(crate) fn set_bitrate(
        &self,
        avg_bitrate_bps: u32,
        max_bitrate_bps: u32,
    ) -> Result<(), EncoderError> {
        self.encoder.set_bitrate(avg_bitrate_bps, max_bitrate_bps)
    }

    pub(crate) fn set_fps(&mut self, fps: f64) -> Result<(), EncoderError> {
        self.encoder.set_fps(fps)
    }
}
