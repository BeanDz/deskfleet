//! Startup configuration for the HTTP listener.

use std::{env, io, net::SocketAddr};

/// Configuration resolved before the server starts accepting connections.
#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub bind_addr: SocketAddr,
}

impl ServerConfig {
    /// Read `DESKFLEET_BIND_ADDR`, defaulting to `127.0.0.1:8080`.
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
