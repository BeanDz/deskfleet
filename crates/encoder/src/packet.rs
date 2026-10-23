/// A single encoded video packet.
///
/// For H.264/H.265: Annex B format (NALUs with 0x00000001 start codes).
/// For AV1: raw OBU (Open Bitstream Unit) data.
#[derive(Debug, Clone)]
pub struct EncodedPacket {
    /// Encoded data (Annex B for H.264/H.265, raw OBUs for AV1).
    pub data: Vec<u8>,

    /// Presentation timestamp in nanoseconds.
    pub timestamp_ns: u64,

    /// Duration in nanoseconds (0 if unknown).
    pub duration_ns: u64,

    /// Whether this packet contains a keyframe.
    pub is_keyframe: bool,
}
