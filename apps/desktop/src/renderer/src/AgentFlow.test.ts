import { flushPromises, mount, type VueWrapper } from "@vue/test-utils"
import { createPinia, disposePinia } from "pinia"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { AgentEvent, AgentSnapshot } from "../../../../daemon/src/agent-protocol.ts"
import App from "./App.vue"
import { i18n } from "./i18n/index.ts"
import { router } from "./router/index.ts"
import { agentInput, agentPermission, agentSnapshot } from "./test/agent.ts"
import { catalogFixture, workspaceId } from "./test/catalog.ts"
const transport = vi.hoisted(() => ({ call: vi.fn(), receive: (_value: { method: string; params: unknown }) => {}, state: (_state: string) => {} }))
vi.mock("./services/agent-client.ts", () => ({ AgentClient: class {
  constructor(_api: unknown, state: typeof transport.state, receive: typeof transport.receive) { transport.state = state; transport.receive = receive }
  connect = async () => { transport.state("connected") }
  call = transport.call
  close = () => {}
} }))
let wrapper: VueWrapper
let pinia: ReturnType<typeof createPinia>
let snapshot: AgentSnapshot
let events: AgentEvent[]
const button = (text: string) => wrapper.findAll("button").find(button => button.text() === text)!
function emit(kind: AgentEvent["kind"], payload: AgentEvent["payload"]): void {
  const event: AgentEvent = { sessionId: "30", seq: String(events.length + 1), kind, payload, createdAt: "now", runGeneration: 1, turnId: "70" }
  events.push(event); snapshot.session.lastEventSeq = event.seq
  transport.receive({ method: "_deskfleet/session/event", params: structuredClone(event) })
}
beforeEach(async () => {
  snapshot = agentSnapshot(); snapshot.session.workspaceId = workspaceId
  events = []
  const catalog = catalogFixture()
  vi.spyOn(window.deskfleet.catalog, "list").mockImplementation(async () => structuredClone(catalog))
  vi.spyOn(window.deskfleet.desktop, "target").mockResolvedValue({ id: "local-daemon", name: "Host", online: true, desktop: true })
  transport.call.mockReset().mockImplementation(async (method: string, params: Record<string, unknown>) => {
    if (method === "initialize") return {}
    if (method === "_deskfleet/session/list") return []
    if (method === "_deskfleet/session/create") {
      snapshot.session.title = String(params.title)
      catalog.workspaces[0]!.worktrees.push({ id: "31", sessionId: "30", workspaceId, directories: [{ path: "/worktree/new" }] })
      return structuredClone(snapshot)
    }
    if (method === "_deskfleet/session/subscribe") return structuredClone(snapshot)
    if (method === "_deskfleet/session/history") return structuredClone(events.filter(event => BigInt(event.seq) > BigInt(String(params.afterSeq))))
    if (method === "_deskfleet/input/submit") {
      const input = agentInput({ content: params.content as ReturnType<typeof agentInput>["content"] })
      snapshot.inputs = [input]; emit("input", input)
      return { operationId: params.operationId, commandId: "50", sessionId: "30", inputId: "40" }
    }
    return null
  })
  await router.push("/")
  pinia = createPinia()
  wrapper = mount(App, { global: { plugins: [pinia, router, i18n], stubs: { Teleport: true, LiveTerminal: true } } })
  await flushPromises()
})
afterEach(() => { wrapper?.unmount(); disposePinia(pinia); vi.restoreAllMocks() })

test("a workspace prompt creates a Session, keeps shared candidates, streams tools and preserves execution when navigating away", async () => {
  await wrapper.get("textarea").setValue("Implement the feature")
  await wrapper.get('[aria-label="Send"]').trigger("click")
  await flushPromises()
  await vi.waitFor(() => expect(router.currentRoute.value.params.sessionId).toBe("30"))
  expect(transport.call.mock.calls.find(([method]) => method === "_deskfleet/session/create")?.[1]).toMatchObject({ workspaceId, title: "Implement the feature", provider: "codex", operationId: expect.any(String) })
  expect(wrapper.get('[aria-label="Candidate backlog"]').text()).toContain("Implement the feature")
  expect(wrapper.find('a[href="#/worktrees/31"]').exists()).toBe(true)
  const delivered = agentInput({ content: [{ type: "text", text: "Implement the feature" }], state: "delivered", turnId: "70", actualDelivery: "turn_start" })
  emit("input", delivered)
  emit("turn", { id: "70", sessionId: "30", initialInputId: "40", dispatchCommandId: "50", runGeneration: 1, state: "running", startedAt: "now" })
  emit("acp", { sessionId: "provider", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Reading the files" } } })
  emit("acp", { sessionId: "provider", update: { sessionUpdate: "tool_call", toolCallId: "tool-1", title: "Read file", status: "in_progress" } })
  emit("permission", agentPermission())
  await flushPromises()
  expect(wrapper.get('[aria-label="Conversation"]').text()).toContain("Reading the files")
  expect(wrapper.get('[aria-label="Conversation"]').text()).toContain("Read file")
  expect(button("Allow once").exists()).toBe(true)
  emit("permission", agentPermission({ state: "resolved", optionId: "deny", actor: { kind: "user", userId: "Grace", sourceMachine: { originId: "remote", id: "99" } } }))
  await flushPromises()
  expect(wrapper.get('[aria-label="Permissions"]').findAll("button")).toHaveLength(0)
  expect(wrapper.get('[aria-label="Permissions"]').text()).toContain("Grace")
  await router.push({ name: "workspace", params: { workspaceId } }); await flushPromises()
  expect(transport.call.mock.calls.some(([method]) => method === "_deskfleet/session/stop" || method === "_deskfleet/turn/cancel")).toBe(false)
})
