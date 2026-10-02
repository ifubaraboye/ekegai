//! The application shell: sidebar on the left, the active terminal on the
//! right.
//!
//! This is the first GPUI entity that owns more than one child, so it is also
//! where the cross-component wiring lives: selecting a terminal in the sidebar
//! focuses it, and each terminal reports its liveness back into the sidebar's
//! model so the status dots are real rather than decorative.

use std::collections::HashMap;
use std::path::PathBuf;

use ekegai_core::model::{NodeId, NodeState, Project, TerminalNode};
use gpui::{
    AppContext, Context, Entity, EventEmitter, FocusHandle, InteractiveElement, KeyBinding,
    SharedString, StyledText, Subscription, TextRun, Window, actions, div, prelude::*, px, size,
};

use crate::sidebar::{SelectNode, Sidebar};
use crate::terminal_view::TerminalView;
use crate::theme::Theme;

actions!(ekegai_app, [NewTerminal, ToggleSidebar, FocusSidebar, Quit]);

pub struct AppShell {
    sidebar: Entity<Sidebar>,
    terminals: HashMap<NodeId, Entity<TerminalView>>,
    active: Option<NodeId>,
    focus_handle: FocusHandle,
    sidebar_visible: bool,
    theme: Theme,
    next_label: usize,
    /// Held so the sidebar's selection subscription lives as long as the shell.
    _subscription: Option<Subscription>,
}

/// Directories offered on a cold start, so the sidebar is not empty.
fn seed_projects() -> Vec<(Project, Vec<TerminalNode>)> {
    let home = std::env::var("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from("/"));

    // Prefer a real project directory over $HOME, since that is what someone
    // opening the app usually wants to look at.
    let candidates: Vec<PathBuf> = [
        std::env::current_exe()
            .ok()
            .and_then(|exe| exe.parent().and_then(|p| p.parent()).map(|p| p.to_path_buf())),
        Some(home.join("Desktop/code")),
        Some(home.clone()),
    ]
    .into_iter()
    .flatten()
    .filter(|p| p.is_dir())
    .collect();

    let mut out: Vec<(Project, Vec<TerminalNode>)> = Vec::new();
    for root in candidates {
        if root.file_name().is_none() {
            continue;
        }
        if out.iter().any(|(p, _): &(Project, _)| p.path == root) {
            continue;
        }
        let mut project = Project::new(root.clone());
        project.git_branch = Some("main".into());
        let node = TerminalNode::new(project.id, root.clone(), "shell");
        out.push((project, vec![node]));
        if out.len() == 2 {
            break;
        }
    }
    out
}

impl AppShell {
    pub fn new(window: &mut Window, cx: &mut Context<Self>) -> Self {
        let theme = Theme::light();
        let focus_handle = cx.focus_handle();
        let sidebar = cx.new(Sidebar::new);

        let mut shell = Self {
            sidebar,
            terminals: HashMap::new(),
            active: None,
            focus_handle,
            sidebar_visible: true,
            theme,
            next_label: 1,
            _subscription: None,
        };

        for (project, nodes) in seed_projects() {
            for node in nodes {
                let cwd = node.cwd.clone();
                let id = node.id;
                let entity = cx.new(|cx| {
                    TerminalView::new(cwd, Some(id), window, cx).unwrap_or_else(|err| {
                        panic!("failed to start a shell session: {err:#}")
                    })
                });
                shell.terminals.insert(id, entity);
                shell.sidebar.update(cx, |sidebar, _| {
                    sidebar.model.projects.push(project.clone());
                    sidebar.model.nodes.push(node.clone());
                });
                if shell.active.is_none() {
                    shell.active = Some(id);
                }
            }
        }

        let sidebar = shell.sidebar.clone();
        shell._subscription = Some(cx.subscribe(
            &sidebar,
            |shell, _, event, cx| match event {
                SelectNode(id) => {
                    if !shell.terminals.contains_key(id) {
                        return;
                    }
                    shell.active = Some(*id);
                    shell.sidebar.update(cx, |sidebar, cx| {
                        sidebar.model.active_node = Some(*id);
                        sidebar.reveal_node(*id);
                        cx.notify();
                    });
                    cx.emit(SelectNode(*id));
                }
            },
        ));

        // Focus the first terminal so the window is usable immediately.
        if let Some(first) = shell.active {
            shell.sidebar.update(cx, |sidebar, _| {
                sidebar.model.active_node = Some(first);
                sidebar.reveal_node(first);
            });
            if let Some(entity) = shell.terminals.get(&first).cloned() {
                entity.update(cx, |term, cx| term.focus(window, cx));
            }
        }

        shell
    }

    /// Push terminal liveness into the sidebar so the status dots are real.
    fn sync_sidebar_model(&mut self, cx: &mut Context<Self>) {
        // Reconcile by the terminal's own node id rather than the map key, so
        // a mis-bound terminal shows up as a wrong status dot instead of
        // silently updating the wrong row.
        let states: Vec<(NodeId, NodeState)> = self
            .terminals
            .values()
            .filter_map(|entity| {
                let (id, state) = entity.read_with(cx, |term, _| (term.node_id(), term.state()));
                Some((id?, state))
            })
            .collect();

        self.sidebar.update(cx, |sidebar, _| {
            for (id, state) in states {
                if let Some(node) = sidebar.model.nodes.iter_mut().find(|n| n.id == id) {
                    node.state = state;
                }
            }
        });
    }

    fn new_terminal(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let (project_id, cwd) = match self.sidebar.read_with(cx, |sidebar, _| {
            let id = sidebar.model.active_node?;
            let node = sidebar.model.nodes.iter().find(|n| n.id == id)?;
            Some((node.project_id, node.cwd.clone()))
        }) {
            Some(pair) => pair,
            None => return,
        };

        let label = format!("shell {}", self.next_label);
        self.next_label += 1;
        let node = TerminalNode::new(project_id, cwd.clone(), label);
        let id = node.id;

        let entity = cx.new(|cx| {
            TerminalView::new(cwd, Some(id), window, cx)
                .unwrap_or_else(|err| panic!("failed to start a shell session: {err:#}"))
        });
        self.terminals.insert(id, entity);
        self.sidebar.update(cx, |sidebar, _| {
            sidebar.model.nodes.push(node);
        });
        self.sidebar.update(cx, |sidebar, cx| {
            sidebar.model.active_node = Some(id);
            sidebar.reveal_node(id);
            cx.notify();
        });
        self.active = Some(id);
        if let Some(entity) = self.terminals.get(&id).cloned() {
            entity.update(cx, |term, cx| term.focus(window, cx));
        }
    }

    fn toggle_sidebar(&mut self, cx: &mut Context<Self>) {
        self.sidebar_visible = !self.sidebar_visible;
        cx.notify();
    }

    fn focus_sidebar(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        if !self.sidebar_visible {
            self.sidebar_visible = true;
        }
        let handle = self.sidebar.read_with(cx, |s, _| s.focus_handle());
        handle.focus(window, cx);
        cx.notify();
    }

    fn status_text(&self) -> SharedString {
        let terminals = self.terminals.len();
        format!("{terminals} terminals  ·  ^B sidebar  ·  ^T new terminal").into()
    }
}

impl EventEmitter<SelectNode> for AppShell {}

impl gpui::Render for AppShell {
    fn render(&mut self, _window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        self.sync_sidebar_model(cx);

        let theme = self.theme;
        let visible = self.sidebar_visible;
        let sidebar = self.sidebar.clone();
        let active = self.active.and_then(|id| self.terminals.get(&id).cloned());
        let status = self.status_text();

        div()
            .flex()
            .flex_col()
            .size_full()
            .bg(gpui::Hsla::from(theme.canvas))
            .track_focus(&self.focus_handle)
            .on_action(cx.listener(|this, _: &NewTerminal, window, cx| {
                this.new_terminal(window, cx)
            }))
            .on_action(cx.listener(|this, _: &ToggleSidebar, _, cx| {
                this.toggle_sidebar(cx)
            }))
            .on_action(cx.listener(|this, _: &FocusSidebar, window, cx| {
                this.focus_sidebar(window, cx)
            }))
            .child(
                div()
                    .flex()
                    .flex_row()
                    .flex_1()
                    .min_h_0()
                    .when(visible, |this| this.child(sidebar))
                    .child({
                        let slot = div().flex_1().min_w_0();
                        match active {
                            Some(entity) => slot.child(entity),
                            None => slot,
                        }
                    }),
            )
            .child(
                div()
                    .flex_shrink_0()
                    .px_2()
                    .py_1()
                    .bg(gpui::Hsla::from(theme.surface))
                    .border_t_1()
                    .border_color(gpui::Hsla::from(theme.border))
                    .font_family(crate::theme::MONO)
                    .text_size(px(11.0))
                    .child(StyledText::new(status.clone()).with_runs(vec![TextRun {
                        len: status.len(),
                        font: crate::render::ui_font(false),
                        color: gpui::Hsla::from(theme.text_muted),
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }])),
            )
    }
}

fn key_bindings() -> Vec<KeyBinding> {
    let mut bindings = vec![
        KeyBinding::new("ctrl-q", Quit, None),
        KeyBinding::new("ctrl-b", ToggleSidebar, Some("ekegai")),
        KeyBinding::new("ctrl-t", NewTerminal, Some("ekegai")),
        KeyBinding::new("ctrl-p", FocusSidebar, Some("ekegai")),
    ];
    bindings.extend(crate::sidebar::key_bindings());
    bindings
}

pub fn run() {
    gpui_platform::application().run(|cx: &mut gpui::App| {
        cx.on_action(|_: &Quit, cx: &mut gpui::App| cx.quit());
        cx.bind_keys(key_bindings());
        cx.on_window_closed(|cx, _| {
            if cx.windows().is_empty() {
                cx.quit();
            }
        })
        .detach();

        let bounds = gpui::Bounds::centered(None, size(px(1000.0), px(680.0)), cx);
        cx.open_window(
            gpui::WindowOptions {
                focus: true,
                window_bounds: Some(gpui::WindowBounds::Windowed(bounds)),
                ..Default::default()
            },
            |window, cx| cx.new(|cx| AppShell::new(window, cx)),
        )
        .expect("open ekegai window");

        cx.activate(true);
    });
}
