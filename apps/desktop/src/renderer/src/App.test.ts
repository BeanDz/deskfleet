import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { createPinia } from "pinia"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import App from "./App.vue"
import { i18n } from "./i18n"
import { router } from "./router"

async function mountApp(path = "/") {
  await router.push(path)
  const wrapper = mount(App, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), router, i18n],
      // xterm.js needs a real browser to render; TerminalSurface.test.ts covers its wiring.
      stubs: { TerminalSurface: { props: ["banner"], template: '<div data-terminal :data-banner="banner" />' } },
    },
  })
  await flushPromises()
  return wrapper
}

function link(wrapper: VueWrapper, text: string) {
  return wrapper.findAll("a").find((a) => a.text() === text)!
}

const chips = (wrapper: VueWrapper) => wrapper.findAll(".ui-chip").map((chip) => chip.text())

beforeEach(() => window.localStorage.clear())
afterEach(() => {
  i18n.global.locale.value = "en-US"
})

test("a new session can still browse the sample worktree catalog", async () => {
  const wrapper = await mountApp()

  expect(wrapper.get("h1").text()).toBe("Start an agent session")
  expect(chips(wrapper)).toEqual(["development-box", "storefront", "main", "Codex"])
  const send = wrapper.get('[aria-label="Send (not available yet)"]')
  expect(send.attributes("aria-disabled")).toBe("true")
})

test("the sidebar nests worktrees and their sessions under workspaces", async () => {
  const wrapper = await mountApp()
  const tree = wrapper.get("aside").text()
  expect(wrapper.get("aside").attributes("aria-label")).toBeUndefined()

  for (const name of ["storefront", "main", "Investigate checkout failures", "checkout-fix"]) {
    expect(tree).toContain(name)
  }
  expect(link(wrapper, "checkout-fix").attributes("href")).toBe(
    "#/worktrees/worktree-storefront-checkout-fix",
  )
})

test("offline machines start collapsed and show when they were last seen", async () => {
  const wrapper = await mountApp()
  const header = wrapper.findAll("button[aria-expanded]").find((b) => b.text().includes("build-linux"))!

  expect(header.attributes("aria-expanded")).toBe("false")
  expect(header.get(".ui-badge").attributes("title")).toMatch(/^Last seen Oct 2[23], 2026/)
  expect(wrapper.text()).not.toContain("firmware")

  await header.trigger("click")
  expect(wrapper.text()).toContain("firmware")
})

test("a worktree page lists its directories and starts sessions in it", async () => {
  const wrapper = await mountApp()
  await link(wrapper, "checkout-fix").trigger("click")
  await vi.waitFor(() =>
    expect(wrapper.get("main header").text()).toBe("checkout-fix development-box / storefront"),
  )
  expect(wrapper.get("main").text()).toContain("/worktrees/storefront-api/checkout-fix")

  const start = wrapper.findAll("button").find((b) => b.text() === "New session")!
  await start.trigger("click")
  await flushPromises()
  expect(router.currentRoute.value.name).toBe("new-session")
  expect(chips(wrapper)).toContain("checkout-fix")
})

test("a session page shows its title and location", async () => {
  const wrapper = await mountApp()
  await link(wrapper, "Implement the fix").trigger("click")

  // The session route loads its view lazily.
  await vi.waitFor(() =>
    expect(wrapper.get("main header").text()).toBe(
      "Implement the fix development-box / storefront / checkout-fix",
    ),
  )
  expect(wrapper.text()).toContain("Session history is not available yet.")
})

test("terminals appear at machine, workspace, and worktree scope", async () => {
  const wrapper = await mountApp()

  for (const [title, id] of [
    ["zsh", "terminal-development-box-shell"],
    ["docker compose logs", "terminal-storefront-services"],
    ["pnpm dev", "terminal-storefront-web-dev"],
  ]) {
    expect(link(wrapper, title!).attributes("href")).toBe(`#/terminals/${id}`)
  }

  await link(wrapper, "docker compose logs").trigger("click")
  await vi.waitFor(() =>
    expect(wrapper.get("main header").text()).toBe(
      "docker compose logs development-box / storefront",
    ),
  )
  expect(wrapper.get("[data-terminal]").attributes("data-banner")).toContain(
    "Terminal access is not available yet.",
  )
})

test("a worktree page lists its terminals", async () => {
  const wrapper = await mountApp("/worktrees/worktree-storefront-main")
  await vi.waitFor(() => expect(wrapper.find("main h2").exists()).toBe(true))

  const terminals = wrapper.get("main").findAll("section")[2]!
  expect(terminals.text()).toContain("pnpm dev/code/storefront-web")
  const create = terminals.get('[title="New terminal (not available yet)"]')
  expect(create.attributes("aria-disabled")).toBe("true")
})

test("desktop navigation includes the local daemon and graphical sample machines", async () => {
  const wrapper = await mountApp()
  await wrapper
    .findAll("button[aria-expanded]")
    .find((b) => b.text().includes("build-linux"))!
    .trigger("click")

  const desktops = wrapper.findAll("a").filter((a) => a.text() === "Remote desktop")
  expect(desktops.map((a) => a.attributes("href"))).toEqual([
    "#/machines/local-daemon/desktop",
    "#/machines/machine-development-box/desktop",
  ])

  await desktops[1]!.trigger("click")
  await vi.waitFor(() =>
    expect(wrapper.get("main header").text()).toBe("Remote desktop development-box"),
  )
  expect(wrapper.text()).toContain("Remote desktop is not available yet.")
  expect(wrapper.get("main").findAll("button").some((button) => button.text() === "Connect")).toBe(false)
})

test("the desktop page explains why a machine cannot be shown", async () => {
  const wrapper = await mountApp("/machines/machine-build-linux/desktop")
  await vi.waitFor(() => expect(wrapper.text()).toContain("build-linux is offline."))

  expect(wrapper.find('[title="Connect (not available yet)"]').exists()).toBe(false)
})

test("settings render a placeholder page", async () => {
  i18n.global.locale.value = "zh-cmn-Hans-CN"
  const wrapper = await mountApp("/settings")

  expect(wrapper.get("h1").text()).toBe("设置")
  expect(wrapper.text()).toContain("尚不可用")
})

test("hiding the sidebar moves the window toolbar into the pane header", async () => {
  const wrapper = await mountApp()
  await wrapper.get('[aria-label="Hide sidebar"]').trigger("click")

  expect(wrapper.find('aside:not([aria-label="Details"])').exists()).toBe(false)
  expect(wrapper.get("main header").find('[aria-label="Show sidebar"]').exists()).toBe(true)
  expect(window.localStorage.getItem("deskfleet.sidebar-open")).toBe("false")
})

function panel(wrapper: VueWrapper) {
  return wrapper.get('aside[aria-label="Details"]')
}

async function openTab(wrapper: VueWrapper, name: string) {
  await panel(wrapper).findAll('[role="tab"]').find((tab) => tab.text() === name)!.trigger("click")
}

test("the details panel describes the selected resource", async () => {
  const wrapper = await mountApp("/terminals/terminal-storefront-web-dev")
  await vi.waitFor(() => expect(panel(wrapper).text()).toContain("pnpm dev"))

  const details = panel(wrapper).text()
  for (const text of ["Scope", "Worktree", "/code/storefront-web", "main · 4f2c1a9", "Not a Git checkout"]) {
    expect(details).toContain(text)
  }

  await router.push("/machines/machine-development-box/desktop")
  await vi.waitFor(() => expect(panel(wrapper).text()).toContain("DisplayAvailable"))
})

test("the changes tab lists Git changes per checkout in the worktree", async () => {
  const wrapper = await mountApp("/sessions/session-checkout-fix")
  await openTab(wrapper, "Changes")

  const tab = panel(wrapper).get('[role="tab"][aria-selected="true"]')
  expect(tab.text()).toBe("Changes")
  const changes = panel(wrapper).get('[role="tabpanel"]')
  expect(changes.findAll("section").map((section) => section.find("span").text())).toEqual([
    "frontend",
    "backend",
  ])
  expect(changes.text()).toContain("PaymentStep.test.tsxsrc/checkout+54A")
  expect(changes.get('[title="Deleted"]').text()).toBe("D")
  expect(window.localStorage.getItem("deskfleet.details-tab")).toBe("changes")
})

test("resources outside a worktree have no changes to show", async () => {
  const wrapper = await mountApp("/terminals/terminal-development-box-shell")
  await openTab(wrapper, "Changes")

  expect(panel(wrapper).text()).toContain("Changes are shown for resources in a worktree.")
})

test("arrow keys move between the panel tabs", async () => {
  const wrapper = await mountApp()
  const [details, changes] = panel(wrapper).findAll('[role="tab"]')

  await details!.trigger("keydown", { key: "ArrowRight" })
  expect(changes!.attributes("aria-selected")).toBe("true")
  expect(document.activeElement).toBe(changes!.element)
  await changes!.trigger("keydown", { key: "ArrowRight" })
  expect(details!.attributes("aria-selected")).toBe("true")
})

test("the details panel can be hidden", async () => {
  const wrapper = await mountApp()
  await wrapper.get('[aria-label="Hide details panel"]').trigger("click")

  expect(wrapper.find('aside[aria-label="Details"]').exists()).toBe(false)
  expect(wrapper.get("main header").classes()).toContain("titlebar-overlay-inset")
  expect(window.localStorage.getItem("deskfleet.details-open")).toBe("false")
})
