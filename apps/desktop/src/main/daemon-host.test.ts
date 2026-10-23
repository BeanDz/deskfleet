import { beforeEach, expect, it, vi } from "vitest"
import { join } from "node:path"

const mocks = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  startDaemon: vi.fn(),
  app: {
    setPath: vi.fn(),
    setActivationPolicy: vi.fn(),
    whenReady: vi.fn<() => Promise<void>>(),
    on: vi.fn(),
    exit: vi.fn(),
  },
  powerMonitor: { on: vi.fn() },
}))

vi.mock("node:fs", () => ({ mkdirSync: mocks.mkdirSync }))
vi.mock("electron", () => ({ app: mocks.app, powerMonitor: mocks.powerMonitor }))
vi.mock("@deskfleet/daemon", () => ({ startDaemon: mocks.startDaemon }))
vi.mock("@deskfleet/daemon/control-discovery", () => ({ daemonControlDirectory: () => "/daemon-data" }))

import { startDaemonHost } from "./daemon-host.ts"

function pending() {
  let resolve!: () => void
  const promise = new Promise<void>((complete) => { resolve = complete })
  return { promise, resolve }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(process, "once").mockReturnValue(process)
})

it("isolates Electron data and waits for daemon cleanup before exiting", async () => {
  const ready = pending()
  const closed = pending()
  const close = vi.fn(() => closed.promise)
  mocks.app.whenReady.mockReturnValue(ready.promise)
  mocks.startDaemon.mockResolvedValue({ close, closed: closed.promise })

  startDaemonHost()

  const directory = join("/daemon-data", "electron-profile")
  expect(mocks.app.setPath.mock.calls).toEqual([["userData", directory], ["sessionData", directory]])
  expect(mocks.startDaemon).not.toHaveBeenCalled()
  ready.resolve()
  await vi.waitFor(() => expect(mocks.startDaemon).toHaveBeenCalledOnce())

  const beforeQuit = mocks.app.on.mock.calls.find(([event]) => event === "before-quit")?.[1]
  const preventDefault = vi.fn()
  beforeQuit({ preventDefault })
  await vi.waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(preventDefault).toHaveBeenCalledOnce()
  expect(mocks.app.exit).not.toHaveBeenCalled()

  closed.resolve()
  await vi.waitFor(() => expect(mocks.app.exit).toHaveBeenCalledWith(0))
})

it("exits with an error when the daemon cannot start", async () => {
  const error = new Error("Local daemon is already running")
  const log = vi.spyOn(console, "error").mockImplementation(() => {})
  mocks.app.whenReady.mockResolvedValue()
  mocks.startDaemon.mockRejectedValue(error)

  startDaemonHost()

  await vi.waitFor(() => expect(mocks.app.exit).toHaveBeenCalledWith(1))
  expect(log).toHaveBeenCalledWith(error)
})

it("uses the injected daemon startup only after Electron is ready", async () => {
  const ready = pending()
  const closed = pending()
  const close = vi.fn(() => closed.promise)
  const start = vi.fn(async () => ({ close, closed: closed.promise }))
  mocks.app.whenReady.mockReturnValue(ready.promise)

  startDaemonHost(start)
  expect(start).not.toHaveBeenCalled()
  ready.resolve()
  await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())
  expect(mocks.startDaemon).not.toHaveBeenCalled()
  closed.resolve()
  await vi.waitFor(() => expect(mocks.app.exit).toHaveBeenCalledWith(0))
})
