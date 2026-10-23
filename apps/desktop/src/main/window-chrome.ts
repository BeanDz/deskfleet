import { nativeTheme, type BrowserWindow, type BrowserWindowConstructorOptions } from "electron"

/** Height of the renderer's toolbar rows, which host the native window controls. */
const TOOLBAR_HEIGHT = 48

// Match --ui-color-canvas and --ui-color-text in the renderer's styles.css.
const themes = {
  light: { color: "#f9f9f9", symbolColor: "#1f1f22" },
  dark: { color: "#1a1a1d", symbolColor: "#ececef" },
}

function theme() {
  return nativeTheme.shouldUseDarkColors ? themes.dark : themes.light
}

/** Frameless chrome: the renderer draws the title bar around the native controls. */
export function windowChromeOptions(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  const { color, symbolColor } = theme()
  if (platform === "darwin") {
    return {
      titleBarStyle: "hiddenInset",
      // Centers the traffic lights in the sidebar toolbar row.
      trafficLightPosition: { x: 18, y: 17 },
      backgroundColor: color,
    }
  }
  return {
    titleBarStyle: "hidden",
    titleBarOverlay: { color, symbolColor, height: TOOLBAR_HEIGHT },
    backgroundColor: color,
  }
}

/** Repaints the Windows and Linux control overlay when the system theme changes. */
export function followSystemTheme(window: BrowserWindow, platform: NodeJS.Platform): void {
  if (platform === "darwin") return
  const update = () => window.setTitleBarOverlay({ ...theme(), height: TOOLBAR_HEIGHT })
  nativeTheme.on("updated", update)
  window.once("closed", () => nativeTheme.off("updated", update))
}
