import { app, powerMonitor } from "electron"
import { resolveAppLocale } from "../shared/i18n.ts"
import { setMainLocale } from "./i18n.ts"
import { keepRunningInBackground } from "./lifecycle.ts"
import {
  denyChromiumPermissions,
  installRendererProtocol,
  registerRendererScheme,
} from "./renderer-protocol.ts"
import { createTray } from "./tray.ts"
import { hideMainWindow, showMainWindow } from "./windows.ts"

function start(): void {
  registerRendererScheme()
  const lifecycle = keepRunningInBackground(app, hideMainWindow)
  const show = () => void showMainWindow(lifecycle)

  app.on("second-instance", show)

  void app.whenReady().then(() => {
    setMainLocale(resolveAppLocale(app.getPreferredSystemLanguages()))
    installRendererProtocol()
    denyChromiumPermissions()
    // The dev runner, service managers, and session shutdown stop the client with
    // signals. Electron's own handlers, installed during startup, request an
    // ordinary quit that the tray lifecycle blocks; registering after ready
    // replaces them.
    process.once("SIGINT", () => lifecycle.quit())
    process.once("SIGTERM", () => lifecycle.quit())
    // Logging out or shutting down must not wait on a client hidden in the tray.
    powerMonitor.on("shutdown", () => lifecycle.quit())
    createTray({ show, quit: () => lifecycle.quit() })
    show()
    app.on("activate", show)
  })
}

// A second launch focuses the running client instead of adding another tray icon.
if (app.requestSingleInstanceLock()) {
  start()
} else {
  app.quit()
}
