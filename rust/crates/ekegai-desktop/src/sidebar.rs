//! The sidebar: project groups, terminals, search, and actions.
//!
//! Visually modelled on Waku's sidebar -- a collapsible group header with a
//! left guide rail, indented children, an action row, search, and incremental
//! "show more" pagination -- but written from scratch against our own state,
//! because Waku is GPL-3.0 and ekegai is MIT.

use gpui::{
    AnyElement, Context, EventEmitter, FocusHandle, Hsla, InteractiveElement, MouseButton, StyledText,
    TextRun, Window, actions, div, prelude::*, px, transparent_black,
};

use ekegai_core::model::{NodeId, NodeState};

use crate::render::status_color;
use crate::sidebar_model::{Row, SidebarModel};
use crate::theme::{self, Theme};

actions!(
    ekegai_sidebar,
    [MoveUp, MoveDown, Activate, ToggleGroup, FocusSearch, NewTerminal]
);

/// Emitted when the user picks a terminal in the sidebar.
pub struct SelectNode(pub NodeId);
impl EventEmitter<SelectNode> for Sidebar {}

/// Inputs for painting one terminal row.
struct NodeRowView<'a> {
    node_id: NodeId,
    label: &'a str,
    state: NodeState,
    active: bool,
    selected: bool,
}

/// Inputs for painting one collapsible group header.
struct GroupHeaderView<'a> {
    key: &'a str,
    label: &'a str,
    expanded: bool,
    count: usize,
    selected: bool,
}

pub struct Sidebar {
    pub model: SidebarModel,
    focus_handle: FocusHandle,
    /// Index of the keyboard-selected row, if any.
    selected: Option<usize>,
    theme: Theme,
    width: gpui::Rems,
}

/// Fixed-height rows, so the list can be virtualized and `scroll_to` works.
const GROUP_HEADER_HEIGHT: f32 = theme::GROUP_HEADER_HEIGHT;
const ACTION_HEIGHT: f32 = theme::ACTION_ROW_HEIGHT;
const SHOW_MORE_HEIGHT: f32 = 2.0;
const SEARCH_HEIGHT: f32 = 2.25;

impl Sidebar {
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self {
            model: SidebarModel::default(),
            focus_handle: cx.focus_handle(),
            selected: None,
            theme: Theme::dark(),
            width: gpui::Rems(theme::SIDEBAR_WIDTH),
        }
    }

    pub fn focus_handle(&self) -> FocusHandle {
        self.focus_handle.clone()
    }

    /// Index of the row matching `node`, so the selection follows it.
    ///
    /// GPUI scrolls a focused child into view, but the selection here is index
    /// based rather than focus based, so the offset is not yet applied. That
    /// lands with list virtualization in M3.
    pub fn reveal_node(&mut self, node: NodeId) {
        if let Some(index) = self.model.row_index_of(node) {
            self.selected = Some(index);
        }
    }

    fn rows(&self) -> Vec<Row> {
        self.model.rows()
    }

    fn move_selection(&mut self, delta: isize, cx: &mut Context<Self>) {
        let from = match self.selected {
            Some(index) => index,
            None => {
                // Start from the first selectable row.
                let Some(first) = self.model.next_selectable(0, 1) else {
                    return;
                };
                self.selected = Some(first);
                cx.notify();
                return;
            }
        };
        let Some(next) = self.model.next_selectable(from, delta) else {
            return;
        };
        self.selected = Some(next);
        cx.notify();
    }

    fn activate(&mut self, cx: &mut Context<Self>) {
        let rows = self.rows();
        let Some(index) = self.selected else {
            return;
        };
        match rows.get(index) {
            Some(Row::Node { node_id, .. }) => {
                cx.emit(SelectNode(*node_id));
            }
            Some(Row::GroupHeader { key, .. }) => {
                self.model.toggle_collapsed(key);
                cx.notify();
            }
            _ => {}
        }
    }

    fn toggle_selected_group(&mut self, cx: &mut Context<Self>) {
        let rows = self.rows();
        let Some(index) = self.selected else { return };
        if let Some(Row::GroupHeader { key, .. }) = rows.get(index) {
            let key = key.clone();
            self.model.toggle_collapsed(&key);
            cx.notify();
        }
    }

    // -- rendering ---------------------------------------------------------

    /// The state dot. Colour alone is not an accessible signal, so the row's
    /// accessible label also carries the state text.
    fn render_status_dot(&self, state: NodeState) -> AnyElement {
        div()
            .size(px(6.0))
            .flex_shrink_0()
            .rounded_full()
            .bg(status_color(state, &self.theme))
            .into_any_element()
    }

    fn render_node_row(
        &self,
        row: NodeRowView<'_>,
        focused: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let NodeRowView { node_id, label, state, active, selected } = row;
        let theme = self.theme;
        // Two distinct states: the active terminal, and the row the keyboard is
        // on. They need to be tellable apart, so they get different tints and
        // the active one also gets an accent edge.
        let row_bg: Hsla = if active {
            Hsla::from(theme.surface_raised)
        } else if selected && focused {
            Hsla::from(theme.surface)
        } else {
            transparent_black()
        };
        let label_color = theme.text;

        let text = label.to_string();
        div()
            .id(gpui::ElementId::NamedChild(
                std::sync::Arc::new(gpui::ElementId::Name("node".into())),
                node_id.to_string().into(),
            ))
            .flex()
            .items_center()
            .gap_2()
            // Inset past the guide rail, which is what visually nests the
            // child under its project.
            .pl(theme::metrics::group_child_padding())
            .pr_2()
            .h(theme::metrics::session_row_height())
            .w_full()
            .bg(row_bg)
            .cursor_pointer()
            .on_mouse_down(MouseButton::Left, {
                let selected_id = node_id;
                cx.listener(move |_, _, _, cx| cx.emit(SelectNode(selected_id)))
            })
            .child(self.render_status_dot(state))
            .child(
                div()
                    .flex_1()
                    .overflow_hidden()
                    .font_family(crate::theme::MONO)
                    .text_size(px(12.0))
                    .child(StyledText::new(text.clone()).with_runs(vec![TextRun {
                        len: text.len(),
                        font: crate::render::ui_font(false),
                        color: Hsla::from(label_color),
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }])),
            )
            .when(active, |this| this.border_l_1().border_color(gpui::Hsla::from(theme.border_focused)))
            .role(gpui::Role::ListItem)
            .aria_label(format!("{label}, {}", state.label()))
            .into_any_element()
    }

    fn render_group_header(
        &self,
        row: GroupHeaderView<'_>,
        focused: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let GroupHeaderView { key, label, expanded, count, selected } = row;
        let theme = self.theme;
        let caret = if expanded { "▾" } else { "▸" };
        let text = format!("{label}  {count}");

        div()
            .id(gpui::ElementId::NamedChild(
                std::sync::Arc::new(gpui::ElementId::Name("group".into())),
                key.into(),
            ))
            .flex()
            .items_center()
            .gap_2()
            .h(gpui::Rems(GROUP_HEADER_HEIGHT))
            .w_full()
            .pr_2()
            .cursor_pointer()
            // The guide rail: a hairline at a fixed inset, so every header
            // aligns and children hang off it.
            .relative()
            .child(
                div()
                    .absolute()
                    .left(theme::metrics::group_guide_x())
                    .top_0()
                    .bottom_0()
                    .w(px(1.0))
                    .bg(gpui::Hsla::from(theme.guide_rail)),
            )
            .child(
                div()
                    .w(px(10.0))
                    .flex_shrink_0()
                    .text_color(gpui::Hsla::from(theme.text_muted))
                    .child(caret_text(caret, theme)),
            )
            .child(
                div()
                    .flex_1()
                    .overflow_hidden()
                    .font_family(crate::theme::MONO)
                    .text_size(px(11.0))
                    .child(StyledText::new(text.clone()).with_runs(vec![TextRun {
                        len: text.len(),
                        font: crate::render::ui_font(true),
                        color: gpui::Hsla::from(theme.text_muted),
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }])),
            )
            .when(selected && focused, |this| {
                this.bg(Hsla::from(theme.surface_raised))
            })
            .on_mouse_down(MouseButton::Left, {
                let key = key.to_string();
                cx.listener(move |this, _, _, cx| {
                    this.model.toggle_collapsed(&key);
                    cx.notify();
                })
            })
            .role(gpui::Role::Button)
            .aria_label(format!("{label}, {count} terminals, {}", if expanded { "expanded" } else { "collapsed" }))
            .into_any_element()
    }

    fn render_show_more(&self, group_key: &str, hidden: usize, cx: &mut Context<Self>) -> AnyElement {
        let theme = self.theme;
        let text = format!("+ {hidden} more");
        div()
            .id(gpui::ElementId::NamedChild(
                std::sync::Arc::new(gpui::ElementId::Name("more".into())),
                group_key.to_string().into(),
            ))
            .flex()
            .items_center()
            .pl(theme::metrics::group_child_padding())
            .pr_2()
            .h(gpui::Rems(SHOW_MORE_HEIGHT))
            .w_full()
            .cursor_pointer()
            .on_mouse_down(MouseButton::Left, {
                let key = group_key.to_string();
                cx.listener(move |this, _, _, cx| {
                    // `on_mouse_down` takes an `Fn`, so the key is cloned
                    // rather than moved out of the closure.
                    let key = key.clone();
                    let revealed =
                        this.model.revealed_for(&key) + crate::sidebar_model::SHOW_MORE_BATCH;
                    this.model.revealed.retain(|(k, _)| k != &key);
                    this.model.revealed.push((key, revealed));
                    cx.notify();
                })
            })
            .font_family(crate::theme::MONO)
            .text_size(px(11.0))
            .child(StyledText::new(text.clone()).with_runs(vec![TextRun {
                len: text.len(),
                font: crate::render::ui_font(false),
                color: gpui::Hsla::from(theme.text_accent),
                background_color: None,
                underline: None,
                strikethrough: None,
            }]))
            .into_any_element()
    }

    fn render_action_row(&self, icon: &str, label: &str, cx: &mut Context<Self>) -> AnyElement {
        let theme = self.theme;
        let text = format!("{icon}  {label}");
        div()
            .flex()
            .items_center()
            .px_2()
            .h(gpui::Rems(ACTION_HEIGHT))
            .w_full()
            .cursor_pointer()
            .on_mouse_down(MouseButton::Left, cx.listener(|_, _, _, _| {}))
            .font_family(crate::theme::MONO)
            .text_size(px(12.0))
            .child(StyledText::new(text.clone()).with_runs(vec![TextRun {
                len: text.len(),
                font: crate::render::ui_font(false),
                color: gpui::Hsla::from(theme.text_muted),
                background_color: None,
                underline: None,
                strikethrough: None,
            }]))
            .into_any_element()
    }

    fn render_empty(&self, message: &str) -> AnyElement {
        let theme = self.theme;
        let text = message.to_string();
        div()
            .px_2()
            .h(gpui::Rems(ACTION_HEIGHT))
            .flex()
            .items_center()
            .font_family(crate::theme::MONO)
            .text_size(px(11.0))
            .child(StyledText::new(text.clone()).with_runs(vec![TextRun {
                len: text.len(),
                font: crate::render::ui_font(false),
                color: gpui::Hsla::from(theme.text_muted),
                background_color: None,
                underline: None,
                strikethrough: None,
            }]))
            .into_any_element()
    }

    /// The search field. Text entry proper arrives with M3; for now it renders
    /// the query so the filtering behaviour is visible and testable.
    fn render_search(&self, window: &mut Window) -> AnyElement {
        let theme = self.theme;
        let focused = self.focus_handle.is_focused(window);
        let placeholder = if self.model.query.is_empty() {
            "Search".to_string()
        } else {
            self.model.query.clone()
        };
        let color = if self.model.query.is_empty() {
            theme.text_muted
        } else {
            theme.text
        };
        div()
            .flex()
            .items_center()
            .gap_2()
            .mx_2()
            .mt_2()
            .mb_1()
            .px_2()
            .h(gpui::Rems(SEARCH_HEIGHT))
            .rounded(px(6.0))
            .bg(gpui::Hsla::from(if focused { theme.surface_raised } else { theme.surface }))
            .border_1()
            .border_color(gpui::Hsla::from(if focused { theme.focus_ring } else { theme.border }))
            .child(
                div()
                    .w(px(10.0))
                    .flex_shrink_0()
                    .child(gpui_search_glyph(theme)),
            )
            .font_family(crate::theme::MONO)
            .text_size(px(12.0))
            .child(StyledText::new(placeholder.clone()).with_runs(vec![TextRun {
                len: placeholder.len(),
                font: crate::render::ui_font(false),
                color: gpui::Hsla::from(color),
                background_color: None,
                underline: None,
                strikethrough: None,
            }]))
            .into_any_element()
    }
}

/// The magnifying-glass glyph in the search field.
fn gpui_search_glyph(theme: Theme) -> AnyElement {
    caret_text("\u{2315}", theme)
}

/// A bare text node, used for the disclosure caret.
fn caret_text(caret: &str, theme: Theme) -> AnyElement {
    let text = caret.to_string();
    div()
        .font_family(crate::theme::MONO)
        .text_size(px(10.0))
        .child(StyledText::new(text.clone()).with_runs(vec![TextRun {
            len: text.len(),
            font: crate::render::ui_font(false),
            color: gpui::Hsla::from(theme.text_muted),
            background_color: None,
            underline: None,
            strikethrough: None,
        }]))
        .into_any_element()
}

impl gpui::Render for Sidebar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        let theme = self.theme;
        let rows = self.rows();
        let selected = self.selected;
        let focused = self.focus_handle.is_focused(window);

        // The list owns everything below the search field.
        let mut body = div().flex_1();
        for (index, row) in rows.iter().enumerate().skip(2) {
            let is_selected = selected == Some(index);
            let element = match row {
                Row::GroupHeader { key, label, expanded, count, .. } => {
                    self.render_group_header(
                        GroupHeaderView {
                            key,
                            label,
                            expanded: *expanded,
                            count: *count,
                            selected: is_selected,
                        },
                        focused,
                        cx,
                    )
                }
                Row::Node { node_id, label, state, active, .. } => {
                    self.render_node_row(
                        NodeRowView {
                            node_id: *node_id,
                            label,
                            state: *state,
                            active: *active,
                            selected: is_selected,
                        },
                        focused,
                        cx,
                    )
                }
                Row::ShowMore { group_key, hidden } => {
                    self.render_show_more(group_key, *hidden, cx)
                }
                Row::Empty { message } => self.render_empty(message),
                Row::Search | Row::NewProject => continue,
            };
            body = body.child(element);
        }

        div()
            .flex()
            .flex_col()
            .h_full()
            .w(self.width)
            .flex_shrink_0()
            .bg(gpui::Hsla::from(theme.surface))
            .border_r_1()
            .border_color(gpui::Hsla::from(theme.border))
            .track_focus(&self.focus_handle)
            .on_action(cx.listener(
                |this, _: &MoveUp, _, cx| this.move_selection(-1, cx),
            ))
            .on_action(cx.listener(
                |this, _: &MoveDown, _, cx| this.move_selection(1, cx),
            ))
            .on_action(cx.listener(|this, _: &Activate, _, cx| this.activate(cx)))
            .on_action(cx.listener(|this, _: &ToggleGroup, _, cx| {
                this.toggle_selected_group(cx)
            }))
            .child(self.render_search(window))
            .child(self.render_action_row("+", "New project", cx))
            .child(
                div()
                    .id("sidebar-scroll")
                    .flex_1()
                    .overflow_y_scroll()
                    .child(body),
            )
            .child(
                // A visible hint rather than a hidden affordance, since the
                // shortcut is the only way to move the selection.
                div()
                    .px_2()
                    .py_1()
                    .border_t_1()
                    .border_color(gpui::Hsla::from(theme.border))
                    .font_family(crate::theme::MONO)
                    .text_size(px(10.0))
                    .child(
                        StyledText::new(if focused { "↑↓ move · ⏎ open" } else { "" })
                            .with_runs(vec![TextRun {
                                len: if focused { "↑↓ move · ⏎ open".len() } else { 0 },
                                font: crate::render::ui_font(false),
                                color: gpui::Hsla::from(theme.text_muted),
                                background_color: None,
                                underline: None,
                                strikethrough: None,
                            }]),
                    ),
            )
    }
}

/// Register the sidebar key bindings on the app.
pub fn key_bindings() -> Vec<gpui::KeyBinding> {
    use gpui::KeyBinding;
    vec![
        KeyBinding::new("up", MoveUp, Some("ekegai-sidebar")),
        KeyBinding::new("down", MoveDown, Some("ekegai-sidebar")),
        KeyBinding::new("enter", Activate, Some("ekegai-sidebar")),
        KeyBinding::new("left", ToggleGroup, Some("ekegai-sidebar")),
    ]
}
