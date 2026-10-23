import { DAEMON_HOST_ARGUMENT } from "../shared/daemon-launch.ts"

// Await routing before Electron becomes ready: the daemon sets its own data
// directory and must never acquire the client's single-instance lock.
if (process.argv.includes(DAEMON_HOST_ARGUMENT)) {
  const { startDaemonHost } = await import("./daemon-host.ts")
  startDaemonHost()
} else {
  await import("./client.ts")
}
