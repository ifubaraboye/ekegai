//! Domain layer for ekegai.
//!
//! Deliberately free of GPUI so it can be tested without a window. The
//! desktop crate owns all UI concerns.

pub mod model;
pub mod pty;
pub mod secrets;
pub mod session;

pub use model::{
    AgentConfig, AgentProvider, Edge, Graph, NodeId, NodeState, Project, ProjectId, SessionState,
    SplitLayout, TerminalNode, Workspace, WorkspaceId,
};
pub use pty::{Frame, PtySession, Row, SessionEvent, StyledChar};
pub use session::SessionStore;
