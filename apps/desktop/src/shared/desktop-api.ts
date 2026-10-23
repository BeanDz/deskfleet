import type { DesktopMediaApi } from "./desktop-media.ts"
import type { AppLocale } from "./i18n.ts"
import type { TerminalSignalingApi } from "./terminal.ts"

/** The preload bridge exposed to the main renderer as `window.deskfleet`. */
export interface DeskfleetDesktopApi {
  platform: "darwin" | "linux" | "win32"
  locale: AppLocale
  desktop: DesktopMediaApi
  terminal: TerminalSignalingApi
}
