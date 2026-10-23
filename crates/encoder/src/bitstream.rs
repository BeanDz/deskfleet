//! Platform-independent conversion used for VideoToolbox samples.

/// Append complete length-prefixed NAL units as Annex B; reject truncated data.
pub(crate) fn convert_avcc_to_annex_b(
    mut data: &[u8],
    header_length: usize,
    output: &mut Vec<u8>,
) -> Option<()> {
    if !matches!(header_length, 1 | 2 | 4) {
        return None;
    }
    while !data.is_empty() {
        let header = data.get(..header_length)?;
        let length = header
            .iter()
            .fold(0_usize, |value, byte| (value << 8) | usize::from(*byte));
        data = &data[header_length..];
        let nalu = data.get(..length)?;
        if nalu.is_empty() {
            return None;
        }
        output.extend_from_slice(&[0, 0, 0, 1]);
        output.extend_from_slice(nalu);
        data = &data[length..];
    }
    Some(())
}

pub(crate) fn time_to_nanoseconds(value: i64, timescale: i32) -> u64 {
    let (Ok(value), Ok(timescale)) = (u64::try_from(value), u32::try_from(timescale)) else {
        return 0;
    };
    if timescale == 0 {
        return 0;
    }
    u64::try_from(u128::from(value) * 1_000_000_000 / u128::from(timescale)).unwrap_or(u64::MAX)
}
