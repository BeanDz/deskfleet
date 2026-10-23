//! Test-only peer for `mise run desktop:smoke-media`. No screen capture is used.

use std::io::{self, BufRead};
use std::time::Duration;

use bytes::Bytes;
use deskfleet_native::rtc::{IceCandidate, Peer, PeerConfig, PeerEvent, PeerState, VideoCodec};
use serde::Deserialize;
use serde_json::json;
use tokio::sync::mpsc;

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
enum Command {
    Offer { sdp: String },
    Candidate { candidate: Candidate },
    Close,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    candidate: String,
    sdp_mid: Option<String>,
    sdp_mline_index: Option<u16>,
    username_fragment: Option<String>,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let peer = Peer::new(PeerConfig {
        video: Some(VideoCodec::H264),
        audio: true,
        ..Default::default()
    })
    .await?;
    let (sender, mut commands) = mpsc::channel(8);
    std::thread::spawn(move || {
        for line in io::stdin().lock().lines() {
            let parsed = line
                .map_err(|error| error.to_string())
                .and_then(|line| serde_json::from_str(&line).map_err(|error| error.to_string()));
            if sender.blocking_send(parsed).is_err() {
                break;
            }
        }
    });
    // Every sample is a complete SPS/PPS/IDR access unit, so repeating it is valid.
    let frame = Bytes::from_static(include_bytes!("fixtures/red-64x64.h264"));
    let mut ticks = tokio::time::interval(Duration::from_millis(100));
    let mut connected = false;
    println!("{}", json!({ "kind": "ready" }));
    let result: Result<(), Box<dyn std::error::Error>> = async {
        loop {
            tokio::select! {
                command = commands.recv() => match command {
                    Some(Ok(Command::Offer { sdp })) => {
                        let answer = peer.answer_offer(sdp).await?;
                        println!("{}", json!({ "kind": "answer", "sdp": answer }));
                    }
                    Some(Ok(Command::Candidate { candidate })) => {
                        peer.add_ice_candidate(IceCandidate {
                            candidate: candidate.candidate,
                            sdp_mid: candidate.sdp_mid,
                            sdp_mline_index: candidate.sdp_mline_index,
                            username_fragment: candidate.username_fragment,
                        }).await?;
                    }
                    Some(Ok(Command::Close)) | None => break,
                    Some(Err(error)) => return Err(error.into()),
                },
                event = peer.next_event() => match event? {
                    Some(PeerEvent::IceCandidate(Some(candidate))) => {
                        println!("{}", json!({ "kind": "candidate", "candidate": {
                            "candidate": candidate.candidate,
                            "sdpMid": candidate.sdp_mid,
                            "sdpMlineIndex": candidate.sdp_mline_index,
                            "usernameFragment": candidate.username_fragment,
                        }}));
                    }
                    Some(PeerEvent::StateChanged(state)) => {
                        connected = state == PeerState::Connected;
                        if state == PeerState::Failed {
                            return Err("native peer connection failed".into());
                        }
                    }
                    Some(PeerEvent::Data { label, data, is_string }) => {
                        if is_string {
                            peer.send_text(&label, std::str::from_utf8(&data)?).await?;
                        } else {
                            peer.send_data(&label, data).await?;
                        }
                    }
                    Some(PeerEvent::Error(error)) => return Err(error.into()),
                    None => break,
                    _ => {},
                },
                _ = ticks.tick(), if connected => {
                    peer.write_video(frame.clone(), Duration::from_millis(100)).await?;
                    // One valid 20 ms Opus silence packet, repeated five times per tick.
                    for _ in 0..5 {
                        peer.write_audio(Bytes::from_static(&[0xf8, 0xff, 0xfe]), Duration::from_millis(20)).await?;
                    }
                },
            }
        }
        Ok(())
    }.await;
    peer.close().await?;
    result
}
