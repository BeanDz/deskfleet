import { join, resolve } from "node:path"
import { expect, test, vi } from "vitest"
import { handleRendererProtocolRequest, resolveRendererResourcePath } from "./renderer-protocol.ts"

// Outside Electron the package resolves to its executable path, not the API.
vi.mock("electron", () => ({ net: {}, protocol: {}, session: {} }))

const directory = resolve("/app/out/renderer")

test("renderer URLs map to files inside the bundle", () => {
  expect(resolveRendererResourcePath("deskfleet-app://bundle/index.html", directory)).toBe(
    join(directory, "index.html"),
  )
  expect(resolveRendererResourcePath("deskfleet-app://bundle/assets/a%20b.js?v=1", directory)).toBe(
    join(directory, "assets", "a b.js"),
  )
})

test("renderer URLs cannot escape the bundle", () => {
  for (const url of [
    "deskfleet-app://bundle/../secret",
    "deskfleet-app://bundle/%2e%2e/secret",
    "deskfleet-app://bundle/assets/..%2f..%2fsecret",
    "deskfleet-app://bundle/..%5csecret",
    "deskfleet-app://bundle/a%00b",
    "deskfleet-app://bundle/",
    "deskfleet-app://other/index.html",
    "file:///etc/passwd",
  ]) {
    expect(resolveRendererResourcePath(url, directory), url).toBeNull()
  }
})

test("only GET requests for bundled files are served", async () => {
  const fetchResource = vi.fn(async () => new Response("ok"))

  const post = { method: "POST", url: "deskfleet-app://bundle/index.html" }
  expect((await handleRendererProtocolRequest(post, fetchResource)).status).toBe(405)
  const escape = { method: "GET", url: "deskfleet-app://bundle/../x" }
  expect((await handleRendererProtocolRequest(escape, fetchResource)).status).toBe(400)
  expect(fetchResource).not.toHaveBeenCalled()

  const missing = vi.fn(async () => new Response(null, { status: 500 }))
  const index = { method: "GET", url: "deskfleet-app://bundle/index.html" }
  expect((await handleRendererProtocolRequest(index, missing)).status).toBe(404)
})
