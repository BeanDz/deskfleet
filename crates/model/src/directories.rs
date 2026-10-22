use std::collections::HashSet;

use serde::{Deserialize, Serialize};
use thiserror::Error;

/// A named directory on the machine that owns the worktree.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
pub struct DirectoryBinding {
    pub name: String,
    /// A machine-local path; it must not be interpreted on the receiving host.
    pub path: String,
}

/// A nonempty collection of directories with distinct names.
///
/// Construction and deserialization enforce the same structural rules. Paths
/// need not share a parent directory or repository, and aliases may reference
/// the same physical checkout. Filesystem validation belongs to the daemon.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "Vec<DirectoryBinding>", into = "Vec<DirectoryBinding>")]
pub struct DirectoryBindings(Vec<DirectoryBinding>);

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum DirectoryBindingsError {
    #[error("a worktree must contain at least one directory binding")]
    Empty,
    #[error("directory binding {index} has an empty name")]
    EmptyName { index: usize },
    #[error("directory binding {name:?} has an empty path")]
    EmptyPath { name: String },
    #[error("directory binding name {name:?} is duplicated")]
    DuplicateName { name: String },
}

impl DirectoryBindings {
    pub fn new(bindings: Vec<DirectoryBinding>) -> Result<Self, DirectoryBindingsError> {
        Self::try_from(bindings)
    }

    pub fn as_slice(&self) -> &[DirectoryBinding] {
        &self.0
    }
}

impl TryFrom<Vec<DirectoryBinding>> for DirectoryBindings {
    type Error = DirectoryBindingsError;

    fn try_from(bindings: Vec<DirectoryBinding>) -> Result<Self, Self::Error> {
        if bindings.is_empty() {
            return Err(DirectoryBindingsError::Empty);
        }

        let mut names = HashSet::with_capacity(bindings.len());
        for (index, binding) in bindings.iter().enumerate() {
            if binding.name.trim().is_empty() {
                return Err(DirectoryBindingsError::EmptyName { index });
            }
            if binding.path.is_empty() {
                return Err(DirectoryBindingsError::EmptyPath {
                    name: binding.name.clone(),
                });
            }
            if !names.insert(&binding.name) {
                return Err(DirectoryBindingsError::DuplicateName {
                    name: binding.name.clone(),
                });
            }
        }

        Ok(Self(bindings))
    }
}

impl From<DirectoryBindings> for Vec<DirectoryBinding> {
    fn from(bindings: DirectoryBindings) -> Self {
        bindings.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn unrelated_directory_roots_round_trip_without_local_path_interpretation() {
        let json = json!([
            {"name": "frontend", "path": "C:\\code\\web"},
            {"name": "backend", "path": "D:\\services\\api"}
        ]);

        let bindings: DirectoryBindings = serde_json::from_value(json.clone()).unwrap();

        assert_eq!(bindings.as_slice()[1].path, "D:\\services\\api");
        assert_eq!(serde_json::to_value(bindings).unwrap(), json);
    }

    #[test]
    fn decoding_cannot_bypass_directory_set_invariants() {
        for invalid in [
            json!([]),
            json!([{"name": "", "path": "/code/web"}]),
            json!([{"name": "frontend", "path": ""}]),
            json!([
                {"name": "frontend", "path": "/code/web"},
                {"name": "frontend", "path": "/code/api"}
            ]),
        ] {
            assert!(serde_json::from_value::<DirectoryBindings>(invalid).is_err());
        }
    }
}
