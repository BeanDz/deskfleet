use std::{
    path::PathBuf,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use deskfleet_model::{DirectoryBinding, DirectoryBindings};
use deskfleet_store::{Catalog, LocalCatalog, StoreError};
use sea_orm::{ConnectOptions, Database, DatabaseConnection};

struct TempDatabase(PathBuf);
static NEXT_DATABASE_ID: AtomicU64 = AtomicU64::new(0);

impl TempDatabase {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let id = NEXT_DATABASE_ID.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "deskfleet-local-{}-{nonce}-{id}",
            std::process::id()
        ));
        std::fs::create_dir(&path).unwrap();
        Self(path)
    }
    fn path(&self) -> PathBuf {
        self.0.join(if cfg!(windows) {
            "catalog # 100%.db"
        } else {
            "catalog ? # 100%.db"
        })
    }
    async fn database(&self) -> DatabaseConnection {
        let path = self.path();
        let mut options = ConnectOptions::new("sqlite:");
        options.max_connections(1).sqlx_logging(false);
        options.map_sqlx_sqlite_opts(move |options| options.filename(&path));
        Database::connect(options).await.unwrap()
    }
}
impl Drop for TempDatabase {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}
fn directories(paths: &[&str]) -> DirectoryBindings {
    DirectoryBindings::new(
        paths
            .iter()
            .map(|path| DirectoryBinding {
                path: (*path).to_owned(),
            })
            .collect(),
    )
    .unwrap()
}

#[tokio::test]
async fn local_workspace_and_session_contexts_keep_identity_across_restart() {
    let file = TempDatabase::new();
    let local = LocalCatalog::open(file.path(), "first-hostname")
        .await
        .unwrap();
    let initial = local.snapshot().await.unwrap();
    assert!(initial.team_id.as_i64() > 0);
    assert!(initial.machine_id.as_i64() > 0);
    assert!(file.path().is_file());
    let workspace = local
        .create_workspace("storefront", directories(&["/web", "/api"]))
        .await
        .unwrap();
    let session = local
        .create_workspace_session(workspace.workspace.id)
        .await
        .unwrap();
    let owned = local
        .attach_session_worktree(session.id, directories(&["/managed/web", "/managed/api"]))
        .await
        .unwrap();
    let changed = local
        .update_workspace(
            workspace.workspace.id,
            "renamed",
            directories(&["/api", "/web"]),
        )
        .await
        .unwrap();
    assert_eq!(changed.worktrees[1], owned);
    local.close().await.unwrap();
    let local = LocalCatalog::open(file.path(), "new-hostname")
        .await
        .unwrap();
    let snapshot = local.snapshot().await.unwrap();
    assert_eq!(snapshot.team_id, initial.team_id);
    assert_eq!(snapshot.machine_id, initial.machine_id);
    assert_eq!(snapshot.machine_name, "new-hostname");
    assert_eq!(snapshot.workspaces, vec![changed]);
    assert!(matches!(
        local.delete_workspace(workspace.workspace.id).await,
        Err(StoreError::WorkspaceHasSessions { .. })
    ));
    local.delete_workspace_session(session.id).await.unwrap();
    local
        .delete_workspace(workspace.workspace.id)
        .await
        .unwrap();
    assert!(local.snapshot().await.unwrap().workspaces.is_empty());
    assert!(matches!(
        local.delete_workspace_session(session.id).await,
        Err(StoreError::NotFound {
            kind: "session",
            ..
        })
    ));
    local.close().await.unwrap();
}

#[tokio::test]
async fn local_operations_reject_another_machines_workspace_and_session() {
    let file = TempDatabase::new();
    let local = LocalCatalog::open(file.path(), "this-host").await.unwrap();
    let catalog = Catalog::new(file.database().await);
    let team = catalog.create_team("another team").await.unwrap();
    let machine = catalog.create_machine(team.id, "other-host").await.unwrap();
    let workspace = catalog
        .create_workspace(machine.id, "private", directories(&["/private"]))
        .await
        .unwrap();
    let session = catalog
        .create_workspace_session(machine.id, workspace.workspace.id)
        .await
        .unwrap();
    assert!(local.snapshot().await.unwrap().workspaces.is_empty());
    assert!(matches!(
        local
            .update_workspace(workspace.workspace.id, "modified", directories(&["/tmp"]))
            .await,
        Err(StoreError::NotFound {
            kind: "workspace",
            ..
        })
    ));
    assert!(matches!(
        local.delete_workspace(workspace.workspace.id).await,
        Err(StoreError::NotFound {
            kind: "workspace",
            ..
        })
    ));
    assert!(matches!(
        local.create_workspace_session(workspace.workspace.id).await,
        Err(StoreError::NotFound {
            kind: "workspace",
            ..
        })
    ));
    assert!(matches!(
        local
            .attach_session_worktree(session.id, directories(&["/tmp"]))
            .await,
        Err(StoreError::NotFound {
            kind: "session",
            ..
        })
    ));
    assert!(matches!(
        local.delete_workspace_session(session.id).await,
        Err(StoreError::NotFound {
            kind: "session",
            ..
        })
    ));
    assert_eq!(
        catalog.workspace(workspace.workspace.id).await.unwrap(),
        Some(workspace)
    );
    catalog.database().close_by_ref().await.unwrap();
    local.close().await.unwrap();
}
