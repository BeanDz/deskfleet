import { expect, test } from "vitest"
import {
  BUNDLED_RENDERER_URL,
  DEVELOPMENT_RENDERER_URL,
  isMainRendererUrl,
  resolveRendererEntrypoint,
} from "./renderer-security.ts"

test("packaged builds ignore the development renderer URL", () => {
  expect(resolveRendererEntrypoint(true, "http://evil.example/")).toEqual({
    url: BUNDLED_RENDERER_URL,
    mode: "bundle",
  })
})

test("development accepts only the loopback Vite server", () => {
  expect(resolveRendererEntrypoint(false, DEVELOPMENT_RENDERER_URL).mode).toBe("development")
  expect(() => resolveRendererEntrypoint(false, "http://localhost:5173/")).toThrow()
})

test("the main renderer is identified independently of its route", () => {
  expect(isMainRendererUrl(`${BUNDLED_RENDERER_URL}#/workspaces`)).toBe(true)
  expect(isMainRendererUrl(`${DEVELOPMENT_RENDERER_URL}#/`)).toBe(true)
  expect(isMainRendererUrl(`${BUNDLED_RENDERER_URL}?inject=1`)).toBe(false)
  expect(isMainRendererUrl("deskfleet-app://bundle/other.html")).toBe(false)
  expect(isMainRendererUrl("https://bundle/index.html")).toBe(false)
})
