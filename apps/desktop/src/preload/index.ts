import { contextBridge, ipcRenderer } from "electron"
import { DESKTOP_MEDIA_CHANNEL, DESKTOP_MEDIA_EVENT, type DesktopEvent, type DesktopMediaResult } from "../shared/desktop-media.ts"
import type { DeskfleetDesktopApi } from "../shared/desktop-api.ts"
import { DEFAULT_LOCALE, isAppLocale, LOCALE_ARGUMENT_PREFIX } from "../shared/i18n.ts"
import { isMainRendererUrl } from "../shared/renderer-security.ts"
import { TERMINAL_SESSION_EVENT, type TerminalSessionEvent } from "../shared/terminal.ts"

const locale = process.argv
  .find((argument) => argument.startsWith(LOCALE_ARGUMENT_PREFIX))
  ?.slice(LOCALE_ARGUMENT_PREFIX.length)

async function invokeDesktop<T>(method: string, params?: unknown): Promise<T> {
  const result = await ipcRenderer.invoke(DESKTOP_MEDIA_CHANNEL, method, params) as DesktopMediaResult<T>
  if (!result.ok) throw new Error(result.error)
  return result.value
}

const api: DeskfleetDesktopApi = {
  platform: process.platform as DeskfleetDesktopApi["platform"],
  locale: isAppLocale(locale) ? locale : DEFAULT_LOCALE,
  terminal: {
    list: () => invokeDesktop("terminalList", {}),
    dial: (options) => invokeDesktop("terminalDial", options),
    hangup: (terminalId) => invokeDesktop("terminalHangup", { terminalId }),
    onSessionEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: TerminalSessionEvent) => listener(event)
      ipcRenderer.on(TERMINAL_SESSION_EVENT, handler)
      return () => ipcRenderer.removeListener(TERMINAL_SESSION_EVENT, handler)
    },
    offer: (options) => invokeDesktop("terminalOffer", options),
    candidate: (sessionId, candidate) => invokeDesktop("candidate", { sessionId, candidate }),
    close: (sessionId) => invokeDesktop("close", { sessionId }),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: DesktopEvent) => listener(event)
      ipcRenderer.on(DESKTOP_MEDIA_EVENT, handler)
      return () => ipcRenderer.removeListener(DESKTOP_MEDIA_EVENT, handler)
    },
  },
  desktop: {
    target: () => invokeDesktop("target"),
    capabilities: () => invokeDesktop("capabilities"),
    offer: (options) => invokeDesktop("offer", options),
    candidate: (sessionId, candidate) => invokeDesktop("candidate", { sessionId, candidate }),
    start: (options) => invokeDesktop("start", options),
    close: (sessionId) => invokeDesktop("close", { sessionId }),
    onEvent: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, event: DesktopEvent) => listener(event)
      ipcRenderer.on(DESKTOP_MEDIA_EVENT, handler)
      return () => ipcRenderer.removeListener(DESKTOP_MEDIA_EVENT, handler)
    },
  },
}

if (isMainRendererUrl(globalThis.location.href)) {
  contextBridge.exposeInMainWorld("deskfleet", api)
}
