//! HTTP entry points for the deskfleet control plane.

pub mod config;

use actix_web::{web, web::ServiceConfig};
use deskfleet_protocol::HealthResponse;

/// Register the currently implemented HTTP routes.
pub fn configure(config: &mut ServiceConfig) {
    config.route("/healthz", web::get().to(health));
}

async fn health() -> web::Json<HealthResponse> {
    web::Json(HealthResponse::ok(env!("CARGO_PKG_VERSION")))
}
