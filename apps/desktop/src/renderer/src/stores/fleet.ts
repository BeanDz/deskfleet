import { defineStore } from "pinia"
import { computed, ref } from "vue"
import type {
  AgentSessionSummary,
  MachineSummary,
  TerminalSessionSummary,
  WorkspaceSummary,
  WorktreeSummary,
} from "./fleet-types.ts"
import { placeholderMachines, placeholderTeam } from "./placeholder-fleet.ts"

export interface WorktreeLocation {
  machine: MachineSummary
  workspace: WorkspaceSummary
  worktree: WorktreeSummary
}

export interface SessionLocation extends WorktreeLocation {
  session: AgentSessionSummary
}

/** A terminal and its owner; the workspace and worktree are absent for broader scopes. */
export interface TerminalLocation {
  machine: MachineSummary
  workspace?: WorkspaceSummary
  worktree?: WorktreeSummary
  terminal: TerminalSessionSummary
}

function* terminalLocations(machines: MachineSummary[]): Generator<TerminalLocation> {
  for (const machine of machines) {
    for (const terminal of machine.terminals) yield { machine, terminal }
    for (const workspace of machine.workspaces) {
      for (const terminal of workspace.terminals) yield { machine, workspace, terminal }
      for (const worktree of workspace.worktrees) {
        for (const terminal of worktree.terminals) yield { machine, workspace, worktree, terminal }
      }
    }
  }
}

function* worktreeLocations(machines: MachineSummary[]): Generator<WorktreeLocation> {
  for (const machine of machines) {
    for (const workspace of machine.workspaces) {
      for (const worktree of workspace.worktrees) yield { machine, workspace, worktree }
    }
  }
}

/** The team's resource catalog and the worktree a new agent session starts in. */
export const useFleetStore = defineStore("fleet", () => {
  const team = ref(placeholderTeam)
  const machines = ref<MachineSummary[]>(placeholderMachines)
  // Offline machines start collapsed; their catalog may be stale.
  const collapsedMachineIds = ref(
    new Set(machines.value.filter((machine) => !machine.online).map((machine) => machine.id)),
  )

  const initialTarget =
    [...worktreeLocations(machines.value)].find(({ machine }) => machine.local) ??
    [...worktreeLocations(machines.value)].find(({ machine }) => machine.online)
  const targetWorktreeId = ref(initialTarget?.worktree.id ?? null)

  function findWorktree(worktreeId: string | null): WorktreeLocation | null {
    for (const location of worktreeLocations(machines.value)) {
      if (location.worktree.id === worktreeId) return location
    }
    return null
  }

  function findSession(sessionId: string): SessionLocation | null {
    for (const location of worktreeLocations(machines.value)) {
      const session = location.worktree.sessions.find(({ id }) => id === sessionId)
      if (session) return { ...location, session }
    }
    return null
  }

  function findTerminal(terminalId: string): TerminalLocation | null {
    for (const location of terminalLocations(machines.value)) {
      if (location.terminal.id === terminalId) return location
    }
    return null
  }

  function findMachine(machineId: string): MachineSummary | null {
    return machines.value.find(({ id }) => id === machineId) ?? null
  }

  const newSessionTarget = computed(() => findWorktree(targetWorktreeId.value))

  function isCollapsed(machineId: string): boolean {
    return collapsedMachineIds.value.has(machineId)
  }

  function toggleMachine(machineId: string): void {
    if (!collapsedMachineIds.value.delete(machineId)) collapsedMachineIds.value.add(machineId)
  }

  function targetWorktree(worktreeId: string): void {
    targetWorktreeId.value = worktreeId
  }

  return {
    team,
    machines,
    newSessionTarget,
    findMachine,
    findWorktree,
    findSession,
    findTerminal,
    isCollapsed,
    toggleMachine,
    targetWorktree,
  }
})
