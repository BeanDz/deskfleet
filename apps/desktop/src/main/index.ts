import { fileURLToPath } from "node:url"
import { bundledAdapter, configureAdapterHost } from "@deskfleet/daemon/adapters"

// Await routing before Electron becomes ready: the adapter runs in Electron's
// Node mode and must never acquire the client's single-instance lock.
const adapter = bundledAdapter(process.argv)
if (adapter) {
  await adapter()
} else {
  // The daemon hosted by this app starts bundled adapters through the same executable.
  configureAdapterHost({
    command: process.execPath,
    args: [fileURLToPath(import.meta.url)],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  })
  await import("./client.ts")
}
