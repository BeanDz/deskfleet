import { app, BrowserWindow, net, protocol } from "electron"
import { createHash } from "node:crypto"
import { join } from "node:path"
import { pathToFileURL } from "node:url"
import { readDaemonDiscovery } from "@deskfleet/daemon/control-discovery"
import { attachDesktopMedia, installDesktopMediaIpc } from "../../src/main/desktop-media.ts"
import { LocalAgentController } from "../../src/main/local-agent-controller.ts"
import { createLocalAgentRuntime } from "../../src/main/local-agent-runtime.ts"
import { attachLocalAgentSettings, installLocalAgentSettings, publishLocalAgentState } from "../../src/main/local-agent-settings.ts"
import { denyChromiumPermissions, registerRendererScheme, resolveRendererResourcePath } from "../../src/main/renderer-protocol.ts"
import { BUNDLED_RENDERER_URL, RENDERER_SCHEME } from "../../src/shared/renderer-security.ts"
import type { DeskfleetDesktopApi } from "../../src/shared/desktop-api.ts"

export interface LocalAgentSmokeContext {
  phase: "start" | "reuse" | "disabled"
  appPath: string
  rendererDirectory: string
  preloadPath: string
  profileDirectory: string
  daemonDirectory: string
  checkoutPath: string
  workspaceId?: string
  terminalId?: string
}

export interface LocalAgentSmokeResult {
  workspaceId?: string
  terminalId?: string
  stoppedTerminalId?: string
  daemonIdentity?: string
}

// Executes inside the built Vapor renderer with the production preload bridge.
async function exerciseSettings(context: LocalAgentSmokeContext): Promise<LocalAgentSmokeResult> {
  const api = (window as unknown as { deskfleet: DeskfleetDesktopApi }).deskfleet
  function require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
  }
  async function until(predicate: () => boolean | Promise<boolean>, description: string): Promise<void> {
    const deadline = Date.now() + 20_000
    while (!await predicate()) {
      if (Date.now() > deadline) throw new Error(`${description} timed out; renderer: ${document.body.innerText.slice(-3_000)}`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  const toggle = () => document.querySelector<HTMLButtonElement>('main [role="switch"]')
  const addWorkspace = () => document.querySelector<HTMLButtonElement>('button[aria-label="Add workspace"]')
  const sidebarWorkspace = () => [...document.querySelectorAll("aside a")].some(link => link.textContent?.trim() === "Local Agent smoke")
  async function change(enabled: boolean): Promise<void> {
    await until(() => !!toggle() && !toggle()!.disabled, "Local Agent switch")
    require(toggle()!.getAttribute("aria-checked") === String(!enabled), "Switch preference did not match the previous state")
    toggle()!.click()
    await until(async () => {
      const state = await api.settings.get()
      if (state.status === "error") throw new Error(state.error ?? "Local Agent failed")
      return state.enabled === enabled && state.status === (enabled ? "running" : "stopped")
    }, enabled ? "Agent restart" : "Agent stop")
    await until(() => toggle()?.getAttribute("aria-checked") === String(enabled) && !toggle()!.disabled, "Saved Agent preference")
    await until(() => enabled ? !!addWorkspace() && addWorkspace()!.getAttribute("aria-disabled") !== "true" : document.querySelector("aside")!.textContent!.includes("Offline"), "Catalog lifecycle refresh")
  }

  await until(() => !!document.querySelector("main h1") && !!document.querySelector('button[aria-label="Settings"]'), "Initial renderer route")
  document.querySelector<HTMLButtonElement>('button[aria-label="Settings"]')!.click()
  await until(() => !!toggle() && !toggle()!.disabled, "Settings page")
  const initial = await api.settings.get()
  require(document.body.innerText.includes("Quitting deskfleet leaves the local Agent running."), "Settings lifecycle explanation is missing")
  if (context.phase === "disabled") {
    require(!initial.enabled && initial.status === "stopped", "Disabled startup must leave the Agent stopped")
    require(toggle()!.getAttribute("aria-checked") === "false", "Persisted disabled preference was not rendered")
    await until(() => document.querySelector("aside")!.textContent!.includes("Offline"), "Disabled machine status")
    require(!(await api.desktop.target()).online, "Disabled startup unexpectedly connected to a daemon")
    return {}
  }
  require(initial.enabled && initial.status === "running", "Default/reused local Agent must be running")
  await until(() => !!addWorkspace() && addWorkspace()!.getAttribute("aria-disabled") !== "true", "Initial catalog connection")
  if (context.phase === "reuse") {
    const workspace = (await api.catalog.list()).workspaces.find(value => value.id === context.workspaceId)
    require(workspace?.worktrees[0]?.directories[0]?.path === context.checkoutPath, "Workspace was not preserved after client exit")
    const terminal = (await api.terminal.list()).find(value => value.id === context.terminalId)
    require(terminal?.status === "running" && terminal.cwd === context.checkoutPath, "Quitting the client stopped or replaced its native terminal")
    await until(sidebarWorkspace, "Reused catalog sidebar")
    await change(false)
    return { workspaceId: workspace.id, terminalId: terminal.id }
  }

  require((await api.catalog.list()).workspaces.length === 0, "The isolated catalog must start empty")
  const workspace = await api.catalog.createWorkspace("Local Agent smoke", [{ path: context.checkoutPath }])
  await until(sidebarWorkspace, "Created catalog sidebar")
  const stoppedTerminal = await api.terminal.dial({ mode: "create", terminalId: crypto.randomUUID(), cwd: context.checkoutPath, cols: 80, rows: 24 })
  require(stoppedTerminal.status === "running", "Native terminal did not start")
  await change(false)
  await change(true)
  await until(sidebarWorkspace, "Catalog refresh after restart")
  const restored = (await api.catalog.list()).workspaces.find(value => value.id === workspace.id)
  require(restored?.worktrees[0]?.directories[0]?.path === context.checkoutPath, "Workspace did not survive daemon restart")
  const interrupted = (await api.terminal.list()).find(value => value.id === stoppedTerminal.id)
  require(interrupted?.status === "interrupted", "Turning the local Agent off must stop its terminal process while preserving history")
  const survivor = await api.terminal.dial({ mode: "create", terminalId: crypto.randomUUID(), cwd: context.checkoutPath, cols: 80, rows: 24 })
  require(survivor.status === "running", "Native terminal did not start after restart")
  return { workspaceId: workspace.id, terminalId: survivor.id, stoppedTerminalId: stoppedTerminal.id }
}

const argument = process.argv.find(value => value.startsWith("--local-agent-smoke-context="))
if (!argument) throw new Error("Missing local Agent smoke context")
const context = JSON.parse(argument.slice("--local-agent-smoke-context=".length)) as LocalAgentSmokeContext
app.setPath("userData", context.profileDirectory)
app.setPath("sessionData", context.profileDirectory)
registerRendererScheme()

void app.whenReady().then(async () => {
  const controller = new LocalAgentController(
    join(app.getPath("userData"), "settings.json"),
    createLocalAgentRuntime({ executable: process.execPath, appPath: context.appPath, packaged: false, directory: context.daemonDirectory }),
    publishLocalAgentState,
  )
  installDesktopMediaIpc()
  installLocalAgentSettings(controller)
  const exit = () => { controller.detach(); app.exit(0) }
  process.on("message", exit)
  process.on("disconnect", exit)
  const initialized = await controller.initialize()
  if (initialized.status === "error") throw new Error(initialized.error)
  const identity = async () => createHash("sha256").update(JSON.stringify(await readDaemonDiscovery(context.daemonDirectory))).digest("hex")
  const reusedIdentity = context.phase === "reuse" ? await identity() : undefined
  denyChromiumPermissions()
  protocol.handle(RENDERER_SCHEME, async request => {
    if (request.method !== "GET") return new Response(null, { status: 405 })
    const path = resolveRendererResourcePath(request.url, context.rendererDirectory)
    return path ? net.fetch(pathToFileURL(path).toString()) : new Response(null, { status: 400 })
  })
  const window = new BrowserWindow({
    show: false, width: 1200, height: 800,
    webPreferences: {
      preload: context.preloadPath, sandbox: true, contextIsolation: true,
      nodeIntegration: false, backgroundThrottling: false,
      additionalArguments: ["--deskfleet-locale=en-US"],
    },
  })
  attachDesktopMedia(window)
  attachLocalAgentSettings(window)
  window.webContents.on("render-process-gone", (_event, details) => process.send?.({ error: `Renderer exited: ${details.reason}` }))
  await window.loadURL(BUNDLED_RENDERER_URL)
  const result = await window.webContents.executeJavaScript(`(${exerciseSettings.toString()})(${JSON.stringify(context)})`) as LocalAgentSmokeResult
  if (context.phase !== "disabled") result.daemonIdentity = reusedIdentity ?? await identity()
  process.send?.({ result })
}).catch(error => {
  if (process.send) process.send({ error: String(error) }, () => app.exit(1))
  else app.exit(1)
})
