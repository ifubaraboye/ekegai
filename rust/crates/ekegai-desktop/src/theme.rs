//! Theme tokens for ekegai.
//!
//! Design language referenced from Waku's sidebar (date grouping, collapsible
//! project groups with a guide rail, action rows) but implemented from
//! scratch -- Waku is GPL-3.0 and ekegai is MIT, so no code is shared.
//!
//! The layout constants below are measured in rems so the sidebar scales with
//! the user's text size.

use gpui::{Rgba, rgb};

use crate::scaling::sp;

pub const SIDEBAR_WIDTH: f32 = 17.0;
pub const SIDEBAR_MIN_WIDTH: f32 = 12.0;
pub const SIDEBAR_MAX_WIDTH: f32 = 28.0;

/// Sidebar action row (new project, new terminal, ...).
pub const ACTION_ROW_HEIGHT: f32 = 2.0;
/// Collapsible group header ("Today", a project name, ...).
pub const GROUP_HEADER_HEIGHT: f32 = 1.75;
/// Vertical breathing room under a group header.
pub const GROUP_HEADER_GAP: f32 = 0.125;
/// A terminal/agent row inside a group.
pub const SESSION_ROW_HEIGHT: f32 = 1.5;
/// Gap between session rows.
pub const SESSION_ROW_GAP: f32 = 0.0625;
/// Space between groups.
pub const GROUP_SPACER: f32 = 0.625;
/// X position of the collapsible-group guide rail.
pub const GROUP_GUIDE_X: f32 = 0.9375;
/// Left padding for children of a group, clearing the guide rail.
pub const GROUP_CHILD_PADDING: f32 = 1.75;
/// How many rows a group reveals before "show more" appears.
pub const SHOW_MORE_BATCH: usize = 30;

#[derive(Clone, Copy, Debug)]
pub struct Theme {
    pub canvas: Rgba,
    pub surface: Rgba,
    pub surface_raised: Rgba,
    pub border: Rgba,
    pub border_focused: Rgba,
    pub text: Rgba,
    pub text_muted: Rgba,
    pub text_accent: Rgba,
    pub focus_ring: Rgba,
    pub guide_rail: Rgba,

    pub status_idle: Rgba,
    pub status_running: Rgba,
    pub status_waiting: Rgba,
    pub status_error: Rgba,

    /// Terminal palette defaults (ANSI).
    pub term_foreground: Rgba,
    pub term_background: Rgba,
    pub term_cursor: Rgba,
    pub term_selection: Rgba,
}

impl Theme {
    pub fn dark() -> Self {
        Self {
            canvas: rgb(0x11131a),
            surface: rgb(0x16181f),
            surface_raised: rgb(0x1e2130),
            border: rgb(0x2a2e3d),
            border_focused: rgb(0x7aa2f7),
            text: rgb(0xc0caf5),
            text_muted: rgb(0x565f89),
            text_accent: rgb(0x7aa2f7),
            focus_ring: rgb(0xa8c6ff),
            guide_rail: rgb(0x262a38),

            status_idle: rgb(0x9ece6a),
            status_running: rgb(0xe0af68),
            status_waiting: rgb(0x4c9eeb),
            status_error: rgb(0xf7768e),

            term_foreground: rgb(0xc0caf5),
            term_background: rgb(0x11131a),
            term_cursor: rgb(0x7aa2f7),
            term_selection: rgb(0x3b4261),
        }
    }

    pub fn light() -> Self {
        Self {
            canvas: rgb(0xf7f8fa),
            surface: rgb(0xffffff),
            surface_raised: rgb(0xf0f2f6),
            border: rgb(0xd8dce4),
            border_focused: rgb(0x3b6fd4),
            text: rgb(0x1a1c22),
            text_muted: rgb(0x767c8a),
            text_accent: rgb(0x3b6fd4),
            focus_ring: rgb(0x1f5fbf),
            guide_rail: rgb(0xe4e7ee),

            status_idle: rgb(0x2f7d32),
            status_running: rgb(0x9a6400),
            status_waiting: rgb(0x1f6fb2),
            status_error: rgb(0xc0263c),

            term_foreground: rgb(0x1a1c22),
            term_background: rgb(0xf7f8fa),
            term_cursor: rgb(0x3b6fd4),
            term_selection: rgb(0xc9d8f0),
        }
    }
}

impl Default for Theme {
    fn default() -> Self {
        Self::dark()
    }
}

/// Sidebar geometry, in rems. Kept as functions so callers stay in rem space.
pub mod metrics {
    use super::*;

    pub fn sidebar_width() -> gpui::Rems {
        sp(SIDEBAR_WIDTH)
    }
    pub fn action_row_height() -> gpui::Rems {
        sp(ACTION_ROW_HEIGHT)
    }
    pub fn group_header_height() -> gpui::Rems {
        sp(GROUP_HEADER_HEIGHT)
    }
    pub fn session_row_height() -> gpui::Rems {
        sp(SESSION_ROW_HEIGHT)
    }
    pub fn group_guide_x() -> gpui::Rems {
        sp(GROUP_GUIDE_X)
    }
    pub fn group_child_padding() -> gpui::Rems {
        sp(GROUP_CHILD_PADDING)
    }
}
