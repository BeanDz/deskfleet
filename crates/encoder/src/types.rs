/// Video codec to use for encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Codec {
    /// H.264 / AVC.
    H264,

    /// H.265 / HEVC.
    H265,

    /// AV1 (`AOMedia` Video 1).
    AV1,
}

impl Codec {
    /// All known codec variants.
    pub const ALL: [Self; 3] = [Self::H264, Self::H265, Self::AV1];

    /// Machine-readable string identifier (e.g. `"h264"`).
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::H264 => "h264",
            Self::H265 => "h265",
            Self::AV1 => "av1",
        }
    }

    /// Human-readable display name (e.g. `"H.264"`).
    #[must_use]
    pub fn display_name(self) -> &'static str {
        match self {
            Self::H264 => "H.264",
            Self::H265 => "H.265",
            Self::AV1 => "AV1",
        }
    }
}

impl std::str::FromStr for Codec {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_ascii_lowercase().as_str() {
            "h264" | "avc" => Ok(Self::H264),
            "h265" | "hevc" => Ok(Self::H265),
            "av1" => Ok(Self::AV1),
            _ => Err(format!("unknown codec: {s}")),
        }
    }
}

impl std::fmt::Display for Codec {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.display_name())
    }
}

/// H.264 profile for encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum H264Profile {
    /// Constrained Baseline — broadest compatibility, no B-frames.
    ConstrainedBaseline,

    /// Main — good balance of quality and compatibility.
    Main,

    /// High — best quality, broadest feature set.
    High,
}

/// H.265/HEVC profile for encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum H265Profile {
    /// Main — 8-bit 4:2:0 content.
    Main,

    /// Main 10 — 10-bit 4:2:0 content.
    Main10,
}

/// Configuration for a hardware video encoder session.
#[derive(Debug, Clone)]
pub struct EncoderConfig {
    /// Frame width in pixels.
    pub width: u32,

    /// Frame height in pixels.
    pub height: u32,

    /// Target frame rate (frames per second).
    pub fps: f64,

    /// Target average bitrate in bits per second.
    pub bitrate_bps: u32,

    /// Maximum bitrate in bits per second (hard cap).  0 = no limit.
    pub max_bitrate_bps: u32,

    /// Video codec to use.
    pub codec: Codec,

    /// H.264 profile (used when `codec == Codec::H264`).
    pub h264_profile: H264Profile,

    /// H.265 profile (used when `codec == Codec::H265`).
    pub h265_profile: H265Profile,

    /// Whether to enable real-time encoding mode.
    pub realtime: bool,
}

/// AV1 profile for encoding.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AV1Profile {
    /// Main — 8-bit and 10-bit 4:2:0 content.
    Main,
}

impl Default for EncoderConfig {
    fn default() -> Self {
        Self {
            width: 1920,
            height: 1080,
            fps: 60.0,
            bitrate_bps: 8_000_000, // 8 Mbps
            max_bitrate_bps: 0,     // no hard cap
            codec: Codec::H264,
            h264_profile: H264Profile::High,
            h265_profile: H265Profile::Main,
            realtime: true,
        }
    }
}

impl EncoderConfig {
    /// Check settings before opening any hardware session.
    pub fn validate(&self) -> Result<(), crate::EncoderError> {
        if self.width == 0
            || self.height == 0
            || i32::try_from(self.width).is_err()
            || i32::try_from(self.height).is_err()
        {
            return Err(crate::EncoderError::InvalidConfig(
                "dimensions must be positive signed 32-bit integers".into(),
            ));
        }
        validate_fps(self.fps)?;
        validate_bitrate(self.bitrate_bps, self.max_bitrate_bps)
    }
}

pub(crate) fn validate_fps(fps: f64) -> Result<(), crate::EncoderError> {
    // NVENC represents the rate as fps * 1000 over a denominator of 1000.
    if !fps.is_finite() || fps < 0.001 || fps > f64::from(u32::MAX) / 1000.0 {
        return Err(crate::EncoderError::InvalidConfig(
            "fps must be finite and representable as a positive milliframe rate".into(),
        ));
    }
    Ok(())
}

pub(crate) fn validate_bitrate(average: u32, maximum: u32) -> Result<(), crate::EncoderError> {
    if average == 0 || (maximum != 0 && maximum < average) {
        return Err(crate::EncoderError::InvalidConfig(
            "average bitrate must be positive and not exceed a nonzero maximum".into(),
        ));
    }
    Ok(())
}
