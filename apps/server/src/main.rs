use actix_web::{App, HttpServer, web};
use deskfleet_server::{config::ServerConfig, configure};
use deskfleet_store::Catalog;
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
    let database = deskfleet_store::connect(&config.database_url)
        .await
        .map_err(std::io::Error::other)?;
    let catalog = web::Data::new(Catalog::new(database));
    let server = HttpServer::new(move || App::new().app_data(catalog.clone()).configure(configure))
        .bind(config.bind_addr)?;

    for address in server.addrs() {
        tracing::info!(%address, "deskfleet server listening");
    }

    server.run().await
}
