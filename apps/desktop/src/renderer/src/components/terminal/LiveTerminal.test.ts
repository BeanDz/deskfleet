import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { defineComponent, onMounted } from "vue"
import { expect, test, vi } from "vitest"
import type { TerminalSummary } from "../../../../../../daemon/src/terminal-protocol.ts"
import { i18n } from "../../i18n"
import type { TerminalListener } from "../../services/terminal-client.ts"
import { useTerminalsStore } from "../../stores/terminals.ts"
import { deferred } from "../../test/desktop-media.ts"
import LiveTerminal from "./LiveTerminal.vue"

function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const terminals = useTerminalsStore()
  const pending = deferred<TerminalSummary>()
  const detach = vi.fn()
  let listener: TerminalListener = () => {}
  vi.spyOn(terminals, "attach").mockImplementation((_id, receive) => {
    listener = receive
    return { ready: pending.promise, detach }
  })
  vi.spyOn(terminals, "resize").mockResolvedValue(null)
  vi.spyOn(terminals, "input").mockResolvedValue()
  vi.spyOn(terminals, "hangup").mockResolvedValue()
  const write = vi.fn<(data: Uint8Array, consumed: () => void) => void>()
  const reset = vi.fn()
  const focus = vi.fn()
  const surface = defineComponent({
    props: ["interactive", "scrollback"],
    emits: ["ready", "input", "resize"],
    setup(_props, { emit, expose }) {
      expose({ write, reset, focus })
      onMounted(() => emit("ready", { cols: 100, rows: 30 }))
    },
    template: '<div data-surface :data-interactive="interactive" :data-scrollback="scrollback" />',
  })
  const wrapper = mount(LiveTerminal, {
    props: { terminalId: "terminal-1" },
    global: { plugins: [pinia, i18n], stubs: { TerminalSurface: surface } },
  })
  const resolve = (status: TerminalSummary["status"] = "running") => pending.resolve({ id: "terminal-1", title: "zsh", cwd: "/home/user", cols: 80, rows: 24, status })
  return { wrapper, terminals, detach, write, reset, focus, resolve, emit: (...args: Parameters<TerminalListener>) => listener(...args) }
}

test("renders byte output and acknowledges only when xterm consumed it; leaving detaches the running shell", async () => {
  const fixture = setup()
  await flushPromises()
  expect(fixture.wrapper.get('[role="status"]').text()).toBe("Connecting…")
  fixture.resolve()
  await flushPromises()
  expect(fixture.wrapper.get("[data-surface]").attributes("data-interactive")).toBe("false")
  expect(fixture.wrapper.get('[role="status"]').text()).toBe("Restoring terminal history…")
  expect(fixture.terminals.resize).not.toHaveBeenCalled()
  fixture.emit({ kind: "ready", sessionId: "terminal-1" }, () => {})
  await flushPromises()
  expect(fixture.terminals.resize).toHaveBeenCalledWith("terminal-1", 100, 30)
  expect(fixture.wrapper.get("[data-surface]").attributes("data-interactive")).toBe("true")
  fixture.emit({ kind: "reset", sessionId: "terminal-1" }, () => {})
  expect(fixture.reset).toHaveBeenCalledOnce()
  const acknowledge = vi.fn()
  fixture.emit({ kind: "output", sessionId: "terminal-1", data: "aGk=", offset: 2 }, acknowledge)
  expect(fixture.write.mock.calls[0]![0]).toEqual(new Uint8Array([104, 105]))
  expect(acknowledge).not.toHaveBeenCalled()
  fixture.write.mock.calls[0]![1]()
  expect(acknowledge).toHaveBeenCalledOnce()
  fixture.wrapper.unmount()
  expect(fixture.detach).toHaveBeenCalledOnce()
  expect(fixture.terminals.hangup).not.toHaveBeenCalled()
})

test("a disconnected terminal disables input and an unknown exit code stays unknown", async () => {
  const fixture = setup()
  fixture.resolve()
  await flushPromises()
  fixture.emit({ kind: "ready", sessionId: "terminal-1" }, () => {})
  fixture.emit({ kind: "error", sessionId: "terminal-1", error: "Peer disconnected" }, () => {})
  await flushPromises()
  expect(fixture.wrapper.get("[data-surface]").attributes("data-interactive")).toBe("false")
  expect(fixture.wrapper.get('[role="alert"]').text()).toBe("Peer disconnected")
  expect(fixture.wrapper.text()).toContain("Reconnect")
  fixture.emit({ kind: "exit", sessionId: "terminal-1" }, () => {})
  await flushPromises()
  expect(fixture.wrapper.get('[role="status"]').text()).toBe("Process ended")
  fixture.wrapper.unmount()
})

test("restores interrupted history read-only and can request a larger scrollback", async () => {
  const fixture = setup()
  fixture.resolve("interrupted")
  await flushPromises()
  fixture.emit({ kind: "ready", sessionId: "terminal-1" }, () => {})
  await flushPromises()
  expect(fixture.wrapper.get('[role="status"]').text()).toContain("Shell interrupted")
  expect(fixture.wrapper.get("[data-surface]").attributes("data-interactive")).toBe("false")
  expect(fixture.terminals.resize).not.toHaveBeenCalled()
  await fixture.wrapper.findAll("button").find(button => button.text() === "Load more history")!.trigger("click")
  await flushPromises()
  expect(fixture.wrapper.get("[data-surface]").attributes("data-scrollback")).toBe("10000")
  expect(fixture.terminals.attach).toHaveBeenCalledTimes(2)
  expect(fixture.detach).toHaveBeenCalledOnce()
  fixture.wrapper.unmount()
})

test("a late attachment response does not resize or focus a terminal after its view has left", async () => {
  const fixture = setup()
  fixture.wrapper.unmount()
  fixture.resolve()
  await flushPromises()
  expect(fixture.detach).toHaveBeenCalledOnce()
  expect(fixture.terminals.resize).not.toHaveBeenCalled()
  expect(fixture.focus).not.toHaveBeenCalled()
})

test("renders the terminal and scrollback count in the supported Chinese locale", async () => {
  const previousLocale = i18n.global.locale.value
  i18n.global.locale.value = "zh-cmn-Hans-CN"
  try {
    const fixture = setup()
    try {
      await flushPromises()
      expect(fixture.wrapper.get('[role="status"]').text()).toBe("连接中…")
      expect(fixture.wrapper.text()).toContain("可回看 5,000 行")
      expect(fixture.wrapper.find("[data-surface]").exists()).toBe(true)
      fixture.resolve()
      await flushPromises()
      fixture.emit({ kind: "ready", sessionId: "terminal-1" }, () => {})
      await flushPromises()
      await fixture.wrapper.findAll("button").find(button => button.text() === "加载更多历史")!.trigger("click")
      expect(fixture.wrapper.text()).toContain("可回看 10,000 行")
    } finally { fixture.wrapper.unmount() }
  } finally { i18n.global.locale.value = previousLocale }
})
