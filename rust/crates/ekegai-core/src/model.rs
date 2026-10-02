//! Core domain types.
//!
//! Ported from the TypeScript stores that lived on the old `main` branch
//! (`src/store/workflowStore.ts`, `src/store/workspaces.ts`, `src/store/panes.ts`).
//!
//! The one semantic worth keeping from that code: an agent is configured *per
//! terminal node*, and running it streams provider output into that node's own
//! PTY. The agent is visible in the terminal it orchestrates rather than in a
//! separate chat pane.

use std::collections::HashMap;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};
use uuid::Uuid;

/// Identifier for a [`Project`]. An alias rather than a newtype so it stays
/// interchangeable with the raw `Uuid` stored in serialized sessions.
pub type ProjectId = Uuid;
/// Identifier for a [`TerminalNode`].
pub type NodeId = Uuid;
/// Identifier for a [`Workspace`].
pub type WorkspaceId = Uuid;

/// A project directory opened in the sidebar.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Project {
    pub id: ProjectId,
    pub path: PathBuf,
    pub name: String,
    #[serde(default)]
    pub git_branch: Option<String>,
    #[serde(default)]
    pub listening_ports: Vec<u16>,
    #[serde(default)]
    pub created_at: i64,
}

impl Project {
    pub fn new(path: PathBuf) -> Self {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string());
        Self {
            id: Uuid::new_v4(),
            path,
            name,
            git_branch: None,
            listening_ports: Vec::new(),
            created_at: chrono::Utc::now().timestamp_millis(),
        }
    }
}

/// Liveness of a node, as shown by the sidebar status dot.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum NodeState {
    Idle,
    Running,
    Waiting,
    Done,
    Error,
}

impl NodeState {
    /// Text label for screen readers and tooltips. The status dot alone is
    /// colour-only information and must not be the sole signal.
    pub fn label(self) -> &'static str {
        match self {
            Self::Idle => "Idle",
            Self::Running => "Running",
            Self::Waiting => "Waiting for input",
            Self::Done => "Done",
            Self::Error => "Error",
        }
    }
}

/// Which LLM provider backs a node's agent.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentProvider {
    Claude,
    OpenAi,
    Ollama,
}

impl AgentProvider {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::OpenAi => "openai",
            Self::Ollama => "ollama",
        }
    }
}

/// Agent configuration for a node.
///
/// NOTE: `secret_ref` is *not* a plaintext key. The TypeScript original stored
/// `apiKey` inline in `AgentConfig` and `serialize()` spread the whole object,
/// so every workflow save wrote the key in cleartext to a user-chosen path.
/// Here we keep only an opaque reference; the secret itself lives in the OS
/// keyring (see `ekegai_core::secrets`).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentConfig {
    pub provider: AgentProvider,
    pub model: String,
    /// Opaque handle into the OS keyring. Never the key material itself.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub secret_ref: Option<String>,
    #[serde(default)]
    pub system_prompt: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TerminalNode {
    pub id: NodeId,
    pub project_id: ProjectId,
    /// Stable handle for the live PTY. Regenerated on session restore, since
    /// a PTY from a previous process cannot be reattached.
    pub pty_id: Uuid,
    pub label: String,
    pub cwd: PathBuf,
    pub created_at: i64,
    pub state: NodeState,
    #[serde(default)]
    pub agent: Option<AgentConfig>,
    /// Canvas position, in the graph's coordinate space.
    pub position: (f32, f32),
    /// Shown under "Pinned" in the sidebar rather than under a project.
    #[serde(default)]
    pub pinned: bool,
}

impl TerminalNode {
    pub fn new(project_id: ProjectId, cwd: PathBuf, label: impl Into<String>) -> Self {
        Self {
            id: Uuid::new_v4(),
            project_id,
            pty_id: Uuid::new_v4(),
            label: label.into(),
            cwd,
            created_at: chrono::Utc::now().timestamp_millis(),
            state: NodeState::Idle,
            agent: None,
            position: (0.0, 0.0),
            pinned: false,
        }
    }
}

/// A directed dependency between nodes: `source` feeds `target`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Edge {
    pub source: NodeId,
    pub target: NodeId,
}

/// How a workspace's panes are arranged.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SplitLayout {
    Horizontal,
    Vertical,
    Grid,
}

/// A named group of panes sharing a working directory.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct Workspace {
    pub id: WorkspaceId,
    pub name: String,
    pub cwd: PathBuf,
    pub pane_ids: Vec<NodeId>,
    pub split_layout: SplitLayout,
    #[serde(default)]
    pub has_unread: bool,
}

/// The whole app state that gets persisted.
///
/// Deliberately does *not* contain API keys, live PTY handles, or `NodeState`
/// values that were mid-flight. See [`SessionStore::to_json`].
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct SessionState {
    #[serde(default)]
    pub projects: Vec<Project>,
    #[serde(default)]
    pub nodes: Vec<TerminalNode>,
    #[serde(default)]
    pub edges: Vec<Edge>,
    #[serde(default)]
    pub workspaces: Vec<Workspace>,
    #[serde(default)]
    pub active_workspace: Option<WorkspaceId>,
    #[serde(default)]
    pub last_saved: i64,
}

/// In-memory graph operations, kept free of UI concerns so they can be tested.
#[derive(Debug, Default)]
pub struct Graph {
    pub projects: HashMap<Uuid, Project>,
    pub nodes: HashMap<Uuid, TerminalNode>,
    pub edges: Vec<Edge>,
}

impl Graph {
    /// Nodes reachable from `id` by following outgoing edges, in breadth-first
    /// order. Cycles are visited once and do not hang.
    pub fn downstream_of(&self, id: NodeId) -> Vec<&TerminalNode> {
        let mut seen: Vec<Uuid> = vec![id];
        let mut queue = std::collections::VecDeque::from([id]);
        let mut out = Vec::new();

        while let Some(current) = queue.pop_front() {
            for edge in self.edges.iter().filter(|e| e.source == current) {
                if seen.contains(&edge.target) {
                    continue;
                }
                seen.push(edge.target);
                if let Some(node) = self.nodes.get(&edge.target) {
                    out.push(node);
                    queue.push_back(edge.target);
                }
            }
        }
        out
    }

    /// Nodes that feed `id`, i.e. the reverse of [`Graph::downstream_of`].
    pub fn upstream_of(&self, id: NodeId) -> Vec<&TerminalNode> {
        let mut seen: Vec<Uuid> = vec![id];
        let mut queue = std::collections::VecDeque::from([id]);
        let mut out = Vec::new();

        while let Some(current) = queue.pop_front() {
            for edge in self.edges.iter().filter(|e| e.target == current) {
                if seen.contains(&edge.source) {
                    continue;
                }
                seen.push(edge.source);
                if let Some(node) = self.nodes.get(&edge.source) {
                    out.push(node);
                    queue.push_back(edge.source);
                }
            }
        }
        out
    }

    pub fn remove_node(&mut self, id: NodeId) -> Option<TerminalNode> {
        // Drop any edges touching the node so the graph cannot keep dangling
        // references, mirroring the TypeScript `deleteNode` behaviour.
        self.edges.retain(|e| e.source != id && e.target != id);
        self.nodes.remove(&id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn node() -> TerminalNode {
        TerminalNode::new(Uuid::new_v4(), PathBuf::from("/tmp"), "t")
    }

    #[test]
    fn downstream_follows_the_chain() {
        let (a, b, c) = (node(), node(), node());
        let (a_id, b_id, c_id) = (a.id, b.id, c.id);
        let mut graph = Graph::default();
        graph.nodes.insert(a.id, a);
        graph.nodes.insert(b.id, b);
        graph.nodes.insert(c.id, c);
        graph.edges.push(Edge { source: a_id, target: b_id });
        graph.edges.push(Edge { source: b_id, target: c_id });

        let ids: Vec<_> = graph.downstream_of(a_id).iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![b_id, c_id]);
    }

    #[test]
    fn downstream_terminates_on_a_cycle() {
        let (a, b) = (node(), node());
        let (a_id, b_id) = (a.id, b.id);
        let mut graph = Graph::default();
        graph.nodes.insert(a.id, a);
        graph.nodes.insert(b.id, b);
        graph.edges.push(Edge { source: a_id, target: b_id });
        graph.edges.push(Edge { source: b_id, target: a_id });

        // Must not loop forever.
        let ids: Vec<_> = graph.downstream_of(a_id).iter().map(|n| n.id).collect();
        assert_eq!(ids, vec![b_id]);
    }

    #[test]
    fn removing_a_node_drops_its_edges() {
        let (a, b) = (node(), node());
        let (a_id, b_id) = (a.id, b.id);
        let mut graph = Graph::default();
        graph.nodes.insert(a.id, a);
        graph.nodes.insert(b.id, b);
        graph.edges.push(Edge { source: a_id, target: b_id });

        graph.remove_node(a_id);
        assert!(graph.edges.is_empty());
        assert!(!graph.nodes.contains_key(&a_id));
    }

    #[test]
    fn session_json_never_contains_key_material() {
        let mut n = node();
        n.agent = Some(AgentConfig {
            provider: AgentProvider::Claude,
            model: "claude-sonnet-4".into(),
            secret_ref: Some("keyring:ekegai/claude".into()),
            system_prompt: "be helpful".into(),
        });
        let state = SessionState {
            nodes: vec![n],
            ..Default::default()
        };
        let json = serde_json::to_string(&state).unwrap();
        // Only the opaque reference is present, never a `sk-` style secret.
        assert!(json.contains("keyring:ekegai/claude"));
        assert!(!json.contains("\"apiKey\""));
    }
}
