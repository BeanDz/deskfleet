//! Workspace records belonging to one machine.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "workspaces")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i64,
    pub machine_id: i64,
    pub name: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::machine::Entity",
        from = "Column::MachineId",
        to = "super::machine::Column::Id",
        on_delete = "Restrict"
    )]
    Machine,
    #[sea_orm(has_many = "super::worktree::Entity")]
    Worktree,
    #[sea_orm(has_many = "super::workspace_session::Entity")]
    WorkspaceSession,
}

impl Related<super::machine::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Machine.def()
    }
}

impl Related<super::worktree::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Worktree.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

impl Related<super::workspace_session::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::WorkspaceSession.def()
    }
}
