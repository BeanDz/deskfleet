import { flushPromises, mount } from "@vue/test-utils"
import { createPinia, setActivePinia } from "pinia"
import { createMemoryHistory, createRouter } from "vue-router"
import { afterEach, expect, test, vi } from "vitest"
import type { TerminalSummary } from "../../../../shared/terminal.ts"
import { i18n } from "../../i18n"
import { useTerminalsStore } from "../../stores/terminals.ts"
import TerminalWorkspace from "./TerminalWorkspace.vue"

const first: TerminalSummary = { id: "first", title: "user", cwd: "/home/user", cols: 80, rows: 24, status: "running" }
const second: TerminalSummary = { ...first, id: "second" }

afterEach(() => vi.restoreAllMocks())

async function setup() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const terminals = useTerminalsStore()
  terminals.sessions = [first, second]
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: "/terminals/:terminalId", name: "terminal", component: { template: "<div />" } },
      { path: "/machines/:machineId/terminals", name: "machine-terminals", component: { template: "<div />" } },
    ],
  })
  await router.push("/terminals/first")
  const hangup = vi.spyOn(terminals, "hangup").mockImplementation(async id => {
    terminals.sessions = terminals.sessions.filter(session => session.id !== id)
  })
  const create = vi.spyOn(terminals, "create").mockImplementation(async () => {
    const shell = { ...first, id: "third" }
    terminals.sessions.push(shell)
    return shell
  })
  const wrapper = mount(TerminalWorkspace, {
    props: { activeId: "first" },
    global: {
      plugins: [pinia, router, i18n],
      stubs: { LiveTerminal: { props: ["terminalId"], template: '<div data-shell :data-id="terminalId" />' } },
    },
  })
  return { wrapper, terminals, router, create, hangup }
}

test("tabs select independent shells without hanging up either and new tab dials another", async () => {
  const { wrapper, terminals, router, create, hangup } = await setup()
  expect(wrapper.findAll('[role="tab"]').map(tab => tab.text())).toEqual(["Shell 1", "Shell 2"])
  await wrapper.findAll('[role="tab"]')[1]!.trigger("click")
  await flushPromises()
  expect(router.currentRoute.value.params.terminalId).toBe("second")
  expect(hangup).not.toHaveBeenCalled()
  expect(terminals.sessions).toHaveLength(2)
  await wrapper.setProps({ activeId: "second" })
  expect(wrapper.get("[data-shell]").attributes("data-id")).toBe("second")
  await wrapper.get('[aria-label="New shell"]').trigger("click")
  await flushPromises()
  expect(create).toHaveBeenCalledOnce()
  expect(router.currentRoute.value.params.terminalId).toBe("third")
  expect(wrapper.findAll('[role="tab"]')).toHaveLength(3)
  wrapper.unmount()
  expect(hangup).not.toHaveBeenCalled()
})

test("hangup removes only that tab and selects its neighbor; final hangup leaves an empty workspace", async () => {
  const { wrapper, terminals, router, hangup } = await setup()
  await wrapper.get('[aria-label="Hang up Shell 1"]').trigger("click")
  await flushPromises()
  expect(hangup).toHaveBeenCalledWith("first")
  expect(terminals.sessions.map(({ id }) => id)).toEqual(["second"])
  expect(router.currentRoute.value.params.terminalId).toBe("second")
  await wrapper.setProps({ activeId: "second" })
  await wrapper.get('[aria-label="Hang up Shell 1"]').trigger("click")
  await flushPromises()
  expect(router.currentRoute.value.name).toBe("machine-terminals")
  await wrapper.setProps({ activeId: undefined })
  expect(wrapper.find('[role="tabpanel"]').exists()).toBe(false)
  expect(wrapper.text()).toContain("No open shells")
  wrapper.unmount()
})

test("a signaling hangup from another client removes the active tab and keyboard arrows select remaining tabs", async () => {
  const { wrapper, terminals, router, hangup } = await setup()
  await wrapper.findAll('[role="tab"]')[0]!.trigger("keydown", { key: "ArrowRight" })
  await flushPromises()
  expect(router.currentRoute.value.params.terminalId).toBe("second")
  await wrapper.setProps({ activeId: "second" })
  terminals.sessions = [first]
  await flushPromises()
  expect(router.currentRoute.value.params.terminalId).toBe("first")
  expect(hangup).not.toHaveBeenCalled()
  wrapper.unmount()
})
