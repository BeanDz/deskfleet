//! Custom sample track that extends `TrackLocalStaticRTP` with H.265 support.
//!
//! `TrackLocalStaticSample` from webrtc-rs fails for H.265 because its
//! internal `payloader_for_codec()` lookup has no H.265 entry.  This module
//! provides [`SampleTrack`] which does the same job but falls back to our
//! [`H265Payloader`] when the MIME
//! type is `video/H265`.

use std::any::Any;
use std::fmt;

use tokio::sync::Mutex;
use webrtc::error::Result;
use webrtc::media::Sample;
use webrtc::rtp_transceiver::rtp_codec::{
    RTCRtpCodecCapability, RTCRtpCodecParameters, RTPCodecType,
};
use webrtc::track::track_local::track_local_static_rtp::TrackLocalStaticRTP;
use webrtc::track::track_local::{TrackLocal, TrackLocalContext};

/// Default RTP MTU (matches webrtc-rs internal constant).
const RTP_OUTBOUND_MTU: usize = 1200;

use super::h265_payloader::H265Payloader;

// ── Internal state ───────────────────────────────────────────────────

struct SampleTrackInternal {
    packetizer: Option<Box<dyn webrtc::rtp::packetizer::Packetizer + Send + Sync>>,
    clock_rate: u32,
}

// ── SampleTrack ──────────────────────────────────────────────────────

/// A track that accepts [`Sample`]s and packetises them into RTP packets.
///
/// Uses built-in payloaders for H.264, VP8, VP9, AV1 and Opus, and supports
/// H.265 via [`H265Payloader`].
pub struct SampleTrack {
    rtp_track: TrackLocalStaticRTP,
    internal: Mutex<SampleTrackInternal>,
    // Serialize packet writes from concurrent producers to preserve RTP order.
    writes: Mutex<()>,
}

impl fmt::Debug for SampleTrack {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("SampleTrack")
            .field("rtp_track", &self.rtp_track)
            .finish_non_exhaustive()
    }
}

impl SampleTrack {
    /// Create a new sample track with the given codec, id, and stream id.
    pub fn new(codec: RTCRtpCodecCapability, id: String, stream_id: String) -> Self {
        Self {
            rtp_track: TrackLocalStaticRTP::new(codec, id, stream_id),
            internal: Mutex::new(SampleTrackInternal {
                packetizer: None,
                clock_rate: 0,
            }),
            writes: Mutex::new(()),
        }
    }

    /// Write a media sample, packetising it into one or more RTP packets.
    pub async fn write_sample(&self, sample: &Sample) -> Result<()> {
        let _write = self.writes.lock().await;
        if self.rtp_track.all_binding_paused().await {
            return Ok(());
        }
        let mut internal = self.internal.lock().await;

        let clock_rate = internal.clock_rate;
        let Some(ref mut packetizer) = internal.packetizer else {
            return Ok(());
        };

        // RTP timestamps intentionally wrap at 32 bits. Integer arithmetic
        // preserves clock ticks without floating-point rounding.
        let samples = (sample.duration.as_nanos() * u128::from(clock_rate) / 1_000_000_000) as u32;
        if sample.prev_dropped_packets > 0 {
            packetizer.skip_samples(samples.wrapping_mul(u32::from(sample.prev_dropped_packets)));
        }

        let packets = packetizer.packetize(&sample.data, samples)?;
        // Drop the MutexGuard before the async writes.
        drop(internal);

        for p in packets {
            self.rtp_track.write_rtp_with_extensions(&p, &[]).await?;
        }

        Ok(())
    }
}

#[async_trait::async_trait]
impl TrackLocal for SampleTrack {
    async fn bind(&self, t: &TrackLocalContext) -> Result<RTCRtpCodecParameters> {
        let codec = self.rtp_track.bind(t).await?;
        if !super::codecs::profiles_match(&self.rtp_track.codec(), &codec.capability) {
            self.rtp_track.unbind(t).await?;
            return Err(webrtc::Error::ErrUnsupportedCodec);
        }

        let mut internal = self.internal.lock().await;
        if internal.packetizer.is_some() {
            return Ok(codec);
        }

        // Pick the correct payloader — use our H.265 payloader when the
        // built-in lookup would fail.
        let payloader: Box<dyn webrtc::rtp::packetizer::Payloader + Send + Sync> = if codec
            .capability
            .mime_type
            .eq_ignore_ascii_case("video/H265")
        {
            Box::new(H265Payloader)
        } else {
            codec.capability.payloader_for_codec()?
        };

        let sequencer: Box<dyn webrtc::rtp::sequence::Sequencer + Send + Sync> =
            Box::new(webrtc::rtp::sequence::new_random_sequencer());

        internal.packetizer = Some(Box::new(webrtc::rtp::packetizer::new_packetizer(
            RTP_OUTBOUND_MTU,
            0, // Value is handled when writing
            0, // Value is handled when writing
            payloader,
            sequencer,
            codec.capability.clock_rate,
        )));
        internal.clock_rate = codec.capability.clock_rate;
        drop(internal);

        Ok(codec)
    }

    async fn unbind(&self, t: &TrackLocalContext) -> Result<()> {
        self.rtp_track.unbind(t).await
    }

    fn id(&self) -> &str {
        self.rtp_track.id()
    }

    fn stream_id(&self) -> &str {
        self.rtp_track.stream_id()
    }

    fn rid(&self) -> Option<&str> {
        self.rtp_track.rid()
    }

    fn kind(&self) -> RTPCodecType {
        self.rtp_track.kind()
    }

    fn as_any(&self) -> &dyn Any {
        self
    }
}
