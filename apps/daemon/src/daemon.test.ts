import assert from "node:assert/strict"
import test from "node:test"
import { nativeInfo } from "@deskfleet/native"
import { startDaemon } from "./daemon.ts"

test("headless daemon serves information from the Rust addon", async context => {
  const daemon = await startDaemon()
  context.after(() => daemon.close())

  const response = await fetch(`${daemon.address}/healthz`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { status: "ok", native: nativeInfo() })
  assert.ok(daemon.address.startsWith("http://127.0.0.1:"))
})
