import { app, BrowserWindow, ipcMain, protocol, session } from "electron"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { attachDesktopMedia, installDesktopMediaIpc } from "../../src/main/desktop-media.ts"
import { isMainRendererUrl, RENDERER_SCHEME, BUNDLED_RENDERER_URL } from "../../src/shared/renderer-security.ts"

protocol.registerSchemesAsPrivileged([
  { scheme: RENDERER_SCHEME, privileges: { standard: true, secure: true } },
])

void app.whenReady().then(async () => {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  protocol.handle(RENDERER_SCHEME, async request => {
    const path = new URL(request.url).pathname
    const file = path === "/renderer.js" ? "renderer.js" : path === "/renderer.css" ? "renderer.css" : "index.html"
    return new Response(await readFile(join(import.meta.dirname, file)), {
      headers: { "content-type": file.endsWith(".js") ? "text/javascript" : file.endsWith(".css") ? "text/css" : "text/html" },
    })
  })
  installDesktopMediaIpc()
  const window = new BrowserWindow({
    show: false,
    width: 900,
    height: 600,
    webPreferences: {
      preload: join(import.meta.dirname, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      additionalArguments: ["--deskfleet-locale=en-US", ...process.argv.filter(argument => argument.startsWith("--terminal-smoke-context="))],
    },
  })
  attachDesktopMedia(window)
  ipcMain.on("terminal-smoke:result", (event, message: unknown) => {
    if (event.sender !== window.webContents || event.senderFrame !== event.sender.mainFrame || !isMainRendererUrl(event.senderFrame.url)) return
    process.send?.(message)
  })
  window.webContents.on("render-process-gone", (_event, details) => process.send?.({ error: `Renderer exited: ${details.reason}` }))
  process.on("message", () => app.quit())
  process.on("disconnect", () => app.quit())
  await window.loadURL(BUNDLED_RENDERER_URL)
}).catch(error => { process.send?.({ error: String(error) }); app.quit() })
