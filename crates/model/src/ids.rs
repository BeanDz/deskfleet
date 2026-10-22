use serde::{Deserialize, Serialize};
use uuid::Uuid;

macro_rules! resource_id {
    ($($name:ident),+ $(,)?) => {
        $(
            /// A stable, typed resource identity, serialized as a UUID string.
            #[derive(Clone, Copy, Debug, Eq, Hash, Ord, PartialEq, PartialOrd, Serialize, Deserialize)]
            #[serde(transparent)]
            pub struct $name(Uuid);

            impl $name {
                pub const fn from_uuid(value: Uuid) -> Self {
                    Self(value)
                }

                pub const fn as_uuid(&self) -> &Uuid {
                    &self.0
                }
            }

            impl From<Uuid> for $name {
                fn from(value: Uuid) -> Self {
                    Self(value)
                }
            }

            impl std::fmt::Display for $name {
                fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                    std::fmt::Display::fmt(&self.0, formatter)
                }
            }
        )+
    };
}

resource_id!(
    TeamId,
    MachineId,
    WorkspaceId,
    WorktreeId,
    AgentSessionId,
    TerminalSessionId,
);
