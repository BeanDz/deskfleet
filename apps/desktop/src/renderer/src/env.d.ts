import type { DeskfleetDesktopApi } from "../../shared/desktop-api.ts"

declare global {
  interface Window {
    deskfleet: DeskfleetDesktopApi
  }
}

export {}
