import { fileURLToPath } from "node:url"
import { CODEX_ACP_ARGUMENT, configureCodexAdapterHost, runCodexAdapter } from "@deskfleet/daemon/codex"
import { DAEMON_HOST_ARGUMENT } from "../shared/daemon-launch.ts"

// Await routing before Electron becomes ready: the daemon sets its own data
// directory and must never acquire the client's single-instance lock.
if (process.argv.includes(CODEX_ACP_ARGUMENT)) {
  await runCodexAdapter()
} else if (process.argv.includes(DAEMON_HOST_ARGUMENT)) {
  configureCodexAdapterHost({
    command: process.execPath,
    args: [fileURLToPath(import.meta.url), CODEX_ACP_ARGUMENT],
    env: { ELECTRON_RUN_AS_NODE: "1" },
  })
  const { startDaemonHost } = await import("./daemon-host.ts")
  startDaemonHost()
} else {
  await import("./client.ts")
}
