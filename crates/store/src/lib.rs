//! Persistent resource catalog, separate from transport and shared domain types.

mod catalog;
pub mod entities;
mod local;

pub use catalog::{Catalog, CatalogWorkspace};
pub use local::{LocalCatalog, LocalSnapshot};

use deskfleet_migration::{Migrator, MigratorTrait};
use deskfleet_model::DirectoryBindingsError;
use sea_orm::{ConnectOptions, Database, DatabaseConnection, DbErr};
use thiserror::Error;

/// A database failure or invalid persisted directory collection.
#[derive(Debug, Error)]
pub enum StoreError {
    #[error(transparent)]
    Database(#[from] DbErr),
    #[error("invalid stored directory bindings: {0}")]
    DirectoryBindings(#[from] DirectoryBindingsError),
    #[error("too many directory bindings to store their positions")]
    TooManyDirectories,
    #[error("{kind} {id} was not found on this machine")]
    NotFound { kind: &'static str, id: i64 },
    #[error("workspace {workspace_id} does not have exactly one main worktree")]
    MissingMainWorktree { workspace_id: i64 },
    #[error("workspace {workspace_id} still has active sessions")]
    WorkspaceHasSessions { workspace_id: i64 },
}

/// Open the catalog and apply all pending migrations before serving requests.
///
/// SQLite foreign keys are enabled by the SQLx driver. A single connection also
/// keeps an in-memory database consistent across calls and serializes writers.
///
/// # Errors
/// Returns an error if opening the database or applying a migration fails.
pub async fn connect(database_url: &str) -> Result<DatabaseConnection, DbErr> {
    let mut options = ConnectOptions::new(database_url);
    options.max_connections(1).sqlx_logging(false);
    let database = Database::connect(options).await?;
    Migrator::up(&database, None).await?;
    Ok(database)
}
