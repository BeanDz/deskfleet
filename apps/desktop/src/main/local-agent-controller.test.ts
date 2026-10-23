import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, expect, test, vi } from "vitest"
import { LocalAgentController, type LocalAgentConnection, type LocalAgentRuntime } from "./local-agent-controller.ts"

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })

async function fixture(running = false) {
  const directory = await mkdtemp(join(tmpdir(), "deskfleet-settings-"))
  directories.push(directory)
  const path = join(directory, "settings.json")
  let disconnect: ((error: Error) => void) | undefined
  let current: LocalAgentConnection | undefined
  const shutdown = vi.fn(async () => {
    running = false
    current!.close()
  })
  const runtime: LocalAgentRuntime = {
    connect: vi.fn(async onDisconnect => {
      if (!running) throw Object.assign(new Error("Not running"), { code: "ENOENT" })
      disconnect = onDisconnect
      let closed = false
      current = {
        get closed() { return closed },
        shutdown,
        close() { closed = true; onDisconnect(new Error("Disconnected")) },
      }
      return current
    }),
    launch: vi.fn(async () => { running = true; return {} }),
    waitForShutdown: vi.fn(async () => {}),
  }
  const emit = vi.fn()
  return {
    path, runtime, emit, shutdown,
    controller: new LocalAgentController(path, runtime, emit),
    disconnect: () => { running = false; disconnect?.(new Error("Daemon exited")) },
  }
}

test("fresh settings start the local Agent by default and exit only detaches", async () => {
  const f = await fixture()
  expect(await f.controller.initialize()).toEqual({ enabled: true, status: "running", error: undefined })
  expect(f.runtime.launch).toHaveBeenCalledOnce()
  f.controller.detach()
  expect(f.shutdown).not.toHaveBeenCalled()
  expect(f.emit.mock.calls.at(-1)?.[0].status).toBe("running")
})

test("an authenticated existing daemon is reused without starting another process", async () => {
  const f = await fixture(true)
  await f.controller.initialize()
  expect(f.runtime.launch).not.toHaveBeenCalled()
  expect(f.controller.state.status).toBe("running")
})

test("switching off shuts down, waits for cleanup, and persists across launches", async () => {
  const f = await fixture()
  await f.controller.initialize()
  expect((await f.controller.setEnabled(false)).status).toBe("stopped")
  expect(f.shutdown).toHaveBeenCalledOnce()
  expect(f.runtime.waitForShutdown).toHaveBeenCalledOnce()
  expect(JSON.parse(await readFile(f.path, "utf8"))).toEqual({ localAgentEnabled: false })
  const next = new LocalAgentController(f.path, f.runtime)
  expect(await next.initialize()).toEqual({ enabled: false, status: "stopped", error: undefined })
  expect(f.runtime.launch).toHaveBeenCalledOnce()
  expect((await next.setEnabled(true)).status).toBe("running")
  expect(f.runtime.launch).toHaveBeenCalledTimes(2)
})

test("disabled auto-start does not terminate a separately running daemon on launch", async () => {
  const f = await fixture(true)
  await writeFile(f.path, JSON.stringify({ localAgentEnabled: false }))
  expect((await f.controller.initialize()).status).toBe("running")
  expect(f.shutdown).not.toHaveBeenCalled()
  expect(f.runtime.launch).not.toHaveBeenCalled()
})

test("startup errors preserve enabled intent and can be retried", async () => {
  const f = await fixture()
  vi.mocked(f.runtime.launch).mockRejectedValueOnce(new Error("Executable missing"))
  expect(await f.controller.initialize()).toEqual({ enabled: true, status: "error", error: "Executable missing" })
  expect((await f.controller.setEnabled(true)).status).toBe("running")
  f.disconnect()
  expect(f.controller.state).toEqual({ enabled: true, status: "error", error: "Daemon exited" })
})

test("authentication errors do not launch over an existing daemon", async () => {
  const f = await fixture(true)
  vi.mocked(f.runtime.connect).mockRejectedValue(new Error("Authentication failed"))
  expect((await f.controller.initialize()).error).toBe("Authentication failed")
  expect(f.runtime.launch).not.toHaveBeenCalled()
})

test("setting changes cannot overlap while daemon shutdown is pending", async () => {
  const f = await fixture(true)
  await f.controller.initialize()
  let release!: () => void
  vi.mocked(f.runtime.waitForShutdown).mockImplementation(() => new Promise(resolve => { release = resolve }))
  const stopping = f.controller.setEnabled(false)
  await vi.waitFor(() => expect(f.runtime.waitForShutdown).toHaveBeenCalledOnce())
  await expect(f.controller.setEnabled(true)).rejects.toThrow("changing state")
  release()
  await stopping
  expect(f.controller.state.status).toBe("stopped")
})

test("invalid settings do not silently enable the Agent", async () => {
  const f = await fixture()
  await writeFile(f.path, '{"localAgentEnabled":"false"}')
  expect((await f.controller.initialize()).error).toBe("Invalid desktop settings")
  expect(f.runtime.launch).not.toHaveBeenCalled()
})
