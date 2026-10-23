use std::fmt;

/// Errors that can occur during video encoding.
#[derive(Debug)]
pub enum EncoderError {
    /// The platform does not support hardware encoding.
    Unsupported(&'static str),

    /// An error from the platform encoder (e.g., `VideoToolbox` `OSStatus`).
    Platform(String),

    /// The encoder was given an invalid configuration.
    InvalidConfig(String),

    /// A frame was dropped by the encoder.
    FrameDropped,
}

impl fmt::Display for EncoderError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Unsupported(msg) => write!(f, "unsupported: {msg}"),
            Self::Platform(msg) => write!(f, "encoder error: {msg}"),
            Self::InvalidConfig(msg) => write!(f, "invalid config: {msg}"),
            Self::FrameDropped => write!(f, "frame was dropped by encoder"),
        }
    }
}

impl std::error::Error for EncoderError {}
