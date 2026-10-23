// Client view models for the resource catalog.

export interface TeamSummary {
  id: string
  name: string
}

export interface AgentSessionSummary {
  id: string
  title: string
  /** The agent provider's user-facing name. */
  provider: string
}

/** A terminal owned by a machine, workspace, or worktree. Its cwd can change freely. */
export interface TerminalSessionSummary {
  id: string
  title: string
  cwd: string
}

export type GitChangeStatus = "modified" | "added" | "deleted" | "renamed" | "untracked"

export interface GitChange {
  /** Relative to the checkout root. */
  path: string
  status: GitChangeStatus
  additions: number
  deletions: number
}

/** Read-only state of the checkout a directory resolves to. */
export interface GitCheckoutSummary {
  branch: string
  /** Abbreviated HEAD commit. */
  head: string
  changes: GitChange[]
}

/** A named path on the worktree's machine. */
export interface DirectoryBinding {
  name: string
  path: string
  /** Null when the directory is not inside a Git checkout. */
  git: GitCheckoutSummary | null
}

export interface WorktreeSummary {
  id: string
  name: string
  directories: DirectoryBinding[]
  /** Most recent first. */
  sessions: AgentSessionSummary[]
  terminals: TerminalSessionSummary[]
}

export interface WorkspaceSummary {
  id: string
  name: string
  terminals: TerminalSessionSummary[]
  worktrees: WorktreeSummary[]
}

export interface MachineSummary {
  id: string
  name: string
  /** Whether this is the machine running the desktop client. */
  local: boolean
  online: boolean
  /** When the catalog last observed the machine; shown while it is offline. */
  lastSeen?: string
  /** Whether the machine has a graphical session to share; headless machines do not. */
  desktop: boolean
  terminals: TerminalSessionSummary[]
  workspaces: WorkspaceSummary[]
}
