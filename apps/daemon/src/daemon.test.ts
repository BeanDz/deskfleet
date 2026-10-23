import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { nativeInfo } from "@deskfleet/native"
import { DaemonClient, readDaemonDiscovery, startDaemon } from "./index.ts"

test("headless daemon serves information from the Rust addon", async context => {
  const directory = await mkdtemp(join(tmpdir(), "df-daemon-test-"))
  const daemon = await startDaemon(0, { controlDirectory: directory })
  context.after(async () => { await daemon.close(); await rm(directory, { recursive: true, force: true }) })

  const response = await fetch(`${daemon.address}/healthz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "ok", native: nativeInfo() })
  assert.ok(daemon.address.startsWith("http://127.0.0.1:"))
})

test("authenticated shutdown acknowledges before cleanup and releases discovery last", { timeout: 15_000 }, async context => {
  const directory = await mkdtemp(join(tmpdir(), "df-daemon-shutdown-"))
  const daemon = await startDaemon(0, { controlDirectory: directory })
  let releaseCleanup!: () => void
  let cleanupStarted!: () => void
  const cleanupGate = new Promise<void>(resolve => { releaseCleanup = resolve })
  const cleaning = new Promise<void>(resolve => { cleanupStarted = resolve })
  const closeTerminals = daemon.terminals.close.bind(daemon.terminals)
  daemon.terminals.close = async () => {
    cleanupStarted()
    await cleanupGate
    await closeTerminals()
  }
  context.after(async () => {
    releaseCleanup()
    await daemon.close()
    await rm(directory, { recursive: true, force: true })
  })
  const client = await DaemonClient.connect(() => {}, () => {}, directory)
  context.after(() => client.close())
  await client.call("workspaceCreate", { name: "Persistent workspace", directories: [{ path: directory }] })
  await client.call("terminalDial", { mode: "create", terminalId: "shutdown-terminal", cols: 80, rows: 24, cwd: directory })
  const discovery = await readDaemonDiscovery(directory)

  assert.equal(await client.call("shutdown", {}), null)
  await cleaning
  assert.deepEqual(await readDaemonDiscovery(directory), discovery)
  await assert.rejects(DaemonClient.connect(() => {}, () => {}, directory))
  await assert.rejects(startDaemon(0, { controlDirectory: directory }), /already running/)
  assert.deepEqual(await readDaemonDiscovery(directory), discovery)
  assert.equal(daemon.close(), daemon.closed)
  releaseCleanup()
  await daemon.closed
  await assert.rejects(readDaemonDiscovery(directory), { code: "ENOENT" })
  await assert.rejects(fetch(`${daemon.address}/healthz`))
  await assert.rejects(daemon.terminals.dial({ mode: "resume", terminalId: "shutdown-terminal" }), /closed/)
  assert.equal(daemon.close(), daemon.closed)

  const restarted = await startDaemon(0, { controlDirectory: directory })
  context.after(() => restarted.close())
  const next = await DaemonClient.connect(() => {}, () => {}, directory)
  context.after(() => next.close())
  assert.equal((await next.call("catalogList", {})).workspaces[0]?.name, "Persistent workspace")
  await restarted.close()
})
