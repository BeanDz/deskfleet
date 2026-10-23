# deskfleet daemon

`@deskfleet/daemon` is a foreground TypeScript process that runs independently of
the desktop app. It reports native platform information, serves a loopback health
endpoint, and runs Codex CLI sessions over ACP.

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

## Codex through ACP

The daemon uses the [Codex ACP adapter](https://github.com/agentclientprotocol/codex-acp)
to connect the installed Codex CLI to ACP. The adapter is a pinned pnpm dependency
and ships inside the SEA executable. Install and authenticate Codex CLI before
sending prompts; the daemon uses that CLI's credentials.

After `mise run install`, check ACP initialization or run one prompt from source:

```sh
mise exec -- node apps/daemon/src/main.ts agent codex --check
mise exec -- node apps/daemon/src/main.ts agent codex --cwd /path/to/repository --prompt 'Explain this repository'
```

`--check` initializes ACP and exits without creating a session or sending a
prompt. A prompt invocation creates one ACP session, prints newline-delimited
JSON events for initialization, session creation, updates, and the stop reason,
then closes the connection. On Unix, SIGINT cancels the active prompt.

Agent configuration uses these common options:

| Option | Meaning |
| --- | --- |
| `--name <label>` | User-facing label, defaulting to `Codex`, separate from the `codex` provider ID |
| `--binary-path <executable>` | Codex CLI executable; omitted or empty uses `codex` on PATH |
| `--env KEY=value` | Add or override an environment variable; repeat for multiple keys |

The selected binary path takes precedence over `CODEX_PATH` in the environment.
`--cwd` sets the ACP session's working directory and defaults to the current
directory. The returned `sessionId` is the provider's session ID; this command
does not register a deskfleet Worktree or AgentSession.

The CLI cancels permission requests and emits `permission_cancelled` events.
It has no approval UI; prompts requiring approval cannot proceed through it.

The packaged executable accepts the same arguments:

```sh
./apps/daemon/dist/deskfleet-daemon agent codex --check
```

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
