import { contextBridge } from "electron"
import type { DeskfleetDesktopApi } from "../shared/desktop-api.ts"
import { DEFAULT_LOCALE, isAppLocale, LOCALE_ARGUMENT_PREFIX } from "../shared/i18n.ts"
import { isMainRendererUrl } from "../shared/renderer-security.ts"

const locale = process.argv
  .find((argument) => argument.startsWith(LOCALE_ARGUMENT_PREFIX))
  ?.slice(LOCALE_ARGUMENT_PREFIX.length)

const api: DeskfleetDesktopApi = {
  platform: process.platform as DeskfleetDesktopApi["platform"],
  locale: isAppLocale(locale) ? locale : DEFAULT_LOCALE,
}

if (isMainRendererUrl(globalThis.location.href)) {
  contextBridge.exposeInMainWorld("deskfleet", api)
}
