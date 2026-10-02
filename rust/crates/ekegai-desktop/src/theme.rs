//! Theme tokens for ekegai.
//!
//! Design language referenced from Waku's sidebar (date grouping, collapsible
//! project groups with a guide rail, action rows) but implemented from
//! scratch -- Waku is GPL-3.0 and ekegai is MIT, so no code is shared.
//!
//! The layout constants below are measured in rems so the sidebar scales with
//! the user's text size.

// Staged for the sidebar milestone; see scaling.rs.
use gpui::{Rgba, rgb};

use crate::scaling::sp;

/// The font family used across the UI. Monospace throughout: the terminal
/// places glyphs by cell, and a proportional sidebar would misalign with it.
pub const MONO: &str = "Liberation Mono";

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
    /// Waku's dark palette, taken from its `theme.rs` dark(). Neutral graphite
    /// surfaces, coral reserved for meaning.
    pub fn dark() -> Self {
        Self {
            canvas: rgb(0x1A1A1A),
            surface: rgb(0x181818),
            surface_raised: rgb(0x232323),
            border: rgb(0x2a2a2a),
            border_focused: rgb(0xE2795B),
            text: rgb(0xE2E2E2),
            text_muted: rgb(0x7D7D7D),
            text_accent: rgb(0xE2795B),
            focus_ring: rgb(0xE2795B),
            guide_rail: rgb(0x2a2a2a),

            status_idle: rgb(0x62C987),
            status_running: rgb(0xE0B36A),
            status_waiting: rgb(0xE2795B),
            status_error: rgb(0xE2726A),

            term_foreground: rgb(0xE2E2E2),
            term_background: rgb(0x151515),
            term_cursor: rgb(0xE2795B),
            term_selection: rgb(0x3b4261),
        }
    }

    /// Waku's light palette, matching the reference. Canvas/sidebar/surface
    /// are the exact hex values from its `theme.rs` light().
    pub fn light() -> Self {
        Self {
            canvas: rgb(0xF6F5F6),
            surface: rgb(0xF3F3F3),
            surface_raised: rgb(0xECECEC),
            border: rgb(0xE3E3E3),
            border_focused: rgb(0xC85F44),
            text: rgb(0x242424),
            text_muted: rgb(0x858585),
            text_accent: rgb(0xC85F44),
            focus_ring: rgb(0xC85F44),
            guide_rail: rgb(0xE6E6E6),

            status_idle: rgb(0x2F8F52),
            status_running: rgb(0xA66B20),
            status_waiting: rgb(0xC85F44),
            status_error: rgb(0xC64A42),

            term_foreground: rgb(0x242424),
            term_background: rgb(0xFFFFFF),
            term_cursor: rgb(0xC85F44),
            term_selection: rgb(0xc9d8f0),
        }
    }
}

impl Default for Theme {
    fn default() -> Self {
        // The reference is light mode.
        Self::light()
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
