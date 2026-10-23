# deskfleet-node / @deskfleet/native

This crate exposes `deskfleet-native` through napi-rs. Its private pnpm package,
`@deskfleet/native`, exports `nativeInfo()` with the addon version and Rust target
OS/architecture.

Build from the repository root:

```sh
mise run native:debug
mise run native:release
```

The napi-rs CLI builds `deskfleet.node` and generates `bindings.d.ts`. Keep the
declarations in source control and regenerate them when the Rust exports change;
the binary is ignored.

The TypeScript loader calls `process.dlopen()` on the built addon. For a SEA
executable it instead extracts the embedded `deskfleet.node` asset into a private
temporary directory before loading.

See the [daemon guide](../../apps/daemon/README.md) for packaging and the
[CI workflow](../../agents/docs/ci.md) for platform checks.
