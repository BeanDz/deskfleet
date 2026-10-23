use std::collections::HashMap;
use std::sync::Arc;

use bytes::Bytes;
use tokio::sync::{Mutex, broadcast};
use webrtc::data_channel::RTCDataChannel;
use webrtc::data_channel::data_channel_state::RTCDataChannelState;

use super::{PeerError, PeerEvent, Result};

pub const MAX_DATA_MESSAGE_SIZE: usize = 65_536;
const MAX_BUFFERED_AMOUNT: usize = 1_048_576;

pub(super) struct Channel {
    pub(super) rtc: Arc<RTCDataChannel>,
    // Checking buffered_amount and sending must be serialized for this bound.
    writes: Mutex<()>,
}

pub(super) type Channels = Arc<Mutex<HashMap<String, Arc<Channel>>>>;

pub(super) async fn register(
    channel: Arc<RTCDataChannel>,
    channels: &Channels,
    events: &broadcast::Sender<PeerEvent>,
) -> Result<()> {
    let label = channel.label().to_owned();
    {
        let mut map = channels.lock().await;
        if map.contains_key(&label) {
            return Err(PeerError::DuplicateDataChannel(label));
        }
        map.insert(
            label.clone(),
            Arc::new(Channel {
                rtc: Arc::clone(&channel),
                writes: Mutex::new(()),
            }),
        );
    }

    let open_events = events.clone();
    let open_label = label.clone();
    channel.on_open(Box::new(move || {
        Box::pin(async move {
            let _ = open_events.send(PeerEvent::DataChannelOpen { label: open_label });
        })
    }));

    let close_events = events.clone();
    let close_label = label.clone();
    let weak_channels = Arc::downgrade(channels);
    channel.on_close(Box::new(move || {
        let events = close_events.clone();
        let label = close_label.clone();
        let channels = weak_channels.clone();
        Box::pin(async move {
            if let Some(channels) = channels.upgrade() {
                channels.lock().await.remove(&label);
            }
            let _ = events.send(PeerEvent::DataChannelClosed { label });
        })
    }));

    let message_events = events.clone();
    channel.on_message(Box::new(move |message| {
        let events = message_events.clone();
        let label = label.clone();
        Box::pin(async move {
            if message.data.len() > MAX_DATA_MESSAGE_SIZE {
                let _ = events.send(PeerEvent::Error(PeerError::MessageTooLarge.to_string()));
                return;
            }
            let _ = events.send(PeerEvent::Data {
                label,
                data: message.data,
                is_string: message.is_string,
            });
        })
    }));

    let error_events = events.clone();
    channel.on_error(Box::new(move |error| {
        let events = error_events.clone();
        Box::pin(async move {
            let _ = events.send(PeerEvent::Error(error.to_string()));
        })
    }));
    Ok(())
}

async fn find(channels: &Channels, label: &str) -> Result<Arc<Channel>> {
    channels
        .lock()
        .await
        .get(label)
        .cloned()
        .ok_or_else(|| PeerError::DataChannelNotOpen(label.to_owned()))
}

async fn check_send(channel: &Channel, size: usize) -> Result<()> {
    if channel.rtc.ready_state() != RTCDataChannelState::Open {
        return Err(PeerError::DataChannelNotOpen(
            channel.rtc.label().to_owned(),
        ));
    }
    if size > MAX_DATA_MESSAGE_SIZE {
        return Err(PeerError::MessageTooLarge);
    }
    if channel.rtc.buffered_amount().await > (MAX_BUFFERED_AMOUNT - size) {
        return Err(PeerError::Backpressure);
    }
    Ok(())
}

pub(super) async fn send_data(channels: &Channels, label: &str, data: &Bytes) -> Result<()> {
    let channel = find(channels, label).await?;
    let _write = channel.writes.lock().await;
    check_send(&channel, data.len()).await?;
    channel.rtc.send(data).await?;
    Ok(())
}

pub(super) async fn send_text(channels: &Channels, label: &str, text: &str) -> Result<()> {
    let channel = find(channels, label).await?;
    let _write = channel.writes.lock().await;
    check_send(&channel, text.len()).await?;
    channel.rtc.send_text(text).await?;
    Ok(())
}
