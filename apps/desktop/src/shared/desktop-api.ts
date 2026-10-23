import type { DesktopMediaApi } from "./desktop-media.ts"
import type { CatalogApi } from "./catalog.ts"
import type { AppLocale } from "./i18n.ts"
import type { LocalAgentSettingsApi } from "./local-agent.ts"
import type { TerminalSignalingApi } from "./terminal.ts"

/** The preload bridge exposed to the main renderer as `window.deskfleet`. */
export interface DeskfleetDesktopApi {
  platform: "darwin" | "linux" | "win32"
  locale: AppLocale
  settings: LocalAgentSettingsApi
  catalog: CatalogApi
  desktop: DesktopMediaApi
  terminal: TerminalSignalingApi
}
