import type { AgentEvent, AgentInput, AgentPermission, AgentSnapshot, AgentTurn } from "../../../../../daemon/src/agent-protocol.ts"

type Content = AgentInput["content"]
export type ConversationTool = AgentPermission["request"]["toolCall"]
export type ConversationEntry =
  | { id: string; kind: "input"; input: AgentInput }
  | { id: string; kind: "message"; role: "assistant" | "thought"; content: Content; turnId?: string }
  | { id: string; kind: "tool"; tool: ConversationTool; turnId?: string }
  | { id: string; kind: "turn"; turn: AgentTurn }
  | { id: string; kind: "plan"; entries: { content: string; status: string }[]; turnId?: string }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value)
export function readableValue(value: unknown): string {
  if (typeof value === "string") return value
  return value === undefined ? "" : JSON.stringify(value, null, 2)
}

/** Rebuild from committed event order; live ACP mirrors are deliberately excluded. */
export function projectConversation(events: AgentEvent[], snapshot: AgentSnapshot): ConversationEntry[] {
  const entries: ConversationEntry[] = []
  const inputs = new Map(snapshot.inputs.map(input => [input.id, input]))
  const seenInputs = new Set<string>()
  const messages = new Map<string, Extract<ConversationEntry, { kind: "message" }>>()
  const tools = new Map<string, Extract<ConversationEntry, { kind: "tool" }>>()
  const plans = new Map<string, Extract<ConversationEntry, { kind: "plan" }>>()
  for (const event of events) {
    if (event.kind === "input") {
      const input = event.payload as AgentInput
      const current = inputs.get(input.id) ?? input
      if (!["delivered", "dispatching", "uncertain"].includes(current.state) || !["delivered", "dispatching"].includes(input.state) || seenInputs.has(input.id)) continue
      entries.push({ id: `input-${input.id}`, kind: "input", input: current })
      seenInputs.add(input.id)
      continue
    }
    if (event.kind === "turn") {
      const turn = event.payload as AgentTurn
      if (["completed", "cancelled", "interrupted", "failed"].includes(turn.state)) entries.push({ id: `turn-${turn.id}`, kind: "turn", turn })
      continue
    }
    if (event.kind !== "acp" || !record(event.payload) || !record(event.payload.update)) continue
    const update = event.payload.update
    if (update.sessionUpdate === "agent_message_chunk" || update.sessionUpdate === "agent_thought_chunk") {
      if (!record(update.content) || typeof update.content.type !== "string") continue
      const role = update.sessionUpdate === "agent_thought_chunk" ? "thought" : "assistant"
      const meta = record(update._meta) && record(update._meta.deskfleet) ? update._meta.deskfleet : undefined
      const messageId = typeof update.messageId === "string" ? update.messageId : typeof meta?.messageId === "string" ? meta.messageId : undefined
      const key = messageId ? `${event.runGeneration ?? 0}:${role}:${messageId}` : undefined
      const previous = entries.at(-1)
      let entry = key ? messages.get(key) : previous?.kind === "message" && previous.role === role && previous.turnId === event.turnId ? previous : undefined
      if (!entry) {
        entry = { id: `message-${event.seq}`, kind: "message", role, content: [], turnId: event.turnId }
        entries.push(entry)
        if (key) messages.set(key, entry)
      }
      const content = update.content as Content[number]
      const last = entry.content.at(-1)
      if (last?.type === "text" && content.type === "text") last.text += content.text
      else entry.content.push({ ...content })
    } else if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") {
      if (typeof update.toolCallId !== "string") continue
      const key = `${event.runGeneration ?? 0}:${update.toolCallId}`
      let entry = tools.get(key)
      if (!entry) {
        entry = { id: `tool-${key}`, kind: "tool", tool: { toolCallId: update.toolCallId }, turnId: event.turnId }
        entries.push(entry)
        tools.set(key, entry)
      }
      for (const field of ["title", "kind", "status", "content", "rawInput", "rawOutput", "locations"] as const) {
        if (field in update) Object.assign(entry.tool, { [field]: update[field] ?? undefined })
      }
    } else if (update.sessionUpdate === "plan" && Array.isArray(update.entries)) {
      const key = event.turnId ?? `run-${event.runGeneration ?? 0}`
      let entry = plans.get(key)
      if (!entry) { entry = { id: `plan-${event.seq}`, kind: "plan", entries: [], turnId: event.turnId }; entries.push(entry); plans.set(key, entry) }
      entry.entries = update.entries.filter(record).map(value => ({ content: String(value.content ?? ""), status: String(value.status ?? "pending") }))
    }
  }
  return entries
}
