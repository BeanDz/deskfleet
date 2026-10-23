import { app, BrowserWindow, ipcMain, protocol, session } from "electron"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

// The launcher transpiles this fixture into its isolated temporary directory.
const directory = __dirname
protocol.registerSchemesAsPrivileged([
  { scheme: "deskfleet-media-test", privileges: { standard: true, secure: true } },
])

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  protocol.handle("deskfleet-media-test", async request => {
    const filename = new URL(request.url).pathname === "/renderer.js" ? "renderer.js" : "index.html"
    const content = await readFile(join(directory, filename))
    return new Response(content, {
      headers: { "content-type": filename.endsWith(".js") ? "text/javascript" : "text/html" },
    })
  })
  const window = new BrowserWindow({
    show: false,
    width: 128,
    height: 128,
    webPreferences: {
      preload: join(directory, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  })
  ipcMain.on("media-smoke:send", (_event, message: unknown) => process.send?.(message))
  process.on("message", (message: { kind?: string }) => {
    if (message.kind === "close") app.quit()
    else window.webContents.send("media-smoke:message", message)
  })
  process.on("disconnect", () => app.quit())
  window.webContents.on("render-process-gone", (_event, details) => {
    process.send?.({ kind: "error", error: `renderer exited: ${details.reason}` })
    app.quit()
  })
  await window.loadURL("deskfleet-media-test://app/index.html")
}).catch(error => {
  process.send?.({ kind: "error", error: String(error) })
  app.quit()
})
