import { app, BrowserWindow, net, protocol } from "electron"
import { writeFile } from "node:fs/promises"
import { pathToFileURL } from "node:url"
import { attachDesktopMedia, installDesktopMediaIpc } from "../../src/main/desktop-media.ts"
import { denyChromiumPermissions, registerRendererScheme, resolveRendererResourcePath } from "../../src/main/renderer-protocol.ts"
import { BUNDLED_RENDERER_URL, RENDERER_SCHEME } from "../../src/shared/renderer-security.ts"
import type { DeskfleetDesktopApi } from "../../src/shared/desktop-api.ts"

export interface AgentSmokeContext {
  phase: "create" | "restore"
  rendererDirectory: string
  preloadPath: string
  repository: string
  screenshotPath: string
  sessionId?: string
  workspaceId?: string
  worktreeId?: string
}
export interface AgentSmokeResult {
  sessionId: string
  workspaceId: string
  worktreeId: string
  conversationEntries: number
  permissionId: string
}

// Evaluate in the production renderer with its production sandboxed preload.
async function exerciseAgent(context: AgentSmokeContext): Promise<AgentSmokeResult> {
  const api = (window as unknown as { deskfleet: DeskfleetDesktopApi }).deskfleet
  function require(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
  }
  async function until(predicate: () => boolean | Promise<boolean>, label: string): Promise<void> {
    const deadline = Date.now() + 20_000
    while (!await predicate()) {
      if (Date.now() > deadline) throw new Error(`${label} timed out; route ${location.hash}; renderer: ${document.body.innerText.slice(-5_000)}`)
      await new Promise(resolve => setTimeout(resolve, 25))
    }
  }
  function button(label: string, scope: ParentNode = document): HTMLButtonElement | undefined {
    return [...scope.querySelectorAll("button")].find(element => element.getAttribute("aria-label") === label || element.textContent?.trim() === label)
  }
  async function click(label: string, scope: () => ParentNode = () => document): Promise<void> {
    await until(() => { const value = button(label, scope()); return !!value && !value.disabled && value.getAttribute("aria-disabled") !== "true" }, `Button ${label}`)
    button(label, scope())!.click()
  }
  const conversation = () => document.querySelector<HTMLOListElement>('[aria-label="Conversation"]')
  const backlog = () => document.querySelector<HTMLElement>('[aria-label="Queued"]')
  const permissions = () => document.querySelector<HTMLElement>('[aria-label="Permissions"]')
  const prompt = () => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Prompt"]')
  async function send(text: string, label: string): Promise<void> {
    await until(() => !!prompt(), "Prompt composer")
    prompt()!.value = text
    prompt()!.dispatchEvent(new Event("input", { bubbles: true }))
    await click(label)
    await until(() => prompt()?.value === "", `Submission ${text}`)
  }
  async function openSession(id: string): Promise<void> {
    const link = () => document.querySelector<HTMLAnchorElement>(`a[href="#/sessions/${id}"]`)
    await until(() => !!link(), "Session sidebar link")
    link()!.click()
    await until(() => location.hash === `#/sessions/${id}` && !!conversation(), "Session navigation")
  }
  async function verifyConversation(): Promise<void> {
    // Finished turns fold their work; expand every turn to inspect the full persisted journal.
    const folded = () => conversation()?.querySelectorAll<HTMLButtonElement>('[data-turn-work][aria-expanded="false"]') ?? []
    for (const toggle of folded()) toggle.click()
    await until(() => !folded().length, "Expanded turn work")
    const text = conversation()?.innerText ?? ""
    for (const marker of ["Smoke first prompt", "stream one 中文", "stream two", "Smoke selected steer", "steer received", "permission accepted", "Smoke queued candidate", "queued reply"]) {
      require(text.split(marker).length === 2, `Expected exactly one ${marker} in persisted conversation: ${text}`)
    }
    require(!backlog(), "All submitted inputs should have left the backlog")
    require(!!conversation()?.querySelector("[data-permission-id]")?.textContent?.includes("Allow smoke edit"), "Resolved permission choice was not retained")
    require(!permissions(), "Resolved permission must not be actionable")
  }

  await until(() => !!button("Add workspace") && button("Add workspace")!.getAttribute("aria-disabled") !== "true", "Daemon catalog connection")
  let sessionId = context.sessionId
  let workspaceId = context.workspaceId
  let worktreeId = context.worktreeId
  if (context.phase === "create") {
    require((await api.catalog.list()).workspaces.length === 0, "Smoke catalog must start empty")
    const workspace = await api.catalog.createWorkspace("Agent smoke workspace", [{ path: context.repository }])
    workspaceId = workspace.id
    await until(() => [...document.querySelectorAll("[data-composer-context]")].some(element => element.textContent?.includes(workspace.name)), "New Session workspace target")
    require(location.hash === "#/", "Initial route must be New Session")
    await send("Smoke first prompt", "Send")
    await until(() => /^#\/sessions\/[0-9]+$/u.test(location.hash), "Created Session route")
    sessionId = location.hash.split("/").at(-1)!
    await until(() => !!conversation()?.innerText.includes("stream two") && !!button("Cancel turn"), "Live streamed response before turn completion")
    await send("Smoke queued candidate", "Add to backlog")
    await send("Smoke selected steer", "Add to backlog")
    await until(() => backlog()?.querySelectorAll("li[data-input-id]").length === 2, "Two visible backlog candidates")
    const selected = () => [...backlog()!.querySelectorAll<HTMLElement>("li[data-input-id]")].find(element => element.innerText.includes("Smoke selected steer"))!
    await click("Steer now", selected)
    await until(() => !!button("Allow smoke edit", permissions() ?? document), "Live permission request")
    require(backlog()?.innerText.includes("Smoke queued candidate"), "Steering a selected candidate must retain the older candidate")
    require(!backlog()?.innerText.includes("Smoke selected steer"), "Steered input remained in the candidate list")
    const permissionId = permissions()!.querySelector("[data-permission-id]")!.getAttribute("data-permission-id")
    const newSession = document.querySelector<HTMLAnchorElement>('a[href="#/"]')
    require(newSession, "New Session navigation link was missing")
    newSession.click()
    await until(() => location.hash === "#/" && !conversation(), "Leaving the running Session")
    await openSession(sessionId)
    await until(() => !!button("Allow smoke edit", permissions() ?? document), "Pending permission after returning")
    require(permissions()!.querySelector("[data-permission-id]")!.getAttribute("data-permission-id") === permissionId, "Returning created a second permission request")
    await click("Allow smoke edit", () => permissions()!)
    await until(() => !!conversation()?.innerText.includes("queued reply") && !button("Cancel turn") && !backlog(), "Backlog execution after permission and first turn completion")
    const catalog = await api.catalog.list()
    const worktrees = catalog.workspaces.find(value => value.id === workspaceId)!.worktrees.filter(value => value.sessionId === sessionId)
    require(worktrees.length === 1 && worktrees[0]!.directories[0]?.path !== context.repository, "Session must own exactly one derived Git Worktree")
    worktreeId = worktrees[0]!.id
  } else {
    require(sessionId && workspaceId && worktreeId, "Restore identities are required")
    await openSession(sessionId)
    await until(() => !!conversation()?.innerText.includes("queued reply") && !!button("Resume agent"), "Conversation replay after daemon restart")
    const workspace = (await api.catalog.list()).workspaces.find(value => value.id === workspaceId)
    require(workspace?.worktrees.some(value => value.id === worktreeId && value.sessionId === sessionId), "Restart replaced the Session's Worktree")
    require(!button("Cancel turn"), "Restart must not silently re-run a completed prompt")
  }
  await until(() => ![...document.querySelectorAll('[role="status"]')].some(element => element.textContent?.includes("Restoring conversation")), "History replay completed")
  await verifyConversation()
  require(sessionId && workspaceId && worktreeId, "Session resource identities were missing")
  const permissionId = conversation()!.querySelector("[data-permission-id]")!.getAttribute("data-permission-id")!
  return { sessionId, workspaceId, worktreeId, permissionId, conversationEntries: conversation()!.querySelectorAll("[data-conversation-entry]").length }
}

registerRendererScheme()
void app.whenReady().then(async () => {
  const argument = process.argv.find(value => value.startsWith("--agent-smoke-context="))
  if (!argument) throw new Error("Missing Agent smoke context")
  const context = JSON.parse(argument.slice("--agent-smoke-context=".length)) as AgentSmokeContext
  denyChromiumPermissions()
  protocol.handle(RENDERER_SCHEME, async request => {
    if (request.method !== "GET") return new Response(null, { status: 405 })
    const path = resolveRendererResourcePath(request.url, context.rendererDirectory)
    return path ? net.fetch(pathToFileURL(path).toString()) : new Response(null, { status: 400 })
  })
  installDesktopMediaIpc()
  const window = new BrowserWindow({
    show: false, width: 1280, height: 960,
    webPreferences: { preload: context.preloadPath, sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false, additionalArguments: ["--deskfleet-locale=en-US"] },
  })
  attachDesktopMedia(window)
  window.webContents.on("render-process-gone", (_event, details) => process.send?.({ error: `Renderer exited: ${details.reason}` }))
  process.on("message", () => app.quit())
  process.on("disconnect", () => app.quit())
  await window.loadURL(BUNDLED_RENDERER_URL)
  let result: AgentSmokeResult
  try {
    result = await window.webContents.executeJavaScript(`(${exerciseAgent.toString()})(${JSON.stringify(context)})`) as AgentSmokeResult
  } finally {
    await writeFile(context.screenshotPath, (await window.webContents.capturePage()).toPNG())
  }
  process.send?.({ result })
}).catch(error => { process.send?.({ error: String(error) }); app.quit() })
