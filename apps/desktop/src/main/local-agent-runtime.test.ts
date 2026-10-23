import { afterEach, expect, test, vi } from "vitest"
import type { DaemonEvent } from "../../../daemon/src/control-protocol.ts"
import { createLocalAgentRuntime } from "./local-agent-runtime.ts"

const mocks = vi.hoisted(() => ({ connect: vi.fn() }))
vi.mock("@deskfleet/daemon/control-client", () => ({ DaemonClient: { connect: mocks.connect } }))
afterEach(() => vi.clearAllMocks())

test("connection retains a permission event received alongside its initial handshake", async () => {
  let event!: (event: DaemonEvent) => void
  const client = {
    closed: false,
    info: { name: "machine", desktop: true, screenCapturePermission: { status: "requesting" } },
    call: vi.fn(),
    close: vi.fn(),
  }
  mocks.connect.mockImplementation(async onEvent => {
    event = onEvent
    event({ kind: "screenCapturePermissionChanged", permission: { status: "granted" } })
    return client
  })
  const changed = vi.fn()
  const runtime = createLocalAgentRuntime({ executable: "/electron", appPath: "/app", packaged: false, directory: "/daemon" })
  const connection = await runtime.connect(vi.fn(), changed)
  expect(connection.screenCapturePermission).toEqual({ status: "granted" })
  expect(changed).toHaveBeenCalledExactlyOnceWith({ status: "granted" })
  event({ kind: "catalogChanged" })
  expect(changed).toHaveBeenCalledTimes(1)
  event({ kind: "screenCapturePermissionChanged", permission: { status: "denied" } })
  expect(changed).toHaveBeenLastCalledWith({ status: "denied" })
  expect(connection.screenCapturePermission).toEqual({ status: "denied" })
})

test("connecting to an existing daemon reads permission without starting another request", async () => {
  const client = {
    closed: false,
    info: { name: "machine", desktop: true, screenCapturePermission: { status: "denied" } },
    call: vi.fn(),
    close: vi.fn(),
  }
  mocks.connect.mockResolvedValue(client)
  const runtime = createLocalAgentRuntime({ executable: "/electron", appPath: "/app", packaged: false, directory: "/daemon" })
  const connection = await runtime.connect(vi.fn(), vi.fn())
  expect(connection.screenCapturePermission).toEqual({ status: "denied" })
  expect(client.call).not.toHaveBeenCalled()
})
