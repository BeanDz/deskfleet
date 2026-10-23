import { spawn } from "node:child_process"
import { mkdir, open, stat } from "node:fs/promises"
import { join } from "node:path"
import { setTimeout as delay } from "node:timers/promises"
import { DaemonClient } from "@deskfleet/daemon/control-client"
import { daemonDiscoveryPath } from "@deskfleet/daemon/control-discovery"
import type { LocalAgentRuntime } from "./local-agent-controller.ts"
import { DAEMON_HOST_ARGUMENT } from "../shared/daemon-launch.ts"
import type { ScreenCapturePermission } from "../shared/local-agent.ts"

export interface LocalAgentLaunchOptions {
  executable: string
  appPath: string
  packaged: boolean
  directory: string
}

/** Shares Electron's bundled runtime, but has no IPC/lifetime tie to its parent. */
export function createLocalAgentRuntime(options: LocalAgentLaunchOptions): LocalAgentRuntime {
  return {
    async connect(onDisconnect, onPermissionChanged) {
      let permission: ScreenCapturePermission | undefined
      const client = await DaemonClient.connect(event => {
        if (event.kind !== "screenCapturePermissionChanged") return
        permission = event.permission
        onPermissionChanged(permission)
      }, onDisconnect, options.directory)
      return {
        get closed() { return client.closed },
        // Events can arrive alongside hello, before connect() resolves.
        get screenCapturePermission() { return permission ?? client.info!.screenCapturePermission },
        shutdown: async () => { await client.call("shutdown", {}) },
        close: () => client.close(),
      }
    },
    async launch() {
      await mkdir(options.directory, { recursive: true, mode: 0o700 })
      const logPath = join(options.directory, "daemon.log")
      const log = await open(logPath, "a", 0o600)
      try {
        const args = options.packaged ? [] : [options.appPath]
        args.push(DAEMON_HOST_ARGUMENT)
        const env: NodeJS.ProcessEnv = { ...process.env, DESKFLEET_DAEMON_DIRECTORY: options.directory }
        delete env.DESKFLEET_RENDERER_URL
        delete env.ELECTRON_RUN_AS_NODE
        const child = spawn(options.executable, args, {
          cwd: options.directory,
          env,
          detached: true,
          windowsHide: true,
          stdio: ["ignore", log.fd, log.fd],
        })
        const launched: { error?: Error } = {}
        child.once("exit", (code, signal) => {
          launched.error = new Error(`Local Agent exited (${signal ?? code}); see ${logPath}`)
        })
        await new Promise<void>((resolve, reject) => {
          child.once("spawn", resolve)
          child.once("error", error => { launched.error = error; reject(error) })
        })
        child.unref()
        return launched
      } finally { await log.close() }
    },
    async waitForShutdown() {
      const deadline = Date.now() + 15_000
      for (;;) {
        try { await stat(daemonDiscoveryPath(options.directory)) }
        catch (error) {
          if (error instanceof Error && "code" in error && error.code === "ENOENT") return
          throw error
        }
        if (Date.now() >= deadline) throw new Error("Local Agent is still shutting down; check daemon.log in the daemon directory")
        await delay(100)
      }
    },
  }
}
