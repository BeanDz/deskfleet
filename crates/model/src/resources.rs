use serde::{Deserialize, Serialize};

use crate::{
    AgentSessionId, DirectoryBindings, MachineId, TeamId, TerminalSessionId, WorkspaceId,
    WorktreeId,
};

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Team {
    pub id: TeamId,
    pub name: String,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Machine {
    pub id: MachineId,
    pub team_id: TeamId,
    pub name: String,
}

/// A grouping of worktrees on one machine, without an implied filesystem root.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Workspace {
    pub id: WorkspaceId,
    pub machine_id: MachineId,
    pub name: String,
}

/// A working context spanning directories, not necessarily one Git worktree.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct Worktree {
    pub id: WorktreeId,
    pub workspace_id: WorkspaceId,
    pub name: String,
    pub directories: DirectoryBindings,
}

/// An agent's resource association and the directory context captured at startup.
///
/// The owning machine and workspace are resolved through the worktree hierarchy.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct AgentSession {
    pub id: AgentSessionId,
    pub worktree_id: WorktreeId,
    pub provider: String,
    pub provider_session_id: Option<String>,
    pub cwd: String,
    pub directories: DirectoryBindings,
}

/// Exactly one owning scope; the scope does not confine the terminal's filesystem.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    content = "id",
    rename_all = "snake_case",
    deny_unknown_fields
)]
pub enum TerminalScope {
    Machine(MachineId),
    Workspace(WorkspaceId),
    Worktree(WorktreeId),
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: TerminalSessionId,
    pub scope: TerminalScope,
    /// Current or initial machine-local working directory, independent of scope.
    pub cwd: String,
    /// Optional context; it does not replace the terminal's owning scope.
    pub agent_session_id: Option<AgentSessionId>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use uuid::Uuid;

    #[test]
    fn terminal_scope_wire_format_preserves_all_three_ownership_levels() {
        let id = Uuid::from_u128(1);
        for (scope, kind) in [
            (TerminalScope::Machine(id.into()), "machine"),
            (TerminalScope::Workspace(id.into()), "workspace"),
            (TerminalScope::Worktree(id.into()), "worktree"),
        ] {
            let wire = json!({"kind": kind, "id": id.to_string()});
            assert_eq!(serde_json::to_value(scope).unwrap(), wire);
            assert_eq!(
                serde_json::from_value::<TerminalScope>(wire).unwrap(),
                scope
            );
        }
    }

    #[test]
    fn terminal_scope_rejects_ambiguous_or_unknown_ownership() {
        for invalid in [
            json!({"kind": "project", "id": Uuid::nil().to_string()}),
            json!({
                "kind": "machine",
                "id": Uuid::nil().to_string(),
                "workspace_id": Uuid::nil().to_string()
            }),
        ] {
            assert!(serde_json::from_value::<TerminalScope>(invalid).is_err());
        }
    }
}
