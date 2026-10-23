import { expect, test } from "vitest"
import type { AgentEvent } from "../../../../../daemon/src/agent-protocol.ts"
import { agentEvent, agentInput, agentSnapshot } from "../test/agent.ts"
import { projectConversation } from "./agent-conversation.ts"
const update = (seq: number, update: Record<string, unknown>) => agentEvent(seq, "acp", { sessionId: "provider-session", update } as AgentEvent["payload"])
test("reconstructs text around tools without user echoes or mutating the durable journal", () => {
  const input = agentInput({ state: "delivered" })
  const events = [agentEvent(1, "input", input), agentEvent(2, "input", input), update(3, { sessionUpdate: "user_message_chunk", content: { type: "text", text: "echo" } }), update(4, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hello " } }), update(5, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "world" } }), update(6, { sessionUpdate: "tool_call", toolCallId: "t1", title: "Read", status: "pending", rawInput: { path: "a.ts" } }), update(7, { sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", rawOutput: "contents" }), update(8, { sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Done" } })]
  const before = structuredClone(events)
  const snapshot = agentSnapshot(); snapshot.inputs = [input]
  const result = projectConversation(events, snapshot)
  expect(result.map(entry => entry.kind)).toEqual(["input", "message", "tool", "message"])
  expect(result[1]).toMatchObject({ content: [{ type: "text", text: "Hello world" }] })
  expect(result[2]).toMatchObject({ tool: { title: "Read", status: "completed", rawInput: { path: "a.ts" }, rawOutput: "contents" } })
  expect(events).toEqual(before)
})
test("message IDs group interleaved chunks while run generation isolates reused tool IDs", () => {
  const events = [update(1, { sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "First " } }), update(2, { sessionUpdate: "tool_call", toolCallId: "t1" }), update(3, { sessionUpdate: "agent_message_chunk", messageId: "m1", content: { type: "text", text: "last" } }), { ...update(4, { sessionUpdate: "tool_call", toolCallId: "t1" }), runGeneration: 2 }]
  const result = projectConversation(events, agentSnapshot())
  expect(result).toHaveLength(3)
  expect(result[0]).toMatchObject({ content: [{ text: "First last" }] })
  expect(result[1]!.id).not.toBe(result[2]!.id)
})
