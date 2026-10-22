# deskfleet-node

This crate is the Node-API boundary over `deskfleet-native`. The initial export,
`nativeInfo()`, reports the addon version and Rust target OS/architecture without
initializing a graphical subsystem.

Build the native library from the repository root:

```sh
mise exec -- cargo build -p deskfleet-node --locked
```

Cargo produces a platform library in `target/debug`: `libdeskfleet_node.dylib` on
macOS, `libdeskfleet_node.so` on Linux, or `deskfleet_node.dll` on Windows. It can
be loaded with Node's `process.dlopen()` for development; normal npm distribution
will use the `.node` extension and a platform-aware loader.

CI builds the native library and server across the supported host platforms; see
the [CI workflow](../../agents/docs/ci.md). The TypeScript package, generated
declarations, SEA asset extraction, and Electron packaging are not implemented yet.
