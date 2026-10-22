use actix_web::{App, HttpServer};
use deskfleet_server::{config::ServerConfig, configure};
use tracing_subscriber::EnvFilter;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info")),
        )
        .try_init()
        .map_err(std::io::Error::other)?;

    let config = ServerConfig::from_env()?;
    let server = HttpServer::new(|| App::new().configure(configure)).bind(config.bind_addr)?;

    for address in server.addrs() {
        tracing::info!(%address, "deskfleet server listening");
    }

    server.run().await
}
