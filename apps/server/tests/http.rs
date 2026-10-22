use actix_web::{App, http::StatusCode, test};
use deskfleet_protocol::PROTOCOL_VERSION;
use deskfleet_server::configure;
use serde_json::{Value, json};

#[actix_web::test]
async fn healthz_returns_the_liveness_contract() {
    let app = test::init_service(App::new().configure(configure)).await;
    let response =
        test::call_service(&app, test::TestRequest::get().uri("/healthz").to_request()).await;

    assert_eq!(response.status(), StatusCode::OK);
    assert_eq!(
        response.headers().get("content-type").unwrap(),
        "application/json"
    );
    let body: Value = test::read_body_json(response).await;
    assert_eq!(
        body,
        json!({
            "status": "ok",
            "version": env!("CARGO_PKG_VERSION"),
            "protocol_version": PROTOCOL_VERSION,
        }),
    );
}
