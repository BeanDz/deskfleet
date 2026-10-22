# deskfleet server

The Actix Web backend currently exposes `GET /healthz` for process liveness.

## Run

From the repository root:

```sh
mise run dev
```

The default listener is `127.0.0.1:8080`.

```sh
DESKFLEET_BIND_ADDR=127.0.0.1:9090 RUST_LOG=info mise run dev
```

`DESKFLEET_BIND_ADDR` accepts an IP address and port, including IPv6 addresses such
as `[::1]:8080`. Hostnames are not accepted. Invalid values fail at startup. Port
`0` requests an available port, and the startup log reports the actual address.
Actix handles shutdown signals using its standard graceful shutdown behavior.

## Liveness

```sh
curl http://127.0.0.1:8080/healthz
```

The JSON response includes `status`, the server `version`, and `protocol_version`.
This route reports process liveness.

## Check

```sh
mise exec -- cargo test -p deskfleet-server --locked
```
