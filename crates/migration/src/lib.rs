//! Versioned database migrations for the deskfleet resource catalog.

pub use sea_orm_migration::prelude::*;

mod m20261023_000001_create_catalog;

/// Applies the catalog migrations in their declared order.
pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![Box::new(m20261023_000001_create_catalog::Migration)]
    }
}
