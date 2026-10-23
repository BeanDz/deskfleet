use serde::{Deserialize, Serialize};
use thiserror::Error;

/// A directory on the machine that owns the workspace.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct DirectoryBinding {
    /// A machine-local path; it must not be interpreted on the receiving host.
    pub path: String,
}

/// A nonempty ordered collection of directories; the first is the default.
///
/// Construction and deserialization enforce the same structural rules. Paths
/// need not share a parent directory or repository. Filesystem validation
/// belongs to the daemon.
#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(try_from = "Vec<DirectoryBinding>", into = "Vec<DirectoryBinding>")]
pub struct DirectoryBindings(Vec<DirectoryBinding>);

#[derive(Clone, Debug, Eq, Error, PartialEq)]
pub enum DirectoryBindingsError {
    #[error("a workspace must contain at least one directory")]
    Empty,
    #[error("directory {index} has an empty path")]
    EmptyPath { index: usize },
}

impl DirectoryBindings {
    pub fn new(bindings: Vec<DirectoryBinding>) -> Result<Self, DirectoryBindingsError> {
        Self::try_from(bindings)
    }

    pub fn as_slice(&self) -> &[DirectoryBinding] {
        &self.0
    }

    /// The first configured directory is the default working directory.
    pub fn default_directory(&self) -> &DirectoryBinding {
        &self.0[0]
    }
}

impl TryFrom<Vec<DirectoryBinding>> for DirectoryBindings {
    type Error = DirectoryBindingsError;

    fn try_from(bindings: Vec<DirectoryBinding>) -> Result<Self, Self::Error> {
        if bindings.is_empty() {
            return Err(DirectoryBindingsError::Empty);
        }

        for (index, binding) in bindings.iter().enumerate() {
            if binding.path.is_empty() {
                return Err(DirectoryBindingsError::EmptyPath { index });
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
            {"path": "C:\\code\\web"},
            {"path": "D:\\services\\api"}
        ]);

        let bindings: DirectoryBindings = serde_json::from_value(json.clone()).unwrap();

        assert_eq!(bindings.as_slice()[1].path, "D:\\services\\api");
        assert_eq!(bindings.default_directory().path, "C:\\code\\web");
        assert_eq!(serde_json::to_value(bindings).unwrap(), json);
    }

    #[test]
    fn decoding_cannot_bypass_directory_set_invariants() {
        for invalid in [
            json!([]),
            json!([{"path": ""}]),
            json!([{"name": "obsolete", "path": "/code/web"}]),
        ] {
            assert!(serde_json::from_value::<DirectoryBindings>(invalid).is_err());
        }
    }
}
