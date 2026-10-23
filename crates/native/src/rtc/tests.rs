use super::*;

async fn connect(left: &Peer, right: &Peer) {
    left.create_data_channel("operations".to_owned())
        .await
        .unwrap();
    let offer = left.create_offer().await.unwrap();
    let answer = right.answer_offer(offer).await.unwrap();
    left.accept_answer(answer).await.unwrap();
    tokio::time::timeout(Duration::from_secs(15), async {
        let mut left_open = false;
        let mut right_open = false;
        while !left_open || !right_open {
            tokio::select! {
                event = left.next_event() => match event.unwrap().unwrap() {
                    PeerEvent::IceCandidate(Some(candidate)) => right.add_ice_candidate(candidate).await.unwrap(),
                    PeerEvent::DataChannelOpen { label } => { assert_eq!(label, "operations"); left_open = true; }
                    PeerEvent::Error(error) => panic!("left peer: {error}"),
                    _ => {},
                },
                event = right.next_event() => match event.unwrap().unwrap() {
                    PeerEvent::IceCandidate(Some(candidate)) => left.add_ice_candidate(candidate).await.unwrap(),
                    PeerEvent::DataChannelOpen { label } => { assert_eq!(label, "operations"); right_open = true; }
                    PeerEvent::Error(error) => panic!("right peer: {error}"),
                    _ => {},
                },
            }
        }
    }).await.expect("local peers should connect");
}

async fn next_data(peer: &Peer) -> (String, Bytes, bool) {
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match peer.next_event().await.unwrap().unwrap() {
                PeerEvent::Data {
                    label,
                    data,
                    is_string,
                } => return (label, data, is_string),
                PeerEvent::Error(error) => panic!("data channel: {error}"),
                _ => {}
            }
        }
    })
    .await
    .expect("data should arrive")
}

#[tokio::test]
async fn headless_peers_exchange_binary_and_text_then_close() {
    let left = Peer::new(PeerConfig::default()).await.unwrap();
    let right = Peer::new(PeerConfig::default()).await.unwrap();
    connect(&left, &right).await;

    let binary = Bytes::from_static(&[0, 0xff, b'a']);
    left.send_data("operations", binary.clone()).await.unwrap();
    assert_eq!(
        next_data(&right).await,
        ("operations".to_owned(), binary, false)
    );
    right
        .send_text("operations", "terminal ready")
        .await
        .unwrap();
    assert_eq!(
        next_data(&left).await,
        (
            "operations".to_owned(),
            Bytes::from_static(b"terminal ready"),
            true
        )
    );
    assert!(matches!(
        left.send_data(
            "operations",
            Bytes::from(vec![0; MAX_DATA_MESSAGE_SIZE + 1])
        )
        .await,
        Err(PeerError::MessageTooLarge)
    ));

    tokio::time::timeout(Duration::from_secs(5), async {
        let (left_result, right_result) = tokio::join!(left.close(), right.close());
        left_result.unwrap();
        right_result.unwrap();
        left.close().await.unwrap();
        while left.next_event().await.unwrap().is_some() {}
    })
    .await
    .expect("close must not depend on an event consumer");
    assert!(left.is_closed());
    assert!(matches!(
        left.send_text("operations", "closed").await,
        Err(PeerError::Closed)
    ));
}

#[tokio::test]
async fn media_tracks_send_h265_and_opus_without_capture() {
    use webrtc::rtp_transceiver::rtp_codec::RTPCodecType;
    let config = PeerConfig {
        video: Some(VideoCodec::H265),
        audio: true,
        ..Default::default()
    };
    let left = Peer::new(config.clone()).await.unwrap();
    let right = Peer::new(config).await.unwrap();
    let (packets, mut received) = tokio::sync::mpsc::channel(8);
    right.pc.on_track(Box::new(move |track, _, _| {
        let packets = packets.clone();
        Box::pin(async move {
            tokio::spawn(async move {
                let (packet, _) = track.read_rtp().await.unwrap();
                packets.send((track.kind(), packet)).await.unwrap();
            });
        })
    }));
    connect(&left, &right).await;
    let video = Bytes::from_static(&[0, 0, 0, 1, 0x26, 1, 0xab, 0xcd]);
    let audio = Bytes::from_static(&[0xf8, 0xff, 0xfe]);
    left.write_video(video, Duration::from_millis(33))
        .await
        .unwrap();
    left.write_audio(audio.clone(), Duration::from_millis(20))
        .await
        .unwrap();
    let mut kinds = Vec::new();
    let mut video_ssrc = 0;
    for _ in 0..2 {
        let (kind, packet) = tokio::time::timeout(Duration::from_secs(5), received.recv())
            .await
            .unwrap()
            .unwrap();
        assert!(packet.header.marker);
        match kind {
            RTPCodecType::Video => {
                assert_eq!(packet.payload.as_ref(), &[0x26, 1, 0xab, 0xcd]);
                video_ssrc = packet.header.ssrc;
            }
            RTPCodecType::Audio => assert_eq!(packet.payload, audio),
            _ => panic!("unexpected track"),
        }
        kinds.push(kind);
    }
    assert!(kinds.contains(&RTPCodecType::Video) && kinds.contains(&RTPCodecType::Audio));
    assert!(left.take_keyframe_request());
    assert!(!left.take_keyframe_request());
    let mut feedback = left.events.subscribe();
    right
        .pc
        .write_rtcp(&[Box::new(
            webrtc::rtcp::payload_feedbacks::picture_loss_indication::PictureLossIndication {
                sender_ssrc: 0,
                media_ssrc: video_ssrc,
            },
        )])
        .await
        .unwrap();
    tokio::time::timeout(Duration::from_secs(5), async {
        while !matches!(feedback.recv().await.unwrap(), PeerEvent::KeyframeRequested) {}
    })
    .await
    .expect("PLI should request an encoder keyframe");
    assert!(left.take_keyframe_request());
    let (a, b) = tokio::join!(left.close(), right.close());
    a.unwrap();
    b.unwrap();
}

#[tokio::test]
async fn rtc_configuration_keeps_turn_credentials_and_relay_policy() {
    let peer = Peer::new(PeerConfig {
        ice_servers: vec![IceServer {
            urls: vec!["turn:127.0.0.1:3478".to_owned()],
            username: "session-user".to_owned(),
            credential: "session-password".to_owned(),
        }],
        relay_only: true,
        ..Default::default()
    })
    .await
    .unwrap();
    let config = peer.pc.get_configuration().await;
    assert_eq!(config.ice_transport_policy, RTCIceTransportPolicy::Relay);
    assert_eq!(config.ice_servers[0].credential, "session-password");
    assert!(peer.video_codec().is_none() && !peer.has_audio());
    peer.close().await.unwrap();
}

#[tokio::test]
async fn bounded_event_queue_reports_lag_and_close_finishes_pending_receive() {
    let peer = Peer::new(PeerConfig::default()).await.unwrap();
    for _ in 0..EVENT_CAPACITY + 1 {
        peer.events.send(PeerEvent::KeyframeRequested).unwrap();
    }
    assert!(matches!(
        peer.next_event().await,
        Err(PeerError::EventsLagged(1))
    ));
    for _ in 0..EVENT_CAPACITY {
        peer.next_event().await.unwrap();
    }
    tokio::time::timeout(Duration::from_secs(5), async {
        let (event, closed) = tokio::join!(peer.next_event(), peer.close());
        closed.unwrap();
        assert!(matches!(
            event.unwrap(),
            None | Some(PeerEvent::StateChanged(PeerState::Closed))
        ));
    })
    .await
    .unwrap();
}

#[tokio::test]
async fn h264_negotiation_rejects_high_profile_but_accepts_browser_level_31() {
    let config = PeerConfig {
        video: Some(VideoCodec::H264),
        ..Default::default()
    };
    let offerer = Peer::new(config.clone()).await.unwrap();
    let answerer = Peer::new(config).await.unwrap();
    let offer = offerer.create_offer().await.unwrap();
    assert!(offer.contains("profile-level-id=42e034"));
    let high_profile = offer.replace("42e034", "640034");
    assert!(matches!(
        answerer.answer_offer(high_profile).await,
        Err(PeerError::IncompatibleVideoCodec)
    ));
    let wrong_packetization = offer.replace("packetization-mode=1", "packetization-mode=0");
    assert!(matches!(
        answerer.answer_offer(wrong_packetization).await,
        Err(PeerError::IncompatibleVideoCodec)
    ));
    let answer = answerer
        .answer_offer(offer.replace("42e034", "42e01f"))
        .await
        .unwrap();
    assert!(answer.contains("video") && answer.contains("H264"));
    offerer.accept_answer(answer).await.unwrap();
    let (a, b) = tokio::join!(offerer.close(), answerer.close());
    a.unwrap();
    b.unwrap();
}
