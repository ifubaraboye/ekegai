//! Session persistence.
//!
//! The Electron version saved on a 30s timer plus on suspend / lock / quit,
//! and stored a JSON blob via `electron-store`. We keep the autosave policy
//! and the on-disk shape, but move the file to a conventional per-user path
//! and strip anything that should not be persisted.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use anyhow::{Context, Result};

use crate::model::{NodeState, SessionState};

/// Autosave interval, matching the TypeScript `30_000`.
pub const AUTOSAVE_INTERVAL: Duration = Duration::from_secs(30);
const SCHEMA_VERSION: u32 = 1;

/// Where sessions live. `$XDG_DATA_HOME/ekegai/session.json` on Linux,
/// `~/Library/Application Support/ekegai` on macOS.
pub fn default_path() -> PathBuf {
    if let Ok(dir) = std::env::var("XDG_DATA_HOME") {
        if !dir.is_empty() {
            return Path::new(&dir).join("ekegai").join("session.json");
        }
    }
    if let Ok(home) = std::env::var("HOME") {
        return Path::new(&home)
            .join(".local")
            .join("share")
            .join("ekegai")
            .join("session.json");
    }
    PathBuf::from("ekegai-session.json")
}

pub struct SessionStore {
    path: PathBuf,
    last_save: Option<Instant>,
    dirty: bool,
}

impl SessionStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            last_save: None,
            dirty: false,
        }
    }

    pub fn with_default_path() -> Self {
        Self::new(default_path())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn mark_dirty(&mut self) {
        self.dirty = true;
    }

    /// True when `AUTOSAVE_INTERVAL` has elapsed since the last write.
    pub fn autosave_due(&self) -> bool {
        self.dirty
            && self
                .last_save
                .is_none_or(|last| last.elapsed() >= AUTOSAVE_INTERVAL)
    }

    /// Build the persistable form of the state.
    ///
    /// Two deliberate differences from the TypeScript `serialize()`:
    /// 1. Transient node states are reset to `Idle`, since no agent is running
    ///    after a restart.
    /// 2. API keys are already absent by construction -- `AgentConfig` holds a
    ///    `secret_ref`, never the key.
    pub fn to_state(&self, state: &SessionState) -> SessionState {
        let mut out = state.clone();
        for node in &mut out.nodes {
            node.state = NodeState::Idle;
        }
        out.last_saved = chrono::Utc::now().timestamp_millis();
        out
    }

    pub fn save(&mut self, state: &SessionState) -> Result<()> {
        let clean = self.to_state(state);
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("create session directory {}", parent.display()))?;
        }
        let body = serde_json::to_string_pretty(&clean).context("serialize session")?;

        // Write-then-rename so a crash mid-write cannot leave a truncated file.
        let tmp = self.path.with_extension("json.tmp");
        std::fs::write(&tmp, body).with_context(|| format!("write {}", tmp.display()))?;
        std::fs::rename(&tmp, &self.path)
            .with_context(|| format!("rename into {}", self.path.display()))?;

        self.last_save = Some(Instant::now());
        self.dirty = false;
        Ok(())
    }

    pub fn load(&self) -> Result<Option<SessionState>> {
        if !self.path.exists() {
            return Ok(None);
        }
        let body = std::fs::read_to_string(&self.path)
            .with_context(|| format!("read {}", self.path.display()))?;
        match serde_json::from_str::<SessionState>(&body) {
            Ok(state) => Ok(Some(state)),
            Err(err) => {
                // A corrupt session must not stop the app from starting. Keep
                // the bad file for inspection and begin fresh.
                let backup = self.path.with_extension("json.corrupt");
                let _ = std::fs::rename(&self.path, &backup);
                tracing_warn(&format!(
                    "session at {} was unreadable ({err}); moved to {} and starting fresh",
                    self.path.display(),
                    backup.display()
                ));
                Ok(None)
            }
        }
    }
}

fn tracing_warn(message: &str) {
    eprintln!("warning: {message}");
}

/// Re-key a restored session: PTYs from a dead process cannot be reattached,
/// so every node gets a fresh `pty_id` while keeping its stable node id.
pub fn rekey_pty_ids(state: &mut SessionState) {
    for node in &mut state.nodes {
        node.pty_id = uuid::Uuid::new_v4();
        node.state = NodeState::Idle;
    }
}

/// Version stamp, for future migrations.
pub fn schema_version() -> u32 {
    SCHEMA_VERSION
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{AgentConfig, AgentProvider, Project, TerminalNode};
    use std::path::PathBuf;

    fn temp_path(name: &str) -> PathBuf {
        let mut p = std::env::temp_dir();
        p.push(format!("ekegai-test-{}-{name}.json", std::process::id()));
        p
    }

    #[test]
    fn round_trips_through_disk() {
        let path = temp_path("roundtrip");
        let mut store = SessionStore::new(path.clone());

        let project = Project::new(PathBuf::from("/tmp/demo"));
        let node = TerminalNode::new(project.id, PathBuf::from("/tmp/demo"), "one");
        let state = SessionState {
            projects: vec![project],
            nodes: vec![node],
            ..Default::default()
        };

        store.save(&state).expect("save");
        let loaded = store.load().expect("load").expect("some state");
        assert_eq!(loaded.nodes.len(), 1);
        assert_eq!(loaded.nodes[0].label, "one");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn transient_states_are_reset_on_save() {
        let path = temp_path("states");
        let mut store = SessionStore::new(path.clone());
        let project = Project::new(PathBuf::from("/tmp/demo"));
        let mut node = TerminalNode::new(project.id, PathBuf::from("/tmp/demo"), "one");
        node.state = NodeState::Running;

        let state = SessionState {
            projects: vec![project],
            nodes: vec![node],
            ..Default::default()
        };
        store.save(&state).expect("save");
        let loaded = store.load().expect("load").expect("some");
        assert_eq!(loaded.nodes[0].state, NodeState::Idle);
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn saved_file_contains_no_key_material() {
        let path = temp_path("secrets");
        let mut store = SessionStore::new(path.clone());
        let project = Project::new(PathBuf::from("/tmp/demo"));
        let mut node = TerminalNode::new(project.id, PathBuf::from("/tmp/demo"), "one");
        node.agent = Some(AgentConfig {
            provider: AgentProvider::Claude,
            model: "claude-sonnet-4".into(),
            secret_ref: Some("ekegai/claude/default".into()),
            system_prompt: String::new(),
        });
        let state = SessionState {
            projects: vec![project],
            nodes: vec![node],
            ..Default::default()
        };
        store.save(&state).expect("save");
        let body = std::fs::read_to_string(&path).expect("read");
        assert!(body.contains("ekegai/claude/default"));
        assert!(!body.to_lowercase().contains("apikey"));
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn corrupt_session_is_quarantined_not_fatal() {
        let path = temp_path("corrupt");
        std::fs::write(&path, b"{ this is not json").expect("seed");
        let store = SessionStore::new(path.clone());
        let loaded = store.load().expect("load does not error");
        assert!(loaded.is_none());
        assert!(path.with_extension("json.corrupt").exists());
        let _ = std::fs::remove_file(&path);
        let _ = std::fs::remove_file(path.with_extension("json.corrupt"));
    }

    #[test]
    fn rekeying_replaces_pty_ids_but_keeps_node_ids() {
        let project = Project::new(PathBuf::from("/tmp/demo"));
        let node = TerminalNode::new(project.id, PathBuf::from("/tmp/demo"), "one");
        let (node_id, old_pty) = (node.id, node.pty_id);
        let mut state = SessionState {
            projects: vec![project],
            nodes: vec![node],
            ..Default::default()
        };
        rekey_pty_ids(&mut state);
        assert_eq!(state.nodes[0].id, node_id);
        assert_ne!(state.nodes[0].pty_id, old_pty);
    }
}
