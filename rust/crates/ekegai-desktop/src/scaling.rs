//! Scaling helper, adapted from the *idea* used by Waku's `theme::sp`.
//!
//! We express sidebar and chrome sizes in rems relative to a base font size
//! so the whole UI scales with the user's text-size preference instead of
//! hard-coding pixels everywhere.

use gpui::Rems;

/// Base font size in px that one rem corresponds to.
pub const BASE_FONT_SIZE: f32 = 16.0;

/// Convert a rem value to a size relative to the active window's rem unit.
pub fn sp(value: f32) -> Rems {
    Rems(value)
}

/// Convert a rem value to px against a concrete base, for the rare cases
/// where a rem-derived pixel number is genuinely needed (e.g. row heights
/// used for list virtualization).
pub fn sp_px(value: f32, base_font_size: f32) -> f32 {
    value * base_font_size
}
