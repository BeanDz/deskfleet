//! Opus audio encoder wrapping `libopus` via the `opus` crate.

use crate::error::EncoderError;

/// An encoded Opus packet.
#[derive(Debug, Clone)]
pub struct OpusPacket {
    /// Encoded Opus data.
    pub data: Vec<u8>,

    /// Duration of this packet in nanoseconds.
    pub duration_ns: u64,
}

/// Configuration for an Opus encoder.
#[derive(Debug, Clone)]
pub struct OpusEncoderConfig {
    /// Sample rate in Hz (must be 8000, 12000, 16000, 24000, or 48000).
    pub sample_rate: u32,

    /// Number of audio channels (1 = mono, 2 = stereo).
    pub channels: u16,

    /// Target bitrate in bits per second.
    pub bitrate_bps: u32,
}

impl Default for OpusEncoderConfig {
    fn default() -> Self {
        Self {
            sample_rate: 48_000,
            channels: 2,
            bitrate_bps: 128_000,
        }
    }
}

/// Opus audio encoder that accumulates PCM samples and outputs
/// fixed-duration (20 ms) Opus packets.
pub struct OpusEncoder {
    encoder: opus::Encoder,
    channels: u16,
    frame_size: usize,
    frame_duration_ns: u64,
    buffer: Vec<f32>,
    output_buf: Vec<u8>,
}

impl OpusEncoder {
    /// Create a new Opus encoder with the given configuration.
    pub fn new(config: &OpusEncoderConfig) -> Result<Self, EncoderError> {
        if !matches!(config.sample_rate, 8000 | 12000 | 16000 | 24000 | 48000) {
            return Err(EncoderError::InvalidConfig(
                "unsupported Opus sample rate".into(),
            ));
        }
        if config.bitrate_bps == 0 {
            return Err(EncoderError::InvalidConfig(
                "Opus bitrate must be positive".into(),
            ));
        }
        let channels = match config.channels {
            1 => opus::Channels::Mono,
            2 => opus::Channels::Stereo,
            n => {
                return Err(EncoderError::InvalidConfig(format!(
                    "unsupported channel count: {n} (must be 1 or 2)"
                )));
            }
        };

        let mut encoder =
            opus::Encoder::new(config.sample_rate, channels, opus::Application::Audio).map_err(
                |e| EncoderError::Platform(format!("opus encoder creation failed: {e}")),
            )?;

        encoder
            .set_bitrate(opus::Bitrate::Bits(config.bitrate_bps.try_into().map_err(
                |_| EncoderError::InvalidConfig("bitrate too large".into()),
            )?))
            .map_err(|e| EncoderError::Platform(format!("failed to set opus bitrate: {e}")))?;

        // 20 ms frame at the configured sample rate.
        let frame_size = (config.sample_rate as usize) / 50; // 960 for 48 kHz
        let frame_duration_ns = 20_000_000; // 20 ms

        Ok(Self {
            encoder,
            channels: config.channels,
            frame_size,
            frame_duration_ns,
            buffer: Vec::new(),
            // Max Opus packet size is ~4000 bytes; 8000 is generous.
            output_buf: vec![0u8; 8000],
        })
    }

    /// Feed interleaved float32 PCM samples and get back encoded Opus packets.
    ///
    /// The input must be interleaved: for stereo, `[L0, R0, L1, R1, ...]`.
    /// Returns zero or more packets — one for each full 20 ms frame available.
    pub fn encode(&mut self, samples: &[f32]) -> Result<Vec<OpusPacket>, EncoderError> {
        self.buffer.extend_from_slice(samples);

        let samples_per_frame = self.frame_size * self.channels as usize;
        let mut packets = Vec::new();

        let full_frames = self.buffer.len() / samples_per_frame;
        for frame in self.buffer[..full_frames * samples_per_frame].chunks_exact(samples_per_frame)
        {
            let len = self
                .encoder
                .encode_float(frame, &mut self.output_buf)
                .map_err(|e| EncoderError::Platform(format!("opus encode failed: {e}")))?;
            packets.push(OpusPacket {
                data: self.output_buf[..len].to_vec(),
                duration_ns: self.frame_duration_ns,
            });
        }
        // Move any trailing partial frame only once per capture chunk.
        self.buffer.drain(..full_frames * samples_per_frame);

        Ok(packets)
    }

    /// Flush any remaining buffered samples by padding with silence.
    ///
    /// Call this when the capture stream ends to get any trailing audio.
    pub fn flush(&mut self) -> Result<Vec<OpusPacket>, EncoderError> {
        if self.buffer.is_empty() {
            return Ok(Vec::new());
        }

        // Pad with silence to fill a complete frame.
        let samples_per_frame = self.frame_size * self.channels as usize;
        self.buffer.resize(samples_per_frame, 0.0);

        let len = self
            .encoder
            .encode_float(&self.buffer, &mut self.output_buf)
            .map_err(|e| EncoderError::Platform(format!("opus flush failed: {e}")))?;

        self.buffer.clear();

        Ok(vec![OpusPacket {
            data: self.output_buf[..len].to_vec(),
            duration_ns: self.frame_duration_ns,
        }])
    }
}
