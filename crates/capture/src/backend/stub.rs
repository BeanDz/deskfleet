use std::time::Duration;

use crate::CaptureError;
use crate::audio::AudioFrame;
use crate::frame::Frame;
use crate::types::{CaptureConfig, Display};

pub(crate) struct StubStream;

impl StubStream {
    pub(crate) fn new(_display: &Display, _config: &CaptureConfig) -> Result<Self, CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn start(&self) -> Result<(), CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn stop(&self) -> Result<(), CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn poll_frame(&self) -> Result<Option<Frame>, CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn next_frame(&self) -> Result<Frame, CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn try_next_frame(&self) -> Result<Option<Frame>, CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn next_frame_timeout(
        &self,
        _timeout: Duration,
    ) -> Result<Option<Frame>, CaptureError> {
        Err(CaptureError::Unsupported(
            "no capture backend for this platform",
        ))
    }

    pub(crate) fn next_audio_frame(&self) -> Result<AudioFrame, CaptureError> {
        Err(CaptureError::Unsupported("audio capture not enabled"))
    }

    pub(crate) fn try_next_audio_frame(&self) -> Result<Option<AudioFrame>, CaptureError> {
        Err(CaptureError::Unsupported("audio capture not enabled"))
    }

    #[must_use]
    pub(crate) fn has_audio(&self) -> bool {
        false
    }
}
