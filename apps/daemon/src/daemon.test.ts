import assert from "node:assert/strict"
import test from "node:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { nativeInfo } from "@deskfleet/native"
import { startDaemon } from "./daemon.ts"

test("headless daemon serves information from the Rust addon", async context => {
  const directory = await mkdtemp(join(tmpdir(), "df-daemon-test-"))
  const daemon = await startDaemon(0, { controlDirectory: directory })
  context.after(async () => { await daemon.close(); await rm(directory, { recursive: true, force: true }) })

  const response = await fetch(`${daemon.address}/healthz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "ok", native: nativeInfo() })
  assert.ok(daemon.address.startsWith("http://127.0.0.1:"))
})
