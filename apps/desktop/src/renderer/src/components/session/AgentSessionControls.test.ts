import { mount, type VueWrapper } from "@vue/test-utils"
import { afterEach, expect, test } from "vitest"
import { i18n } from "../../i18n/index.ts"
import { agentEvent, agentInput, agentPermission, agentSnapshot, actor } from "../../test/agent.ts"
import AgentConversation from "./AgentConversation.vue"
import AgentBacklog from "./AgentBacklog.vue"
import AgentPermissions from "./AgentPermissions.vue"
import SessionComposer from "../composer/SessionComposer.vue"
const wrappers: VueWrapper[] = []
afterEach(() => { for (const wrapper of wrappers.splice(0)) wrapper.unmount() })
const button = (view: VueWrapper, name: string) => view.findAll("button").find(button => button.text() === name)!
test("backlog exposes steer/withdraw only for candidates and retry only for confirmed failures", async () => {
  const view = mount(AgentBacklog, { props: { inputs: [agentInput(), agentInput({ id: "41", state: "failed" }), agentInput({ id: "42", state: "uncertain" }), agentInput({ id: "43", state: "delivered" })], canSteer: true, disabled: false }, global: { plugins: [i18n] } }); wrappers.push(view)
  expect(view.findAll("li")).toHaveLength(3)
  await button(view, "Steer now").trigger("click"); expect(view.emitted("steer")).toEqual([["40"]])
  await button(view, "Withdraw").trigger("click"); expect(view.emitted("withdraw")).toEqual([["40"]])
  await button(view, "Retry delivery").trigger("click"); expect(view.emitted("retry")).toEqual([["41"]])
  expect(view.get('[data-input-id="42"]').find("button").exists()).toBe(false)
  await view.setProps({ canSteer: false }); expect(view.text()).not.toContain("Steer now")
})
test("permission choices disappear after another user answers and the winning actor is visible", async () => {
  const view = mount(AgentPermissions, { props: { permissions: [agentPermission()], disabled: false }, global: { plugins: [i18n] } }); wrappers.push(view)
  await button(view, "Allow once").trigger("click"); expect(view.emitted("respond")).toEqual([["60", "allow"]])
  await view.setProps({ permissions: [agentPermission({ state: "resolved", optionId: "deny", actor: { ...actor, userId: "Grace" } })] })
  expect(view.findAll("button")).toHaveLength(0)
  expect(view.text()).toContain("Reject · Grace")
})
test("composer uses explicit submit and steer and protects IME composition", async () => {
  const location = { machine: { id: "10", name: "Host", local: true, online: true, desktop: false, workspaces: [], terminals: [] }, workspace: { id: "20", name: "Workspace", directories: [], sessions: [], terminals: [] } }
  const view = mount(SessionComposer, { props: { location, modelValue: "Draft", activeTurn: true, canSteer: true }, global: { plugins: [i18n] } }); wrappers.push(view)
  await view.get("textarea").trigger("keydown", { key: "Enter", isComposing: true }); expect(view.emitted("submit")).toBeUndefined()
  await view.get("textarea").trigger("keydown", { key: "Enter", shiftKey: true }); expect(view.emitted("submit")).toBeUndefined()
  await view.get("textarea").trigger("keydown", { key: "Enter" }); expect(view.emitted("submit")).toEqual([["backlog"]])
  await button(view, "Steer now").trigger("click"); expect(view.emitted("submit")?.at(-1)).toEqual(["steer"])
  expect((view.get("textarea").element as HTMLTextAreaElement).value).toBe("Draft")
  await view.setProps({ submitting: true }); await view.get("textarea").trigger("keydown", { key: "Enter" }); expect(view.emitted("submit")).toHaveLength(2)
})


test("an active initial prompt shows progress while an unconfirmed steer still shows sending", () => {
  const initial = agentInput({ state: "dispatching", actualDelivery: "turn_start" })
  const steer = agentInput({ id: "41", state: "dispatching", requestedDelivery: "steer" })
  const snapshot = agentSnapshot(); snapshot.inputs = [initial, steer]
  const view = mount(AgentConversation, { props: { snapshot, events: [agentEvent(1, "input", initial), agentEvent(2, "input", steer)] }, global: { plugins: [i18n] } }); wrappers.push(view)
  expect(view.get('[data-conversation-entry="input-40"]').text()).toContain("In progress")
  expect(view.get('[data-conversation-entry="input-41"]').text()).toContain("Sending")
  expect(view.text()).not.toContain("Steered the turn")
})
