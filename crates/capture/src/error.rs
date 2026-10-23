use std::fmt;

/// Errors that can occur during screen capture.
#[derive(Debug)]
pub enum CaptureError {
    /// The capture stream has ended (channel disconnected).
    StreamEnded,

    /// The platform does not support screen capture.
    Unsupported(&'static str),

    /// No displays were found.
    NoDisplays,

    /// The requested dimensions, frame rate, or audio format are invalid.
    InvalidConfig(&'static str),

    /// A platform-specific error occurred.
    Platform(String),

    /// Permission denied — screen recording permission is required.
    PermissionDenied,
}

impl fmt::Display for CaptureError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::StreamEnded => write!(f, "capture stream has ended"),
            Self::Unsupported(msg) => write!(f, "unsupported: {msg}"),
            Self::NoDisplays => write!(f, "no displays found"),
            Self::InvalidConfig(msg) => write!(f, "invalid capture configuration: {msg}"),
            Self::Platform(msg) => write!(f, "platform error: {msg}"),
            Self::PermissionDenied => write!(f, "screen recording permission denied"),
        }
    }
}

impl std::error::Error for CaptureError {}
