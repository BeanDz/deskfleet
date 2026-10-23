/// A captured audio frame containing interleaved PCM samples.
#[derive(Debug, Clone)]
pub struct AudioFrame {
    /// Interleaved PCM samples (float32, −1.0 to 1.0).
    pub samples: Vec<f32>,

    /// Sample rate in Hz (e.g. 48000).
    pub sample_rate: u32,

    /// Number of audio channels (1 = mono, 2 = stereo).
    pub channels: u16,

    /// Presentation timestamp in nanoseconds.
    pub timestamp_ns: u64,
}

#[cfg(any(target_os = "macos", test))]
pub(crate) fn interleave_stereo(left: &[f32], right: &[f32]) -> Vec<f32> {
    left.iter()
        .zip(right)
        .flat_map(|(&left, &right)| [left, right])
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_stereo_channel_order() {
        assert_eq!(
            interleave_stereo(&[0.1, 0.2, 0.3], &[-0.1, -0.2, -0.3]),
            vec![0.1, -0.1, 0.2, -0.2, 0.3, -0.3]
        );
    }
}
