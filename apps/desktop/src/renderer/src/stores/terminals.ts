import { defineStore } from "pinia"
import { onScopeDispose, ref } from "vue"
import type { TerminalSummary } from "../../../../../daemon/src/terminal-protocol.ts"
import { TerminalClient, type TerminalConnectionState, type TerminalListener } from "../services/terminal-client.ts"

/** Shell lifecycle uses signaling; the shared data-only peer carries terminal I/O. */
export const useTerminalsStore = defineStore("terminals", () => {
  const sessions = ref<TerminalSummary[]>([])
  const state = ref<TerminalConnectionState>("idle")
  const error = ref<string | null>(null)
  let client: TerminalClient | null = null
  let refreshing: Promise<void> | null = null
  const unsubscribe = window.deskfleet.terminal.onSessionEvent((event) => {
    if (event.kind === "terminalChanged") remember(event.terminal)
    else sessions.value = sessions.value.filter(({ id }) => id !== event.terminalId)
  })

  function connection(): TerminalClient {
    client ??= new TerminalClient(window.deskfleet.terminal, (next, detail) => {
      state.value = next
      error.value = detail ?? null
    }, (event) => {
      if (event.kind !== "exit") return
      const terminal = sessions.value.find(({ id }) => id === event.sessionId)
      if (terminal) Object.assign(terminal, { status: "exited", exitCode: event.exitCode })
    })
    return client
  }

  function remember(summary: TerminalSummary): TerminalSummary {
    const index = sessions.value.findIndex(({ id }) => id === summary.id)
    if (index === -1) sessions.value.push(summary)
    else sessions.value[index] = summary
    return summary
  }

  function refresh(): Promise<void> {
    refreshing ??= window.deskfleet.terminal.list().then((result) => {
      sessions.value = result
      error.value = null
    }).catch((reason: unknown) => {
      error.value = reason instanceof Error ? reason.message : String(reason)
    }).finally(() => { refreshing = null })
    return refreshing
  }

  async function create(cols = 80, rows = 24, cwd?: string): Promise<TerminalSummary> {
    error.value = null
    return remember(await window.deskfleet.terminal.dial({ mode: "create", terminalId: crypto.randomUUID(), cols, rows, ...(cwd === undefined ? {} : { cwd }) }))
  }

  function attach(sessionId: string, listener: TerminalListener) {
    const active = connection()
    const unsubscribe = active.subscribe(sessionId, listener)
    let detached = false
    const ready = window.deskfleet.terminal.dial({ mode: "resume", terminalId: sessionId }).then(async () => {
      if (detached) throw new Error("Terminal attachment was cancelled")
      const summary = await active.call("attach", { sessionId })
      if (detached) {
        await active.call("detach", { sessionId })
        throw new Error("Terminal attachment was cancelled")
      }
      return remember(summary)
    })
    return { ready, detach: () => { detached = true; unsubscribe() } }
  }

  const input = (sessionId: string, data: string) => connection().input(sessionId, data)
  const resize = (sessionId: string, cols: number, rows: number) => connection().call("resize", { sessionId, cols, rows })
  async function hangup(sessionId: string): Promise<void> {
    await window.deskfleet.terminal.hangup(sessionId)
    sessions.value = sessions.value.filter(({ id }) => id !== sessionId)
  }

  onScopeDispose(() => { unsubscribe(); client?.close() })
  return { sessions, state, error, refresh, create, attach, input, resize, hangup }
})
