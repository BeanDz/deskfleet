import { afterEach } from "vitest"
import type { DeskfleetDesktopApi } from "../../../shared/desktop-api.ts"

const api: DeskfleetDesktopApi = { platform: "linux", locale: "en-US" }

Object.defineProperty(window, "deskfleet", { configurable: true, value: api })

afterEach(() => {
  document.body.innerHTML = ""
})
