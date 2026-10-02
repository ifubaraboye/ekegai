//! The sidebar, laid out to match the reference: a wordmark, a search field,
//! a "Pinned" section, and a "Projects" section of collapsible groups whose
//! children are sessions.
//!
//! Written from scratch against Waku's visual language (its exact palette and
//! proportions) -- Waku is GPL-3.0 and ekegai is MIT, so no Waku code is used.

use gpui::{
    AnyElement, Context, EventEmitter, FocusHandle, Hsla, InteractiveElement, MouseButton,
    StyledText, TextRun, Window, actions, div, prelude::*, px,
};

use ekegai_core::model::{NodeId, NodeState, ProjectId};

use crate::render::status_color;
use crate::sidebar_model::{Row, SidebarModel};
use crate::theme::{self, Theme};

actions!(ekegai_sidebar, [MoveUp, MoveDown, Activate]);

/// Emitted when the user picks a session in the sidebar.
pub struct SelectNode(pub NodeId);
impl EventEmitter<SelectNode> for Sidebar {}

pub struct Sidebar {
    pub model: SidebarModel,
    focus_handle: FocusHandle,
    selected: Option<usize>,
    theme: Theme,
    pub width: gpui::Rems,
}

/// One pinned session row's worth of data.
#[derive(Clone, Copy)]
struct PinnedView<'a> {
    node_id: NodeId,
    title: &'a str,
    time: &'a str,
    state: NodeState,
    active: bool,
}

impl Sidebar {
    pub fn new(cx: &mut Context<Self>) -> Self {
        Self {
            model: SidebarModel::default(),
            focus_handle: cx.focus_handle(),
            selected: None,
            theme: Theme::light(),
            width: gpui::Rems(17.5),
        }
    }

    pub fn focus_handle(&self) -> FocusHandle {
        self.focus_handle.clone()
    }

    pub fn rows(&self) -> Vec<Row> {
        self.model.rows()
    }

    pub fn reveal_node(&mut self, node_id: NodeId) {
        if let Some(index) = self.model.row_index_of(node_id) {
            self.selected = Some(index);
        }
    }

    fn move_selection(&mut self, delta: isize, cx: &mut Context<Self>) {
        let start = self.selected.unwrap_or(0);
        if let Some(next) = self.model.next_selectable(start, delta) {
            self.selected = Some(next);
            cx.notify();
        }
    }

    fn activate(&mut self, cx: &mut Context<Self>) {
        let Some(index) = self.selected else { return };
        match self.model.rows().get(index) {
            Some(Row::PinnedSession { node_id, .. }) => cx.emit(SelectNode(*node_id)),
            Some(Row::ProjectSession { node_id, .. }) => cx.emit(SelectNode(*node_id)),
            Some(Row::ProjectHeader {
                project_id, expanded, ..
            }) => {
                self.model.set_collapsed(*project_id, *expanded);
                cx.notify();
            }
            _ => {}
        }
    }

    // -- painters ----------------------------------------------------------

    fn span(&self, text: &str, color: Hsla, bold: bool) -> StyledText {
        let t = text.to_string();
        StyledText::new(t.clone()).with_runs(vec![TextRun {
            len: t.len(),
            font: crate::render::ui_font(bold),
            color,
            background_color: None,
            underline: None,
            strikethrough: None,
        }])
    }

    fn tiny(&self, text: &str, color: Hsla) -> AnyElement {
        div()
            .font_family(theme::MONO)
            .text_size(px(11.0))
            .flex_shrink_0()
            .child(self.span(text, color, false))
            .into_any_element()
    }

    fn body(&self, text: &str, color: Hsla, bold: bool) -> AnyElement {
        div()
            .font_family(theme::MONO)
            .text_size(px(13.0))
            .child(self.span(text, color, bold))
            .into_any_element()
    }

    fn section_label(&self, label: &'static str) -> AnyElement {
        let theme = self.theme;
        div()
            .pt(px(16.0))
            .pb(px(5.0))
            .pl(px(12.0))
            .child(div().font_family(theme::MONO).text_size(px(11.0)).child(
                self.span(label, Hsla::from(theme.text_muted), false),
            ))
            .into_any_element()
    }

    fn pinned_session(&self, row: &PinnedView, focused: bool, cx: &mut Context<Self>) -> AnyElement {
        let PinnedView { node_id, title, time, state, active } = *row;
        let theme = self.theme;
        let bg = if active || focused {
            Hsla::from(theme.surface_raised)
        } else {
            gpui::transparent_black()
        };
        div()
            .h(px(30.0))
            .w_full()
            .px(px(12.0))
            .flex()
            .items_center()
            .gap(px(7.0))
            .rounded(px(6.0))
            .bg(bg)
            .cursor_default()
            .on_mouse_down(MouseButton::Left, {
                let id = node_id;
                cx.listener(move |_, _, _, cx| cx.emit(SelectNode(id)))
            })
            .child(self.tiny("○", Hsla::from(theme.text_muted)))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .overflow_hidden()
                    .child(self.body(title, Hsla::from(theme.text), false)),
            )
            .when(state == NodeState::Done, |el| {
                el.child(self.tiny(
                    "✓",
                    Hsla::from(status_color(NodeState::Done, &theme)),
                ))
            })
            .child(self.tiny(time, Hsla::from(theme.text_muted)))
            .into_any_element()
    }

    fn project_header(
        &self,
        project_id: ProjectId,
        name: &str,
        expanded: bool,
        focused: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let theme = self.theme;
        div()
            .h(px(30.0))
            .w_full()
            .pl(px(12.0))
            .pr(px(12.0))
            .flex()
            .items_center()
            .gap(px(7.0))
            .rounded(px(6.0))
            .bg(if focused {
                Hsla::from(theme.surface_raised)
            } else {
                gpui::transparent_black()
            })
            .cursor_default()
            .on_mouse_down(MouseButton::Left, {
                let pid = project_id;
                let exp = expanded;
                cx.listener(move |this, _, _, cx| {
                    this.model.set_collapsed(pid, exp);
                    cx.notify();
                })
            })
            .child(self.tiny("◯", Hsla::from(theme.text_muted)))
            .child(
                div()
                    .flex_1()
                    .min_w_0()
                    .child(self.body(name, Hsla::from(theme.text), false)),
            )
            .child(self.tiny(if expanded { "⌄" } else { "›" }, Hsla::from(theme.text_muted)))
            .child(self.tiny("+", Hsla::from(theme.text_muted)))
            .into_any_element()
    }

    fn project_session(
        &self,
        node_id: NodeId,
        branch: &str,
        time: &str,
        active: bool,
        focused: bool,
        cx: &mut Context<Self>,
    ) -> AnyElement {
        let theme = self.theme;
        div()
            .h(px(30.0))
            .w_full()
            .pl(px(30.0))
            .pr(px(12.0))
            .flex()
            .items_center()
            .gap(px(6.0))
            .rounded(px(6.0))
            .bg(if active || focused {
                Hsla::from(theme.surface_raised)
            } else {
                gpui::transparent_black()
            })
            .cursor_default()
            .on_mouse_down(MouseButton::Left, {
                let id = node_id;
                cx.listener(move |_, _, _, cx| cx.emit(SelectNode(id)))
            })
            .child(
                div()
                    .font_family(theme::MONO)
                    .text_size(px(12.5))
                    .child(self.span(branch, Hsla::from(theme.text), false)),
            )
            .child(self.tiny("★", Hsla::from(theme.text_muted)))
            .child(div().flex_1())
            .child(self.tiny(time, Hsla::from(theme.text_muted)))
            .into_any_element()
    }

    fn show_more(&self, hidden: usize) -> AnyElement {
        let theme = self.theme;
        div()
            .h(px(24.0))
            .pl(px(30.0))
            .child(self.tiny(&format!("+ {hidden} more"), Hsla::from(theme.text_accent)))
            .into_any_element()
    }

    fn empty(&self, message: &str) -> AnyElement {
        let theme = self.theme;
        div()
            .pl(px(12.0))
            .pt(px(16.0))
            .child(self.tiny(message, Hsla::from(theme.text_muted)))
            .into_any_element()
    }

    fn search_field(&self) -> AnyElement {
        let theme = self.theme;
        let text = if self.model.query.is_empty() {
            "Search"
        } else {
            self.model.query.as_str()
        };
        let color = if self.model.query.is_empty() {
            theme.text_muted
        } else {
            theme.text
        };
        div()
            .h(px(30.0))
            .mx(px(12.0))
            .mb(px(4.0))
            .rounded(px(8.0))
            .border_1()
            .border_color(Hsla::from(theme.border))
            .bg(Hsla::from(theme.canvas))
            .flex()
            .items_center()
            .gap(px(6.0))
            .pl(px(9.0))
            .child(self.tiny("⌕", Hsla::from(theme.text_muted)))
            .child(
                div()
                    .font_family(theme::MONO)
                    .text_size(px(12.5))
                    .flex_1()
                    .overflow_hidden()
                    .child(self.span(text, Hsla::from(color), false)),
            )
            .into_any_element()
    }
}

impl gpui::Render for Sidebar {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl gpui::IntoElement {
        let theme = self.theme;
        let rows = self.rows();

        let mut body = div().flex_1().flex().flex_col();
        // The model mutates during row construction, so collect first.
        let mut rendered = Vec::new();
        for (index, row) in rows.iter().enumerate().collect::<Vec<_>>() {
            let focused = self.selected == Some(index) && self.focus_handle.is_focused(window);
            let el = match row {
                Row::SectionLabel(label) => self.section_label(label),
                Row::PinnedSession { node_id, title, time, state, active } => {
                    self.pinned_session(
                        &PinnedView {
                            node_id: *node_id,
                            title,
                            time,
                            state: *state,
                            active: *active,
                        },
                        focused,
                        cx,
                    )
                }
                Row::ProjectHeader { project_id, name, expanded, .. } => {
                    self.project_header(*project_id, name, *expanded, focused, cx)
                }
                Row::ProjectSession { node_id, branch, time, active, .. } => {
                    self.project_session(*node_id, branch, time, *active, focused, cx)
                }
                Row::ShowMore { hidden, .. } => self.show_more(*hidden),
                Row::Empty { message } => self.empty(message),
            };
            rendered.push(el);
        }
        for el in rendered {
            body = body.child(el);
        }

        div()
            .flex()
            .flex_col()
            .h_full()
            .w(self.width)
            .flex_shrink_0()
            .bg(Hsla::from(theme.surface))
            .border_r_1()
            .border_color(Hsla::from(theme.border))
            .track_focus(&self.focus_handle)
            .on_action(cx.listener(|this, _: &MoveUp, _, cx| {
                this.move_selection(-1, cx)
            }))
            .on_action(cx.listener(|this, _: &MoveDown, _, cx| {
                this.move_selection(1, cx)
            }))
            .on_action(cx.listener(|this, _: &Activate, _, cx| {
                this.activate(cx)
            }))
            .child(
                div()
                    .h(px(46.0))
                    .flex_none()
                    .flex()
                    .items_center()
                    .gap(px(8.0))
                    .px(px(14.0))
                    .child(self.body("✦", Hsla::from(theme.text), false))
                    .child(
                        div()
                            .font_family(theme::MONO)
                            .text_size(px(15.0))
                            .child(self.span("fx", Hsla::from(theme.text), true)),
                    ),
            )
            .child(self.search_field())
            .child(body)
            .into_any_element()
    }
}

/// Register the sidebar key bindings on the app.
pub fn key_bindings() -> Vec<gpui::KeyBinding> {
    use gpui::KeyBinding;
    vec![
        KeyBinding::new("up", MoveUp, Some("ekegai-sidebar")),
        KeyBinding::new("down", MoveDown, Some("ekegai-sidebar")),
        KeyBinding::new("enter", Activate, Some("ekegai-sidebar")),
    ]
}
