//! Ordered directory bindings belonging to one worktree.

use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel)]
#[sea_orm(table_name = "worktree_directories")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub worktree_id: i64,
    #[sea_orm(primary_key, auto_increment = false)]
    pub position: i32,
    pub path: String,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::worktree::Entity",
        from = "Column::WorktreeId",
        to = "super::worktree::Column::Id",
        on_delete = "Cascade"
    )]
    Worktree,
}

impl Related<super::worktree::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Worktree.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}
