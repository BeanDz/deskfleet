//! Shared resources for deskfleet, independent of HTTP, Node.js, and persistence.
//!
//! Filesystem paths are strings interpreted by the owning machine. Deserializing
//! a record preserves them without accessing the filesystem.

mod directories;
mod ids;
mod resources;

pub use directories::{DirectoryBinding, DirectoryBindings, DirectoryBindingsError};
pub use ids::{AgentSessionId, MachineId, TeamId, TerminalSessionId, WorkspaceId, WorktreeId};
pub use resources::{
    AgentSession, Machine, Team, TerminalScope, TerminalSession, Workspace, Worktree,
};
