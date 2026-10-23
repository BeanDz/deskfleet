import { computed } from "vue"
import { useRoute } from "vue-router"
import type { AgentSessionSummary, MachineSummary } from "../stores/fleet-types.ts"
import { useFleetStore, type TerminalLocation, type WorktreeLocation } from "../stores/fleet.ts"

/** The resource the current route shows, as context for the details panel. */
export type RouteResource =
  | ({ kind: "worktree" } & WorktreeLocation)
  | ({ kind: "session"; session: AgentSessionSummary } & WorktreeLocation)
  | ({ kind: "terminal" } & TerminalLocation)
  | { kind: "desktop"; machine: MachineSummary }

function param(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : ""
}

export function useRouteResource() {
  const route = useRoute()
  const fleet = useFleetStore()

  const resource = computed<RouteResource | null>(() => {
    switch (route.name) {
      case "worktree": {
        const location = fleet.findWorktree(param(route.params.worktreeId))
        return location && { kind: "worktree", ...location }
      }
      case "session": {
        const location = fleet.findSession(param(route.params.sessionId))
        return location && { kind: "session", ...location }
      }
      case "terminal": {
        const location = fleet.findTerminal(param(route.params.terminalId))
        return location && { kind: "terminal", ...location }
      }
      case "machine-desktop": {
        const machine = fleet.findMachine(param(route.params.machineId))
        return machine && { kind: "desktop", machine }
      }
      case "new-session": {
        const location = fleet.newSessionTarget
        return location && { kind: "worktree", ...location }
      }
      default:
        return null
    }
  })

  /** Terminals and desktops outside a worktree have no Git changes to show. */
  const worktree = computed<WorktreeLocation | null>(() => {
    const value = resource.value
    if (!value || value.kind === "desktop") return null
    const { machine, workspace, worktree } = value
    return workspace && worktree ? { machine, workspace, worktree } : null
  })

  return { resource, worktree }
}
