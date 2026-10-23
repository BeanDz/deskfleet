import type { AppLocale } from "./i18n.ts"

/** The preload bridge exposed to the main renderer as `window.deskfleet`. */
export interface DeskfleetDesktopApi {
  platform: "darwin" | "linux" | "win32"
  locale: AppLocale
}
