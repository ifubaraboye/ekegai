//! Sidebar row model.
//!
//! Free of GPUI so the grouping, filtering, ordering, and selection rules are
//! directly testable. The view walks the rows and paints them.
//!
//! Layout, matching the reference: a wordmark, a "Pinned" section of sessions,
//! then a "Projects" section of collapsible groups whose children are sessions.
//! A session card is one line in "Pinned" (circle icon, title, time, optional
//! done-check) and "branch ★ time" under a project.

use chrono::{DateTime, Local, Utc};
use ekegai_core::model::{NodeId, NodeState, Project, ProjectId, TerminalNode};

/// How many rows a project reveals before "show more" appears.
pub const SHOW_MORE_BATCH: usize = 30;

/// Relative timestamp label, e.g. "1mo", "2mo", "1m", "12m".
pub fn rel_time(ts: i64, _now: DateTime<Local>) -> String {
    if ts == 0 {
        return String::new();
    }
    let elapsed = Utc::now().timestamp_millis() - ts;
    if elapsed < 0 {
        return "1m".into();
    }
    let secs = elapsed / 1000;
    if secs < 60 {
        "1m".into()
    } else if secs < 3600 {
        format!("{}m", secs / 60)
    } else if secs < 86400 {
        format!("{}h", secs / 3600)
    } else if secs < 86400 * 30 {
        format!("{}d", secs / 86400)
    } else if secs < 86400 * 365 {
        format!("{}mo", secs / (86400 * 30))
    } else {
        format!("{}y", secs / (86400 * 365))
    }
}

/// What a row represents.
#[derive(Clone, Debug, PartialEq)]
pub enum Row {
    /// The small, muted section label.
    SectionLabel(&'static str),
    /// One pinned session: circle icon, title, time, optional done-check.
    PinnedSession {
        node_id: NodeId,
        title: String,
        time: String,
        state: NodeState,
        active: bool,
    },
    /// A project header: icon, name, `›`, and a `+` to add.
    ProjectHeader {
        project_id: ProjectId,
        name: String,
        expanded: bool,
        icon: ProjectIcon,
    },
    /// A session under a project: "branch ★ time".
    ProjectSession {
        project_id: ProjectId,
        node_id: NodeId,
        branch: String,
        time: String,
        state: NodeState,
        active: bool,
    },
    /// "+ N more" affordance.
    ShowMore { project_id: ProjectId, hidden: usize },
    Empty { message: String },
}

/// The little leading glyph on a project header.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProjectIcon {
    Circle,
    Triangle,
}

/// Sidebar state that is not GPUI.
#[derive(Clone, Debug, Default)]
pub struct SidebarModel {
    pub projects: Vec<Project>,
    pub nodes: Vec<TerminalNode>,
    pub active_node: Option<NodeId>,
    /// project ids collapsed; expanded by default.
    pub collapsed: Vec<ProjectId>,
    pub query: String,
    pub revealed: Vec<(ProjectId, usize)>,
}

impl SidebarModel {
    pub fn is_collapsed(&self, id: ProjectId) -> bool {
        self.collapsed.contains(&id)
    }

    pub fn set_collapsed(&mut self, id: ProjectId, collapsed: bool) {
        if collapsed {
            if !self.is_collapsed(id) {
                self.collapsed.push(id);
            }
        } else {
            self.collapsed.retain(|p| *p != id);
        }
    }

    pub fn revealed_for(&self, id: ProjectId) -> usize {
        self.revealed
            .iter()
            .find(|(p, _)| *p == id)
            .map(|(_, n)| *n)
            .unwrap_or(SHOW_MORE_BATCH)
    }

    fn nodes_for(&self, project_id: ProjectId) -> Vec<&TerminalNode> {
        let mut out: Vec<&TerminalNode> = self
            .nodes
            .iter()
            .filter(|n| n.project_id == project_id && !n.pinned)
            .collect();
        out.sort_by_key(|n| std::cmp::Reverse(n.created_at));
        out
    }

    fn pinned_nodes(&self) -> Vec<&TerminalNode> {
        let mut out: Vec<&TerminalNode> = self.nodes.iter().filter(|n| n.pinned).collect();
        out.sort_by_key(|n| std::cmp::Reverse(n.created_at));
        out
    }

    fn matches_query(node: &TerminalNode, query: &str) -> bool {
        if query.is_empty() {
            return true;
        }
        let q = query.to_lowercase();
        node.label.to_lowercase().contains(&q)
    }

    pub fn rows(&self) -> Vec<Row> {
        let mut rows = Vec::new();
        let searching = !self.query.trim().is_empty();

        // Pinned section
        let pinned = self
            .pinned_nodes()
            .into_iter()
            .filter(|n| Self::matches_query(n, &self.query))
            .collect::<Vec<_>>();
        if !pinned.is_empty() {
            rows.push(Row::SectionLabel("Pinned"));
            for n in &pinned {
                rows.push(Row::PinnedSession {
                    node_id: n.id,
                    title: n.label.clone(),
                    time: rel_time(n.created_at, Local::now()),
                    state: n.state,
                    active: Some(n.id) == self.active_node,
                });
            }
        }
        let had_pinned = !pinned.is_empty();

        // Projects section
        if !self.projects.is_empty() {
            rows.push(Row::SectionLabel("Projects"));
        }

        let mut any = false;
        for project in &self.projects {
            let all = self.nodes_for(project.id);
            let project_matches = project.name.to_lowercase().contains(&self.query.to_lowercase());
            let visible: Vec<&TerminalNode> = all
                .into_iter()
                .filter(|n| project_matches || Self::matches_query(n, &self.query))
                .collect();

            if searching && !project_matches && visible.is_empty() {
                continue;
            }
            if visible.is_empty() && !searching {
                continue;
            }
            any = true;

            let expanded = searching || !self.is_collapsed(project.id);
            let limit = if searching {
                visible.len()
            } else {
                self.revealed_for(project.id)
            };
            let shown = visible.len().min(limit);
            let hidden = visible.len() - shown;

            rows.push(Row::ProjectHeader {
                project_id: project.id,
                name: project.name.clone(),
                expanded,
                icon: ProjectIcon::Circle,
            });

            if expanded {
                for n in visible.iter().take(shown) {
                    rows.push(Row::ProjectSession {
                        project_id: project.id,
                        node_id: n.id,
                        branch: project
                            .git_branch
                            .clone()
                            .unwrap_or_else(|| "main".to_string()),
                        time: rel_time(n.created_at, Local::now()),
                        state: n.state,
                        active: Some(n.id) == self.active_node,
                    });
                }
                if hidden > 0 {
                    rows.push(Row::ShowMore {
                        project_id: project.id,
                        hidden,
                    });
                }
            }
        }

        if searching && !any && !had_pinned {
            rows.push(Row::Empty {
                message: format!("No matches for \"{}\"", self.query.trim()),
            });
        }
        if rows.is_empty() {
            rows.push(Row::Empty {
                message: "No projects yet".into(),
            });
        }
        rows
    }

    pub fn row_index_of(&self, node_id: NodeId) -> Option<usize> {
        self.rows().iter().position(|r| match r {
            Row::PinnedSession { node_id: id, .. } => *id == node_id,
            Row::ProjectSession { node_id: id, .. } => *id == node_id,
            _ => false,
        })
    }

    pub fn next_selectable(&self, from: usize, delta: isize) -> Option<usize> {
        let rows = self.rows();
        let mut i = from as isize + delta;
        while i >= 0 && (i as usize) < rows.len() {
            if matches!(
                rows[i as usize],
                Row::PinnedSession { .. } | Row::ProjectSession { .. }
            ) {
                return Some(i as usize);
            }
            i += delta;
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ekegai_core::model::{Project, TerminalNode};
    use std::path::PathBuf;

    fn project(name: &str, branch: Option<&str>) -> Project {
        Project {
            id: ekegai_core::model::ProjectId::new_v4(),
            path: PathBuf::from(format!("/tmp/{name}")),
            name: name.to_string(),
            git_branch: branch.map(|b| b.to_string()),
            listening_ports: vec![],
            created_at: 0,
        }
    }

    fn node(project_id: ekegai_core::model::ProjectId, label: &str, created_at: i64) -> TerminalNode {
        let mut n = TerminalNode::new(project_id, PathBuf::from("/tmp"), label);
        n.created_at = created_at;
        n
    }

    #[test]
    fn empty_model_shows_empty() {
        let m = SidebarModel::default();
        assert!(matches!(m.rows().last(), Some(Row::Empty { .. })));
    }

    #[test]
    fn a_project_with_a_session_gets_a_header_and_a_child() {
        let p = project("super.engineering", Some("main"));
        let mut n = node(p.id, "fix", 100);
        n.pinned = false;
        let m = SidebarModel {
            projects: vec![p],
            nodes: vec![n],
            ..Default::default()
        };
        let rows = m.rows();
        assert!(matches!(rows[0], Row::SectionLabel("Projects")));
        assert!(matches!(rows[1], Row::ProjectHeader { .. }));
        assert!(matches!(rows[2], Row::ProjectSession { .. }));
    }

    #[test]
    fn branch_defaults_to_main() {
        let p = project("fx", None);
        let n = node(p.id, "shell", 100);
        let m = SidebarModel { projects: vec![p], nodes: vec![n], ..Default::default() };
        let branch = m.rows().iter().find_map(|r| match r {
            Row::ProjectSession { branch, .. } => Some(branch.clone()),
            _ => None,
        });
        assert_eq!(branch, Some("main".to_string()));
    }

    #[test]
    fn pinned_nodes_appear_under_pinned() {
        let p = project("fx", None);
        let mut pinned = node(p.id, "Threadshift demo", 100);
        pinned.pinned = true;
        let m = SidebarModel {
            projects: vec![p],
            nodes: vec![pinned],
            ..Default::default()
        };
        let rows = m.rows();
        assert!(matches!(rows[0], Row::SectionLabel("Pinned")));
        assert!(matches!(rows[1], Row::PinnedSession { .. }));
        // the project header is hidden because its only session is pinned
        assert!(rows.iter().all(|r| !matches!(r, Row::ProjectHeader { .. })));
    }

    #[test]
    fn collapsed_project_hides_its_sessions() {
        let p = project("fx", None);
        let n = node(p.id, "shell", 100);
        let mut m = SidebarModel { projects: vec![p], nodes: vec![n], ..Default::default() };
        m.set_collapsed(m.projects[0].id, true);
        let rows = m.rows();
        assert!(rows.iter().all(|r| !matches!(r, Row::ProjectSession { .. })));
    }

    #[test]
    fn searching_filters_sessions() {
        let p = project("fx", None);
        let a = node(p.id, "Threadshift demo", 100);
        let b = node(p.id, "Safari logo flicker", 200);
        let mut m = SidebarModel { projects: vec![p], nodes: vec![a, b], ..Default::default() };
        m.query = "safari".into();
        let labels: Vec<String> = m
            .rows()
            .iter()
            .filter_map(|r| match r {
                Row::ProjectSession { node_id, .. } => {
                    m.nodes.iter().find(|n| n.id == *node_id).map(|n| n.label.clone())
                }
                _ => None,
            })
            .collect();
        assert_eq!(labels, vec!["Safari logo flicker"]);
    }
}
