//! Sidebar row model.
//!
//! Kept free of GPUI so the grouping, filtering and ordering rules can be
//! tested directly. The view walks the resulting rows and paints them.
//!
//! The design is informed by Waku's sidebar -- collapsible groups with a left
//! guide rail, indented children, an action row at the top, search, and
//! "show more" pagination -- reimplemented here against our own state.

use chrono::{DateTime, Datelike, Local};
use ekegai_core::model::{NodeId, NodeState, Project, ProjectId, TerminalNode};

/// How many children a group shows before "show more" appears.
pub const SHOW_MORE_BATCH: usize = 30;

/// What a row represents.
#[derive(Clone, Debug, PartialEq)]
pub enum Row {
    /// Search field, pinned above the scroll area.
    Search,
    /// "+ New project" action.
    NewProject,
    /// A collapsible group header: a project, or a date bucket.
    GroupHeader {
        key: String,
        label: String,
        expanded: bool,
        count: usize,
        /// True when the header is a project, which can be removed.
        is_project: bool,
    },
    /// A terminal node inside a group.
    Node {
        project_id: ProjectId,
        node_id: NodeId,
        label: String,
        state: NodeState,
        active: bool,
    },
    /// "Show N more" affordance.
    ShowMore {
        group_key: String,
        hidden: usize,
    },
    /// Shown when there is nothing to list.
    Empty { message: String },
}

/// Sidebar state that is not GPUI.
#[derive(Clone, Debug, Default)]
pub struct SidebarModel {
    pub projects: Vec<Project>,
    pub nodes: Vec<TerminalNode>,
    pub active_node: Option<NodeId>,
    pub collapsed: Vec<String>,
    pub query: String,
    /// How many children each group currently reveals.
    pub revealed: Vec<(String, usize)>,
}

impl SidebarModel {
    pub fn group_key(project: &Project) -> String {
        format!("project:{}", project.id)
    }

    pub fn is_collapsed(&self, key: &str) -> bool {
        self.collapsed.iter().any(|k| k == key)
    }

    pub fn revealed_for(&self, key: &str) -> usize {
        self.revealed
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, n)| *n)
            .unwrap_or(SHOW_MORE_BATCH)
    }

    pub fn toggle_collapsed(&mut self, key: &str) {
        if let Some(i) = self.collapsed.iter().position(|k| k == key) {
            self.collapsed.remove(i);
        } else {
            self.collapsed.push(key.to_string());
        }
    }

    /// Nodes belonging to a project, newest first.
    fn nodes_for<'a>(&'a self, project_id: &ProjectId) -> Vec<&'a TerminalNode> {
        let mut out: Vec<&TerminalNode> =
            self.nodes.iter().filter(|n| &n.project_id == project_id).collect();
        // Newest first.
        out.sort_by_key(|n| std::cmp::Reverse(n.created_at));
        out
    }

    /// Does a node match the current search text?
    fn matches(node: &TerminalNode, query: &str) -> bool {
        if query.is_empty() {
            return true;
        }
        let q = query.to_lowercase();
        node.label.to_lowercase().contains(&q)
            || node.cwd.to_string_lossy().to_lowercase().contains(&q)
    }

    /// Build the full row list.
    pub fn rows(&self) -> Vec<Row> {
        let mut rows = vec![Row::Search, Row::NewProject];

        let searching = !self.query.trim().is_empty();

        if self.projects.is_empty() {
            rows.push(Row::Empty {
                message: "No projects yet".into(),
            });
            return rows;
        }

        let mut matched_any = false;

        for project in &self.projects {
            let all = self.nodes_for(&project.id);
            // While searching, a project stays visible if it matches by name or
            // if any of its nodes match. Otherwise searching one project would
            // hide every other project, which is disorienting.
            let project_matches = project.name.to_lowercase().contains(&self.query.to_lowercase());
            let visible: Vec<&TerminalNode> = all
                .iter()
                .copied()
                .filter(|n| project_matches || Self::matches(n, &self.query))
                .collect();

            if searching && !project_matches && visible.is_empty() {
                continue;
            }
            if visible.is_empty() && !searching {
                continue;
            }
            matched_any = true;

            let key = Self::group_key(project);
            // A search result is always expanded; otherwise the hits would be
            // hidden inside a collapsed group.
            let expanded = searching || !self.is_collapsed(&key);
            let limit = if searching {
                visible.len()
            } else {
                self.revealed_for(&key)
            };
            let shown = visible.len().min(limit);
            let hidden = visible.len() - shown;

            rows.push(Row::GroupHeader {
                key: key.clone(),
                label: project.name.clone(),
                expanded,
                count: visible.len(),
                is_project: true,
            });

            if !expanded {
                continue;
            }

            for node in visible.iter().take(shown) {
                rows.push(Row::Node {
                    project_id: project.id,
                    node_id: node.id,
                    label: node.label.clone(),
                    state: node.state,
                    active: Some(node.id) == self.active_node,
                });
            }

            if hidden > 0 {
                rows.push(Row::ShowMore {
                    group_key: key,
                    hidden,
                });
            }
        }

        if searching && !matched_any {
            rows.push(Row::Empty {
                message: format!("No matches for \"{}\"", self.query.trim()),
            });
        }

        rows
    }

    /// Index of the row holding `node_id`, for scroll-into-view.
    pub fn row_index_of(&self, node_id: NodeId) -> Option<usize> {
        self.rows()
            .iter()
            .position(|r| matches!(r, Row::Node { node_id: id, .. } if *id == node_id))
    }

    /// The next selectable row, skipping headers and actions.
    ///
    /// Returns an index into [`SidebarModel::rows`].
    pub fn next_selectable(&self, from: usize, delta: isize) -> Option<usize> {
        let rows = self.rows();
        let mut i = from as isize + delta;
        while i >= 0 && (i as usize) < rows.len() {
            if matches!(rows[i as usize], Row::Node { .. }) {
                return Some(i as usize);
            }
            i += delta;
        }
        None
    }
}

/// Date bucket for a node, mirroring Waku's session date grouping.
///
/// Not used yet: the current sidebar groups by project. This lands with agent
/// sessions in M4, where the grouping is by recency rather than by project.
#[allow(dead_code)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DateGroup {
    Today,
    Yesterday,
    Weekday,
    Month,
    Earlier,
}

#[allow(dead_code)]
impl DateGroup {
    pub fn for_timestamp(ts: i64, now: DateTime<Local>) -> Self {
        let Some(local) = DateTime::from_timestamp_millis(ts) else {
            return Self::Earlier;
        };
        let local = local.with_timezone(&now.timezone());
        let today = now.date_naive();
        let date = local.date_naive();

        if date == today {
            Self::Today
        } else if today.pred_opt().is_some_and(|d| d == date) {
            Self::Yesterday
        } else if (today - date).num_days() < 7 {
            Self::Weekday
        } else if date.year() == today.year() && date.month() == today.month() {
            Self::Month
        } else {
            Self::Earlier
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            Self::Today => "Today",
            Self::Yesterday => "Yesterday",
            Self::Weekday => "This week",
            Self::Month => "This month",
            Self::Earlier => "Earlier",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use ekegai_core::model::TerminalNode;
    use uuid::Uuid;
    use std::path::PathBuf;

    fn project(name: &str) -> Project {
        Project {
            id: Uuid::new_v4(),
            path: PathBuf::from(format!("/tmp/{name}")),
            name: name.to_string(),
            git_branch: None,
            listening_ports: vec![],
            created_at: 0,
        }
    }

    fn node(project_id: ekegai_core::model::ProjectId, label: &str, created_at: i64) -> TerminalNode {
        let mut n = TerminalNode::new(project_id, PathBuf::from("/tmp"), label);
        n.created_at = created_at;
        n
    }

    fn model_with_two_projects() -> SidebarModel {
        let a = project("alpha");
        let b = project("beta");
        let nodes = vec![
            node(a.id, "one", 100),
            node(a.id, "two", 200),
            node(b.id, "three", 300),
        ];
        SidebarModel {
            projects: vec![a, b],
            nodes,
            ..Default::default()
        }
    }

    #[test]
    fn rows_start_with_search_and_action() {
        let rows = model_with_two_projects().rows();
        assert_eq!(rows[0], Row::Search);
        assert_eq!(rows[1], Row::NewProject);
    }

    #[test]
    fn projects_with_nodes_get_headers_and_children() {
        let rows = model_with_two_projects().rows();
        let headers: Vec<&Row> = rows
            .iter()
            .filter(|r| matches!(r, Row::GroupHeader { .. }))
            .collect();
        assert_eq!(headers.len(), 2);

        let node_rows: Vec<&Row> = rows.iter().filter(|r| matches!(r, Row::Node { .. })).collect();
        assert_eq!(node_rows.len(), 3);
    }

    #[test]
    fn children_are_newest_first_within_their_project() {
        let rows = model_with_two_projects().rows();
        let labels: Vec<String> = rows
            .iter()
            .filter_map(|r| match r {
                Row::Node { label, .. } => Some(label.clone()),
                _ => None,
            })
            .collect();
        // Rows are grouped per project, newest first inside each group: alpha's
        // "two" (200) then "one" (100), then beta's "three" (300).
        assert_eq!(labels, vec!["two", "one", "three"]);
    }

    #[test]
    fn collapsed_group_hides_its_children() {
        let mut m = model_with_two_projects();
        let key = SidebarModel::group_key(&m.projects[0]);
        m.toggle_collapsed(&key);

        let rows = m.rows();
        let labels: Vec<String> = rows
            .iter()
            .filter_map(|r| match r {
                Row::Node { label, .. } => Some(label.clone()),
                _ => None,
            })
            .collect();
        // Only beta's node remains.
        assert_eq!(labels, vec!["three"]);
    }

    #[test]
    fn searching_filters_nodes_by_label() {
        let mut m = model_with_two_projects();
        m.query = "two".into();
        let rows = m.rows();
        let labels: Vec<String> = rows
            .iter()
            .filter_map(|r| match r {
                Row::Node { label, .. } => Some(label.clone()),
                _ => None,
            })
            .collect();
        assert_eq!(labels, vec!["two"]);
    }

    #[test]
    fn search_expands_groups_so_hits_are_visible() {
        let mut m = model_with_two_projects();
        let key = SidebarModel::group_key(&m.projects[0]);
        m.toggle_collapsed(&key);
        m.query = "one".into();

        let rows = m.rows();
        assert!(
            rows.iter()
                .any(|r| matches!(r, Row::Node { label, .. } if label == "one")),
            "a search hit inside a collapsed group must still be shown"
        );
    }

    #[test]
    fn search_with_no_hits_shows_a_message() {
        let mut m = model_with_two_projects();
        m.query = "zzz".into();
        assert!(matches!(m.rows().last(), Some(Row::Empty { .. })));
    }

    #[test]
    fn empty_projects_show_placeholder() {
        let m = SidebarModel::default();
        assert!(matches!(m.rows().last(), Some(Row::Empty { .. })));
    }

    #[test]
    fn pagination_hides_overflow_behind_show_more() {
        let mut m = SidebarModel::default();
        let p = project("big");
        let nodes: Vec<TerminalNode> = (0..SHOW_MORE_BATCH + 5)
            .map(|i| node(p.id, &format!("n{i}"), i as i64))
            .collect();
        m.projects = vec![p];
        m.nodes = nodes;

        let rows = m.rows();
        let visible = rows
            .iter()
            .filter(|r| matches!(r, Row::Node { .. }))
            .count();
        assert_eq!(visible, SHOW_MORE_BATCH);
        assert!(matches!(rows.last(), Some(Row::ShowMore { hidden: 5, .. })));
    }

    #[test]
    fn row_index_finds_a_node() {
        let m = model_with_two_projects();
        let target = m.nodes[0].id;
        assert!(m.row_index_of(target).is_some());
        assert!(m.row_index_of(Uuid::new_v4()).is_none());
    }

    #[test]
    fn next_selectable_skips_headers() {
        let m = model_with_two_projects();
        // From the top, the first selectable row is the first node.
        let idx = m.next_selectable(1, 1).expect("a node row exists");
        assert!(matches!(m.rows()[idx], Row::Node { .. }));
    }

    #[test]
    fn date_groups_label_sensibly() {
        let now = Local::now();
        assert_eq!(DateGroup::for_timestamp(now.timestamp_millis(), now), DateGroup::Today);
        let yesterday_ms = (now - chrono::Duration::days(1)).timestamp_millis();
        assert_eq!(
            DateGroup::for_timestamp(yesterday_ms, now),
            DateGroup::Yesterday
        );
        let old_ms = (now - chrono::Duration::days(60)).timestamp_millis();
        assert_eq!(DateGroup::for_timestamp(old_ms, now), DateGroup::Earlier);
    }
}
