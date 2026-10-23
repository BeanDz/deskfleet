import { defineStore } from "pinia"
import { computed, onScopeDispose, ref, watch } from "vue"
import type { CatalogDirectory, CatalogSnapshot, CatalogWorktree, CatalogWorkspace } from "../../../shared/catalog.ts"
import type { LocalDesktopTarget } from "../../../shared/desktop-media.ts"
import type { AgentSessionSummary, MachineSummary, TerminalSessionSummary, WorkspaceSummary, WorktreeSummary } from "./fleet-types.ts"
import { useTerminalsStore } from "./terminals.ts"

export interface WorkspaceLocation {
  machine: MachineSummary
  workspace: WorkspaceSummary
}
export interface SessionLocation extends WorkspaceLocation {
  session: AgentSessionSummary
  worktree: WorktreeSummary
}
/** Every worktree exposed by the client belongs to a Session. */
export type WorktreeLocation = SessionLocation
/** Ownership is explicit; a terminal's working directory never determines its scope. */
export interface TerminalLocation {
  machine: MachineSummary
  workspace?: WorkspaceSummary
  session?: AgentSessionSummary
  worktree?: WorktreeSummary
  terminal: TerminalSessionSummary
}

function* worktreeLocations(machines: MachineSummary[]): Generator<WorktreeLocation> {
  for (const machine of machines) for (const workspace of machine.workspaces) {
    for (const session of workspace.sessions) yield { machine, workspace, session, worktree: session.worktree }
  }
}
function* terminalLocations(machines: MachineSummary[]): Generator<TerminalLocation> {
  for (const machine of machines) {
    for (const terminal of machine.terminals) yield { machine, terminal }
    for (const workspace of machine.workspaces) {
      for (const terminal of workspace.terminals) yield { machine, workspace, terminal }
      for (const session of workspace.sessions) {
        for (const terminal of session.worktree.terminals) yield { machine, workspace, session, worktree: session.worktree, terminal }
      }
    }
  }
}
function worktreeSummary(value: CatalogWorktree): WorktreeSummary {
  return { id: value.id, directories: value.directories.map(directory => ({ ...directory, git: undefined })), terminals: [] }
}
function workspaceSummary(value: CatalogWorkspace): WorkspaceSummary {
  const main = value.worktrees.find(worktree => worktree.sessionId === undefined)
  return {
    id: value.id,
    name: value.name,
    directories: main?.directories.map(directory => ({ ...directory, git: undefined })) ?? [],
    sessions: value.worktrees.flatMap(worktree => worktree.sessionId === undefined ? [] : [{ id: worktree.sessionId, worktree: worktreeSummary(worktree) }]),
    terminals: [],
  }
}

/** Local daemon resources; database IDs and connection targets have separate identities. */
export const useFleetStore = defineStore("fleet", () => {
  const localDesktopTarget = ref<LocalDesktopTarget>({ id: "local-daemon", name: "localhost", online: false, desktop: false })
  const machines = ref<MachineSummary[]>([{ ...localDesktopTarget.value, local: true, terminals: [], workspaces: [] }])
  const catalogIdentity = ref<{ teamId: string; machineId: string } | null>(null)
  const catalogError = ref<string | null>(null)
  const catalogLoading = ref(false)
  const catalogReady = ref(false)
  const targetWorkspaceId = ref<string | null>(null)
  const collapsedMachineIds = ref(new Set<string>())
  const terminals = useTerminalsStore()
  const localMachine = () => machines.value.find(({ id }) => id === "local-daemon")!
  watch(() => terminals.sessions, sessions => { localMachine().terminals = sessions }, { immediate: true })
  let refreshingTarget: Promise<LocalDesktopTarget> | null = null
  let refreshingCatalog: Promise<void> | null = null
  let refreshRequested = false

  function findWorkspace(workspaceId: string): WorkspaceLocation | null {
    for (const machine of machines.value) {
      const workspace = machine.workspaces.find(({ id }) => id === workspaceId)
      if (workspace) return { machine, workspace }
    }
    return null
  }
  function findWorktree(worktreeId: string | null): WorktreeLocation | null {
    return [...worktreeLocations(machines.value)].find(({ worktree }) => worktree.id === worktreeId) ?? null
  }
  function reconcileTarget(): void {
    if (!targetWorkspaceId.value || !findWorkspace(targetWorkspaceId.value)) targetWorkspaceId.value = localMachine().workspaces[0]?.id ?? null
  }
  function applySnapshot(snapshot: CatalogSnapshot): void {
    catalogIdentity.value = { teamId: snapshot.teamId, machineId: snapshot.machineId }
    localMachine().workspaces = snapshot.workspaces.map(workspaceSummary)
    localMachine().name = snapshot.machineName
    localMachine().online = true
    localDesktopTarget.value = { ...localDesktopTarget.value, name: snapshot.machineName, online: true, error: undefined }
    catalogReady.value = true
    catalogError.value = null
    reconcileTarget()
  }
  function refreshLocalDesktop(): Promise<LocalDesktopTarget> {
    refreshingTarget ??= window.deskfleet.desktop.target().catch((error: unknown) => ({
      ...localDesktopTarget.value, online: false, error: error instanceof Error ? error.message : String(error),
    })).then(target => {
      localDesktopTarget.value = target
      Object.assign(localMachine(), { name: target.name, online: target.online, desktop: target.desktop })
      if (!target.online) catalogReady.value = false
      return target
    }).finally(() => { refreshingTarget = null })
    return refreshingTarget
  }
  function refreshLocalCatalog(): Promise<void> {
    refreshRequested = true
    refreshingCatalog ??= (async () => {
      catalogLoading.value = true
      try {
        do {
          refreshRequested = false
          const snapshot = await window.deskfleet.catalog.list()
          if (!refreshRequested) applySnapshot(snapshot)
        } while (refreshRequested)
      } catch (error) {
        catalogError.value = error instanceof Error ? error.message : String(error)
        catalogReady.value = false
        localMachine().online = false
        localDesktopTarget.value = { ...localDesktopTarget.value, online: false }
      } finally {
        catalogLoading.value = false
        refreshingCatalog = null
      }
    })()
    return refreshingCatalog
  }
  async function refreshLocal(): Promise<void> {
    await refreshLocalDesktop()
    await refreshLocalCatalog()
  }
  const unsubscribe = window.deskfleet.catalog.onChanged(() => { void refreshLocalCatalog() })
  onScopeDispose(unsubscribe)
  const canManageCatalog = computed(() => localMachine().online && catalogReady.value)
  function requireLocalCatalog(): void {
    if (!canManageCatalog.value) throw new Error(catalogError.value ?? "The local daemon is unavailable")
  }
  function requireWorkspace(id: string): WorkspaceLocation {
    requireLocalCatalog()
    const location = findWorkspace(id)
    if (!location || !location.machine.local) throw new Error("Workspace is not on the local daemon")
    return location
  }
  async function createWorkspace(name: string, directories: CatalogDirectory[]): Promise<CatalogWorkspace> {
    requireLocalCatalog()
    const value = await window.deskfleet.catalog.createWorkspace(name, directories)
    const existing = findWorkspace(value.id)
    if (existing) Object.assign(existing.workspace, workspaceSummary(value))
    else localMachine().workspaces.push(workspaceSummary(value))
    targetWorkspaceId.value = value.id
    return value
  }
  async function updateWorkspace(id: string, name: string, directories: CatalogDirectory[]): Promise<void> {
    requireWorkspace(id)
    const value = await window.deskfleet.catalog.updateWorkspace(id, name, directories)
    const current = findWorkspace(id)
    if (current) Object.assign(current.workspace, workspaceSummary(value))
    reconcileTarget()
  }
  async function deleteWorkspace(id: string): Promise<void> {
    requireWorkspace(id)
    await window.deskfleet.catalog.deleteWorkspace(id)
    localMachine().workspaces = localMachine().workspaces.filter(workspace => workspace.id !== id)
    reconcileTarget()
  }
  function findSession(sessionId: string): SessionLocation | null {
    return [...worktreeLocations(machines.value)].find(({ session }) => session.id === sessionId) ?? null
  }
  function findTerminal(id: string): TerminalLocation | null {
    return [...terminalLocations(machines.value)].find(({ terminal }) => terminal.id === id) ?? null
  }
  function findMachine(id: string): MachineSummary | null { return machines.value.find(machine => machine.id === id) ?? null }
  function isCollapsed(id: string): boolean { return collapsedMachineIds.value.has(id) }
  function toggleMachine(id: string): void { if (!collapsedMachineIds.value.delete(id)) collapsedMachineIds.value.add(id) }
  function targetWorkspace(id: string): void { targetWorkspaceId.value = id }
  const newSessionTarget = computed(() => targetWorkspaceId.value ? findWorkspace(targetWorkspaceId.value) : null)

  return {
    machines, catalogIdentity, catalogError, catalogLoading, canManageCatalog,
    localDesktopTarget, refreshLocalDesktop, refreshLocalCatalog, refreshLocal,
    createWorkspace, updateWorkspace, deleteWorkspace,
    newSessionTarget, findMachine, findWorkspace, findWorktree, findSession, findTerminal,
    isCollapsed, toggleMachine, targetWorkspaceId, targetWorkspace,
  }
})
