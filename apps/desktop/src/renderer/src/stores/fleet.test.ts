import { createPinia, setActivePinia } from "pinia"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { catalogFixture, sessionWorktreeId, mainWorktreeId, workspaceId } from "../test/catalog.ts"
import { useFleetStore } from "./fleet.ts"

const stores: ReturnType<typeof useFleetStore>[] = []
let changed: () => void
beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(window.deskfleet.catalog, "onChanged").mockImplementation(listener => { changed = listener; return () => {} })
  vi.spyOn(window.deskfleet.catalog, "list").mockResolvedValue(catalogFixture())
})
afterEach(() => {
  for (const store of stores.splice(0)) store.$dispose()
  vi.restoreAllMocks()
})
function setup() { const store = useFleetStore(); stores.push(store); return store }

test("loads daemon resources with bigint strings and selects the automatic main worktree", async () => {
  const store = setup()
  expect(store.machines).toHaveLength(1)
  expect(store.newSessionTarget).toBeNull()
  await store.refreshLocalCatalog()
  expect(store.catalogIdentity).toEqual({ teamId: "1", machineId: "9007199254740999" })
  expect(store.machines[0]!.id).toBe("local-daemon")
  expect(store.findWorkspace(workspaceId)?.workspace.name).toBe("storefront")
  expect(store.newSessionTarget?.worktree.id).toBe(mainWorktreeId)
  expect(store.newSessionTarget?.worktree.sessionId).toBeUndefined()
  expect(store.findWorktree(mainWorktreeId)?.worktree.directories[0]!.git).toBeUndefined()
})

test("workspace updates replace the main directory list and preserve IDs; disconnection keeps the catalog read-only", async () => {
  const store = setup()
  await store.refreshLocalCatalog()
  const updated = catalogFixture().workspaces[0]!
  updated.name = "renamed"
  updated.worktrees[0]!.directories.reverse()
  const update = vi.spyOn(window.deskfleet.catalog, "updateWorkspace").mockResolvedValue(updated)
  const paths = [{ path: "/code/api" }, { path: "/code/web" }]
  await store.updateWorkspace(workspaceId, "renamed", paths)
  expect(update).toHaveBeenCalledWith(workspaceId, "renamed", paths)
  expect(store.findWorkspace(workspaceId)?.workspace.name).toBe("renamed")
  expect(store.findWorktree(mainWorktreeId)?.worktree.directories.map(({ path }) => path)).toEqual(paths.map(({ path }) => path))
  expect(store.newSessionTarget?.worktree.id).toBe(mainWorktreeId)
  vi.mocked(window.deskfleet.catalog.list).mockRejectedValueOnce(new Error("Daemon disconnected"))
  await store.refreshLocalCatalog()
  expect(store.catalogError).toBe("Daemon disconnected")
  expect(store.canManageCatalog).toBe(false)
  expect(store.findWorktree(mainWorktreeId)).not.toBeNull()
  await expect(store.updateWorkspace(workspaceId, "retry", paths)).rejects.toThrow("Daemon disconnected")
  expect(update).toHaveBeenCalledTimes(1)
})

test("session lifecycle notifications reconcile removed targets and workspace deletion clears the selection", async () => {
  const store = setup()
  await store.refreshLocalCatalog()
  store.targetWorktree(sessionWorktreeId)
  const updated = catalogFixture()
  updated.workspaces[0]!.worktrees = [updated.workspaces[0]!.worktrees[0]!]
  vi.mocked(window.deskfleet.catalog.list).mockResolvedValue(updated)
  changed()
  await vi.waitFor(() => expect(store.findWorktree(sessionWorktreeId)).toBeNull())
  expect(store.newSessionTarget?.worktree.id).toBe(mainWorktreeId)
  const remove = vi.spyOn(window.deskfleet.catalog, "deleteWorkspace").mockResolvedValue()
  await store.deleteWorkspace(workspaceId)
  expect(remove).toHaveBeenCalledWith(workspaceId)
  expect(store.newSessionTarget).toBeNull()
})
