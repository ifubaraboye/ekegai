//! The terminal view: owns a live `PtySession`, paints its frame, and
//! forwards keystrokes.
//!
//! Threading contract: all PTY I/O happens on the session's own threads. This
//! view only ever calls `drain_events` (non-blocking) and `snapshot` (a short
//! mutex-guarded read), so the application thread never blocks on a shell.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use ekegai_core::model::{NodeId, NodeState};
use ekegai_core::pty::{Frame, PtySession, SessionEvent};
use gpui::{
    AnyElement, Context, FocusHandle, Font, FontWeight, IntoElement, KeyDownEvent, Pixels, Render,
    SharedString, StyledText, Task, TextRun, Window, div, prelude::*, px, relative,
};

use crate::keys::{Key, Mods};
use crate::render::row_runs;
use crate::theme::{MONO, Theme};


/// Font size for terminal text, in px.
const FONT_SIZE: f32 = 13.0;
/// Row height as a multiple of the font size.
const LINE_HEIGHT: f32 = 1.35;
/// How often the view polls for PTY output.
const POLL_INTERVAL: Duration = Duration::from_millis(16);


pub struct TerminalView {
    session: PtySession,
    focus_handle: FocusHandle,
    frame: Frame,
    theme: Theme,
    dark: bool,
    last_poll: Instant,
    exited: Option<i32>,
    error: Option<String>,
    title: SharedString,
    /// Task that pumps PTY events. Held so it is cancelled with the view.
    pump: Option<Task<()>>,
    /// The graph node this terminal represents, if it is sidebar-addressable.
    node_id: Option<NodeId>,
}

impl TerminalView {
    pub fn new(
        cwd: PathBuf,
        node_id: Option<NodeId>,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> anyhow::Result<Self> {
        // 80x24 until the first layout pass corrects it.
        let session = PtySession::spawn(None, &cwd, 80, 24)?;
        let focus_handle = cx.focus_handle();
        focus_handle.focus(window, cx);

        let mut view = Self {
            frame: session.snapshot(),
            session,
            focus_handle,
            theme: Theme::default(),
            dark: Theme::default().term_background.r < 0.5,
            last_poll: Instant::now(),
            exited: None,
            error: None,
            title: cwd
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| "terminal".into())
                .into(),
            pump: None,
            node_id,
        };

        // Await PTY events in a task so a long-running command repaints as it
        // produces output. Polling only inside `render` would leave the screen
        // frozen until the next keystroke.
        let events = view.session.event_stream();
        let pump = cx.spawn(async move |this, cx| {
            while let Ok(event) = events.recv().await {
                // An Err means the view was dropped, so there is nothing left
                // to notify and the loop should end.
                if this
                    .update(cx, |view, cx| {
                        match &event {
                            SessionEvent::Frame => {}
                            SessionEvent::Exited(code) => {
                                if view.exited.is_none() {
                                    view.exited = Some(*code);
                                }
                            }
                            SessionEvent::Error(message) => view.error = Some(message.clone()),
                        }
                        view.frame = view.session.snapshot();
                        cx.notify();
                    })
                    .is_err()
                {
                    break;
                }
            }
        });
        // Hold the task so it is cancelled if the view goes away.
        view.pump.replace(pump);

        Ok(view)
    }

    /// Liveness, for the sidebar's status dot.
    pub fn state(&self) -> NodeState {
        if self.error.is_some() {
            return NodeState::Error;
        }
        match self.exited {
            Some(0) => NodeState::Done,
            Some(_) => NodeState::Error,
            None => NodeState::Idle,
        }
    }

    /// The graph node this terminal is bound to, if any.
    pub fn node_id(&self) -> Option<NodeId> {
        self.node_id
    }

    /// Move keyboard focus to this terminal.
    pub fn focus(&self, window: &mut Window, cx: &mut Context<Self>) {
        self.focus_handle.focus(window, cx);
        cx.notify();
    }

    fn mono() -> Font {
        Font {
            family: MONO.into(),
            weight: FontWeight::NORMAL,
            style: gpui::FontStyle::Normal,
            features: Default::default(),
            // Without fallbacks a missing family renders as nothing at all
            // rather than degrading to a real monospace face.
            fallbacks: Some(gpui::FontFallbacks::from_fonts(vec![
                "JetBrainsMono Nerd Font".to_string(),
                "DejaVu Sans Mono".to_string(),
                "Noto Sans Mono".to_string(),
                "Liberation Mono".to_string(),
            ])),
        }
    }

    /// Drain PTY events and refresh the cached frame. Cheap when idle.
    fn poll(&mut self, cx: &mut Context<Self>) {
        if self.last_poll.elapsed() < POLL_INTERVAL {
            return;
        }
        self.last_poll = Instant::now();

        let mut dirty = false;
        for event in self.session.drain_events() {
            match event {
                SessionEvent::Frame => dirty = true,
                SessionEvent::Exited(code) => {
                    if self.exited.is_none() {
                        self.exited = Some(code);
                        dirty = true;
                    }
                }
                SessionEvent::Error(message) => {
                    self.error = Some(message);
                    dirty = true;
                }
            }
        }

        if dirty {
            self.frame = self.session.snapshot();
            cx.notify();
        }
    }

    /// Keep the PTY's idea of the grid in step with our pixel size, measured
    /// from the real font rather than a hard-coded advance width.
    ///
    /// Only does work when the computed grid actually changed, so a steady
    /// stream of repaints does not spam the child with resizes.
    fn sync_size(&mut self, window: &mut Window) {
        let Some((cols, rows)) = self.grid_for(window) else {
            return;
        };
        if self.session.size() == (cols as usize, rows as usize) {
            return;
        }
        if let Err(err) = self.session.resize(cols, rows) {
            self.error = Some(err.to_string());
        }
        self.frame = self.session.snapshot();
    }

    /// How many columns and rows fit in the current viewport.
    fn grid_for(&self, window: &mut Window) -> Option<(u16, u16)> {
        // Measure with a real run: an empty run slice makes GPUI look up font
        // id 0, which panics before any font has been loaded.
        let probe = "M".repeat(32);
        let run = TextRun {
            len: probe.len(),
            font: Self::mono(),
            color: gpui::black(),
            background_color: None,
            underline: None,
            strikethrough: None,
        };
        let shaped = window.text_system().shape_line(
            probe.into(),
            px(FONT_SIZE),
            std::slice::from_ref(&run),
            None,
        );
        let advance = shaped.width / 32.0;
        if !f32::from(advance).is_finite() || advance <= px(0.0) {
            return None;
        }
        let cell_width = advance.max(px(1.0));
        let cell_height = px(FONT_SIZE * LINE_HEIGHT);

        let bounds = window.viewport_size();
        if bounds.width <= px(0.0) || bounds.height <= px(0.0) {
            return None;
        }
        let cols = ((bounds.width / cell_width).round() as u16).clamp(2, 500);
        let rows = ((bounds.height / cell_height).round() as u16).clamp(1, 500);
        Some((cols, rows))
    }

    fn on_key_down(&mut self, event: &KeyDownEvent, _window: &mut Window, cx: &mut Context<Self>) {
        let Some(key) = key_from_keystroke(event) else {
            // Unmapped key: fall through to the platform's default handling so
            // system shortcuts still work.
            return;
        };
        let mods = Mods {
            ctrl: event.keystroke.modifiers.control,
            alt: event.keystroke.modifiers.alt,
            shift: event.keystroke.modifiers.shift,
            character_input: event.prefer_character_input,
        };
        if let Some(bytes) = crate::keys::translate(key, mods)
            && let Err(err) = self.session.write(&bytes)
        {
            self.error = Some(err.to_string());
        }
        cx.notify();
    }

    fn render_row(&self, index: usize) -> AnyElement {
        let Some(row) = self.frame.rows.get(index) else {
            return div().into_any_element();
        };
        let runs = row_runs(row, &self.theme, self.dark);

        let mut element = div()
            .h(relative(LINE_HEIGHT))
            .line_height(relative(LINE_HEIGHT))
            .overflow_hidden();
        if runs.is_empty() {
            return element.into_any_element();
        }

        let text: String = runs.iter().map(|r| r.text.as_str()).collect();
        let text_runs: Vec<TextRun> = runs
            .iter()
            .map(|run| TextRun {
                len: run.text.len(),
                font: if run.bold { Self::mono().bold() } else { Self::mono() },
                color: run.fg,
                background_color: run.bg,
                underline: None,
                strikethrough: None,
            })
            .collect();

        element = element
            .font_family(MONO)
            .text_size(px(FONT_SIZE))
            .child(StyledText::new(text).with_runs(text_runs));
        element.into_any_element()
    }

    /// The block cursor, drawn as an inverted cell so it reads in any theme.
    fn render_cursor(&self, font_size: Pixels) -> Option<AnyElement> {
        if !self.frame.cursor_visible || self.exited.is_some() {
            return None;
        }
        let line = self.frame.cursor.line.0;
        if line < 0 {
            return None;
        }
        let row_index = line as usize;
        let column = self.frame.cursor.column.0;
        let row = self.frame.rows.get(row_index)?;
        let cell = row.get(column)?;
        if cell.wide_spacer {
            return None;
        }

        Some(
            div()
                .absolute()
                .top(relative(row_index as f32 * LINE_HEIGHT))
                .left(relative(column as f32))
                .w(relative(1.0))
                .h(relative(LINE_HEIGHT))
                .bg(self.theme.term_cursor)
                .child(
                    div()
                        .pl(px(1.0))
                        .font_family(MONO)
                        .text_size(font_size)
                        .child(
                            StyledText::new(cell.c.to_string())
                                .with_runs(vec![TextRun {
                                    len: cell.c.len_utf8(),
                                    font: Self::mono(),
                                    color: gpui::Hsla::from(self.theme.term_background),
                                    background_color: None,
                                    underline: None,
                                    strikethrough: None,
                                }]),
                        ),
                )
                .into_any_element(),
        )
    }

    fn render_status(&self) -> AnyElement {
        let (text, color) = match (&self.error, self.exited) {
            (Some(message), _) => (message.clone(), self.theme.status_error),
            (None, Some(code)) => (
                format!("process exited with status {code}"),
                self.theme.status_error,
            ),
            _ => {
                let cols = self.frame.rows.first().map_or(0, |r| r.len());
                (
                    format!("{}  ·  {}x{}", self.title, self.frame.rows.len(), cols),
                    self.theme.text_muted,
                )
            }
        };
        div()
            .flex_shrink_0()
            .px_2()
            .py_1()
            .bg(self.theme.surface)
            .border_t_1()
            .border_color(gpui::Hsla::from(self.theme.border))
            .font_family(MONO)
            .text_size(px(11.0))
            .child(
                StyledText::new(text.clone())
                    .with_runs(vec![TextRun {
                        len: text.len(),
                        font: Self::mono(),
                        color: gpui::Hsla::from(color),
                        background_color: None,
                        underline: None,
                        strikethrough: None,
                    }]),
            )
            .into_any_element()
    }
}

impl Render for TerminalView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        self.poll(cx);
        self.sync_size(window);

        let mut body = div()
            .flex()
            .flex_col()
            .relative()
            .overflow_hidden()
            .bg(self.theme.term_background);

        for index in 0..self.frame.rows.len() {
            body = body.child(self.render_row(index));
        }
        if let Some(cursor) = self.render_cursor(px(FONT_SIZE)) {
            body = body.child(cursor);
        }

        div()
            .flex()
            .flex_col()
            .size_full()
            .bg(self.theme.canvas)
            .track_focus(&self.focus_handle)
            .on_key_down(cx.listener(Self::on_key_down))
            .on_mouse_down(gpui::MouseButton::Left, {
                let focus = self.focus_handle.clone();
                move |_event, window, cx| focus.focus(window, cx)
            })
            .child(
                div()
                    .flex_1()
                    .overflow_hidden()
                    .px(px(FONT_SIZE * 0.6))
                    .py(px(FONT_SIZE * 0.5))
                    .child(body),
            )
            .child(self.render_status())
    }
}

/// Map a GPUI keystroke onto our logical key, or `None` to let it fall through.
fn key_from_keystroke(event: &KeyDownEvent) -> Option<Key> {
    key_from(&event.keystroke, event.prefer_character_input)
}

/// The routing half of key handling, split out so it can be tested with real
/// `Keystroke` values instead of needing a window and a compositor.
fn key_from(stroke: &gpui::Keystroke, prefer_character_input: bool) -> Option<Key> {
    // Text the platform produced, e.g. "ß" for Option-S. `prefer_character_input`
    // is set on AltGr-style layouts where the composed character must win over
    // the ASCII key name.
    if let Some(text) = &stroke.key_char
        && !stroke.modifiers.control
        && !stroke.modifiers.alt
        && let Some(c) = text.chars().next()
    {
        return Some(Key::Char(c));
    }

    // Named keys, matched on the platform's key name.
    let name = stroke.key.as_str();
    match name {
        "enter" | "return" => Some(Key::Enter),
        "tab" => Some(Key::Tab),
        "backspace" => Some(Key::Backspace),
        "escape" | "esc" => Some(Key::Escape),
        "up" => Some(Key::Up),
        "down" => Some(Key::Down),
        "left" => Some(Key::Left),
        "right" => Some(Key::Right),
        "home" => Some(Key::Home),
        "end" => Some(Key::End),
        "pageup" | "page_up" => Some(Key::PageUp),
        "pagedown" | "page_down" => Some(Key::PageDown),
        "delete" | "del" => Some(Key::Delete),
        "insert" | "ins" => Some(Key::Insert),
        other => {
            if let Some(n) = other.strip_prefix('f')
                && let Ok(n) = n.parse::<u8>()
                && (1..=12).contains(&n)
            {
                return Some(Key::F(n));
            }
            // A single printable character as the key name is an ordinary
            // letter, possibly with Ctrl or Alt held. Without this fallback
            // Ctrl-C and Alt-b were dropped on the floor, because their key
            // name is just "c" and "b" and matches no named key above.
            let mut chars = other.chars();
            if let (Some(c), None) = (chars.next(), chars.next())
                && (prefer_character_input || c.is_ascii_graphic() || c == ' ')
            {
                return Some(Key::Char(c));
            }
            None
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::Mods;
    use gpui::Keystroke;
    use gpui::Modifiers;

    fn stroke(key: &str, key_char: Option<&str>, ctrl: bool, alt: bool, shift: bool) -> Keystroke {
        Keystroke {
            modifiers: Modifiers {
                control: ctrl,
                alt,
                shift,
                ..Modifiers::default()
            },
            key: key.to_string(),
            key_char: key_char.map(str::to_string),
        }
    }

    /// Route a keystroke all the way to the bytes a terminal would receive.
    fn route(
        key: &str,
        key_char: Option<&str>,
        ctrl: bool,
        alt: bool,
        shift: bool,
    ) -> Option<Vec<u8>> {
        let s = stroke(key, key_char, ctrl, alt, shift);
        let key = key_from(&s, false)?;
        crate::keys::translate(key, Mods { ctrl, alt, shift, character_input: false })
    }

    #[test]
    fn plain_letters_become_their_utf8_bytes() {
        assert_eq!(route("a", Some("a"), false, false, false), Some(b"a".to_vec()));
        assert_eq!(route("z", Some("z"), false, false, false), Some(b"z".to_vec()));
    }

    #[test]
    fn named_keys_map_to_csi_sequences() {
        assert_eq!(route("up", None, false, false, false), Some(b"\x1b[A".to_vec()));
        assert_eq!(route("down", None, false, false, false), Some(b"\x1b[B".to_vec()));
        assert_eq!(route("return", None, false, false, false), Some(b"\r".to_vec()));
        assert_eq!(route("backspace", None, false, false, false), Some(vec![0x7f]));
        assert_eq!(route("pageup", None, false, false, false), Some(b"\x1b[5~".to_vec()));
        assert_eq!(route("f5", None, false, false, false), Some(b"\x1b[15~".to_vec()));
    }

    #[test]
    fn ctrl_c_sends_interrupt() {
        // The single most important mapping: a terminal that swallows Ctrl-C is
        // unusable. `key_from` must not treat the key name "c" as unknown.
        assert_eq!(route("c", Some("c"), true, false, false), Some(vec![0x03]));
    }

    #[test]
    fn ctrl_shift_c_still_sends_interrupt() {
        assert_eq!(route("C", Some("C"), true, false, true), Some(vec![0x03]));
    }

    #[test]
    fn shift_tab_sends_csi_z() {
        assert_eq!(route("tab", None, false, false, true), Some(b"\x1b[Z".to_vec()));
    }

    #[test]
    fn alt_prefixes_escape() {
        assert_eq!(route("b", Some("b"), false, true, false), Some(b"\x1bb".to_vec()));
    }

    #[test]
    fn non_ascii_input_is_utf8() {
        assert_eq!(
            route("é", Some("é"), false, false, false),
            Some("é".as_bytes().to_vec())
        );
    }

    #[test]
    fn unknown_keys_fall_through_rather_than_being_swallowed() {
        // None lets the platform handle the key, so system shortcuts survive.
        assert_eq!(route("f13", None, false, false, false), None);
        assert_eq!(route("capslock", None, false, false, false), None);
    }

    #[test]
    fn prefer_character_input_uses_the_typed_character() {
        // AltGr layouts set prefer_character_input; the composed character must
        // win over the ASCII key name.
        let s = stroke("q", Some("@"), false, false, false);
        assert_eq!(key_from(&s, true), Some(Key::Char('@')));
    }
}
