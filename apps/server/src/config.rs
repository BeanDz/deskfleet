//! Startup configuration for the HTTP listener and catalog database.

use std::{env, io, net::SocketAddr};

/// Configuration resolved before the server starts accepting connections.
#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub bind_addr: SocketAddr,
    pub database_url: String,
}

impl ServerConfig {
    /// Read the listener address and `DATABASE_URL` for the SQLite catalog.
    pub fn from_env() -> io::Result<Self> {
        let value = match env::var("DESKFLEET_BIND_ADDR") {
            Ok(value) => value,
            Err(env::VarError::NotPresent) => "127.0.0.1:8080".to_owned(),
            Err(env::VarError::NotUnicode(_)) => {
                return Err(io::Error::new(
                    io::ErrorKind::InvalidInput,
                    "DESKFLEET_BIND_ADDR must contain valid Unicode",
                ));
            }
        };

        Ok(Self {
            bind_addr: parse_bind_addr(&value)?,
            database_url: match env::var("DATABASE_URL") {
                Ok(value) if !value.is_empty() => value,
                Ok(_) => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "DATABASE_URL must not be empty",
                    ));
                }
                Err(env::VarError::NotPresent) => "sqlite://deskfleet.db?mode=rwc".to_owned(),
                Err(env::VarError::NotUnicode(_)) => {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        "DATABASE_URL must contain valid Unicode",
                    ));
                }
            },
        })
    }
}

fn parse_bind_addr(value: &str) -> io::Result<SocketAddr> {
    value.parse().map_err(|error| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            format!(
                "invalid DESKFLEET_BIND_ADDR {value:?}: expected an IP address and port ({error})"
            ),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::parse_bind_addr;
    use std::io;

    #[test]
    fn rejects_invalid_listener_configuration() {
        for value in ["", "127.0.0.1", "127.0.0.1:65536", "localhost:8080"] {
            let error = parse_bind_addr(value).expect_err("invalid listener address");
            assert_eq!(error.kind(), io::ErrorKind::InvalidInput);
            assert!(error.to_string().contains("DESKFLEET_BIND_ADDR"));
        }
    }
}
