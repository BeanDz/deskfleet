import { expect, test, vi } from "vitest"

vi.mock("electron", () => ({ ipcMain: { handle: vi.fn() } }))
import { isDesktopMediaSender } from "./desktop-media.ts"
import { BUNDLED_RENDERER_URL } from "../shared/renderer-security.ts"
import type { IpcMainInvokeEvent } from "electron"

test("desktop IPC rejects subframes and unrelated renderer documents", () => {
  const mainFrame = { url: BUNDLED_RENDERER_URL }
  const event = { sender: { mainFrame }, senderFrame: mainFrame } as unknown as IpcMainInvokeEvent
  expect(isDesktopMediaSender(event)).toBe(true)
  expect(isDesktopMediaSender({ ...event, senderFrame: { ...mainFrame } } as IpcMainInvokeEvent)).toBe(false)
  mainFrame.url = "https://example.org/"
  expect(isDesktopMediaSender(event)).toBe(false)
  expect(isDesktopMediaSender({ ...event, senderFrame: null })).toBe(false)
})
