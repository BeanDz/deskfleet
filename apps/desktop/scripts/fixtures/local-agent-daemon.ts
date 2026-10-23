import { startDaemon } from "@deskfleet/daemon"
import { startDaemonHost } from "../../src/main/daemon-host.ts"

// Exercise the production host and daemon with a deterministic consent result.
// Automated smoke runs must never display operating-system permission prompts.
startDaemonHost(() => startDaemon(0, { requestScreenCaptureAccess: async () => false }))
