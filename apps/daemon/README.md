# deskfleet daemon

`@deskfleet/daemon` is a foreground TypeScript process that runs independently of
the desktop app. The current entry point loads `@deskfleet/native`, reports
native platform information, and serves a loopback health endpoint.

## Development

From the repository root:

```sh
mise run daemon:dev
```

This builds the debug addon and starts the TypeScript entry point. The daemon
binds `127.0.0.1` on an available port and prints one ready event:

```json
{"event":"ready","address":"http://127.0.0.1:49152"}
```

`GET /healthz` returns `status: "ok"` and the Rust addon's `version`, `os`, and
`arch` under `native`.

Use `--port 8081` to select a port. `--info` prints native information plus the
Node runtime version and whether the process is a SEA, then exits. For example,
after the debug build:

```sh
mise exec -- node apps/daemon/src/main.ts --info
mise exec -- node apps/daemon/src/main.ts --port 8081
```

On Unix, SIGINT and SIGTERM close the listener and exit cleanly.

## Standalone executable

```sh
mise run build
mise run daemon:smoke
```

The build embeds JavaScript and the native addon in
`apps/daemon/dist/deskfleet-daemon` (`deskfleet-daemon.exe` on Windows). This file
runs by itself without a Node installation or adjacent addon:

```sh
./apps/daemon/dist/deskfleet-daemon --info
./apps/daemon/dist/deskfleet-daemon --port 8081
```

Use `mise run daemon:pack` to build just the standalone daemon.

Packaging uses the mise-selected Node executable, esbuild, and postject. macOS
builds receive an ad-hoc signature; release signing and notarization are not
configured.

The native addon is extracted into a private temporary directory before loading.
Unix removes it after loading. Windows attempts removal on exit, but mapped DLLs
may remain until the temporary directory is cleaned.

Supported platforms are Linux x64/arm64, macOS arm64, and Windows x64. See the
[CI guide](../../agents/docs/ci.md) for build artifacts and smoke tests.
