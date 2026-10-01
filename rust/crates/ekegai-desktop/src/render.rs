//! Turning an `alacritty_terminal` frame into GPUI paint calls.
//!
//! Kept separate from the view so the colour math can be unit tested without
//! a window or a GPU.

use ekegai_core::model::NodeState;
use ekegai_core::pty::StyledChar;
use gpui::{Font, FontWeight, Hsla, Rgba, rgb};

use crate::theme::Theme;

/// A UI font at the given weight, for chrome text drawn with `TextRun`.
pub fn ui_font(bold: bool) -> Font {
    Font {
        family: crate::theme::MONO.into(),
        weight: if bold { FontWeight::BOLD } else { FontWeight::NORMAL },
        style: gpui::FontStyle::Normal,
        features: Default::default(),
        fallbacks: Some(gpui::FontFallbacks::from_fonts(vec![
            "JetBrainsMono Nerd Font".to_string(),
            "DejaVu Sans Mono".to_string(),
            "Noto Sans Mono".to_string(),
            "Liberation Mono".to_string(),
        ])),
    }
}

/// Colour for a node's status dot, so the sidebar and terminal agree.
pub fn status_color(state: NodeState, theme: &Theme) -> Rgba {
    match state {
        NodeState::Idle => theme.status_idle,
        NodeState::Running => theme.status_running,
        NodeState::Waiting => theme.status_waiting,
        NodeState::Done => theme.status_idle,
        NodeState::Error => theme.status_error,
    }
}

/// A run of consecutive cells that share styling, so we emit one `TextRun`
/// per run instead of one element per cell.
#[derive(Clone, Debug, PartialEq)]
pub struct CellRun {
    pub text: String,
    pub fg: Hsla,
    pub bg: Option<Hsla>,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
}

/// The standard 16 ANSI colours, dark and light variants, in the order the
/// SGR codes 30-37 / 90-97 expect.
const ANSI_DARK: [u32; 16] = [
    0x000000, 0xcc0000, 0x4e9a06, 0xc4a000, 0x3465a4, 0x75507b, 0x06989a, 0xd3d7cf, 0x555753,
    0xef2929, 0x8ae234, 0xfce94f, 0x729fcf, 0xad7fa8, 0x34e2e2, 0xeeeeec,
];

const ANSI_LIGHT: [u32; 16] = [
    0x000000, 0xa40000, 0x387d1c, 0xb58900, 0x3465a4, 0x75507b, 0x0f8a8a, 0xd3d7cf, 0x555753,
    0xa40000, 0x387d1c, 0xb58900, 0x3465a4, 0x75507b, 0x0f8a8a, 0xeeeeec,
];

/// Resolve an alacritty colour to an RGBA value.
pub fn resolve(
    color: alacritty_terminal::vte::ansi::Color,
    theme: &Theme,
    dark: bool,
    default: Rgba,
) -> Rgba {
    use alacritty_terminal::vte::ansi::{Color, NamedColor, Rgb};
    match color {
        Color::Spec(Rgb { r, g, b }) => Rgba {
            r: r as f32 / 255.0,
            g: g as f32 / 255.0,
            b: b as f32 / 255.0,
            a: 1.0,
        },
        Color::Indexed(i) => {
            let palette = if dark { &ANSI_DARK } else { &ANSI_LIGHT };
            match i {
                0..=15 => from_hex(palette[i as usize]),
                16..=231 => {
                    // 6x6x6 colour cube.
                    let n = i as u32 - 16;
                    let steps = [0u32, 95, 135, 175, 215, 255];
                    let r = steps[(n / 36) as usize];
                    let g = steps[((n % 36) / 6) as usize];
                    let b = steps[(n % 6) as usize];
                    Rgba {
                        r: r as f32 / 255.0,
                        g: g as f32 / 255.0,
                        b: b as f32 / 255.0,
                        a: 1.0,
                    }
                }
                232..=255 => {
                    let v = 8 + (i as u32 - 232) * 10;
                    let v = v.min(255) as f32 / 255.0;
                    Rgba { r: v, g: v, b: v, a: 1.0 }
                }
                // `Indexed` holds a u8, so the ranges above are exhaustive.
            }
        }
        Color::Named(named) => match named {
            NamedColor::Foreground => default,
            NamedColor::Background => theme.term_background,
            NamedColor::Cursor => theme.term_cursor,
            NamedColor::Black => from_hex(if dark { ANSI_DARK[0] } else { ANSI_LIGHT[0] }),
            NamedColor::Red => from_hex(if dark { ANSI_DARK[1] } else { ANSI_LIGHT[1] }),
            NamedColor::Green => from_hex(if dark { ANSI_DARK[2] } else { ANSI_LIGHT[2] }),
            NamedColor::Yellow => from_hex(if dark { ANSI_DARK[3] } else { ANSI_LIGHT[3] }),
            NamedColor::Blue => from_hex(if dark { ANSI_DARK[4] } else { ANSI_LIGHT[4] }),
            NamedColor::Magenta => from_hex(if dark { ANSI_DARK[5] } else { ANSI_LIGHT[5] }),
            NamedColor::Cyan => from_hex(if dark { ANSI_DARK[6] } else { ANSI_LIGHT[6] }),
            NamedColor::White => from_hex(if dark { ANSI_DARK[7] } else { ANSI_LIGHT[7] }),
            NamedColor::BrightBlack => from_hex(ANSI_DARK[8]),
            NamedColor::BrightRed => from_hex(ANSI_DARK[9]),
            NamedColor::BrightGreen => from_hex(ANSI_DARK[10]),
            NamedColor::BrightYellow => from_hex(ANSI_DARK[11]),
            NamedColor::BrightBlue => from_hex(ANSI_DARK[12]),
            NamedColor::BrightMagenta => from_hex(ANSI_DARK[13]),
            NamedColor::BrightCyan => from_hex(ANSI_DARK[14]),
            NamedColor::BrightWhite => from_hex(ANSI_DARK[15]),
            // The `Dim*` variants are only reachable through the DIM
            // attribute rather than an SGR colour, so map them to their
            // undimmed counterparts.
            NamedColor::DimBlack => from_hex(if dark { ANSI_DARK[0] } else { ANSI_LIGHT[0] }),
            NamedColor::DimRed => from_hex(if dark { ANSI_DARK[1] } else { ANSI_LIGHT[1] }),
            NamedColor::DimGreen => from_hex(if dark { ANSI_DARK[2] } else { ANSI_LIGHT[2] }),
            NamedColor::DimYellow => from_hex(if dark { ANSI_DARK[3] } else { ANSI_LIGHT[3] }),
            NamedColor::DimBlue => from_hex(if dark { ANSI_DARK[4] } else { ANSI_LIGHT[4] }),
            NamedColor::DimMagenta => from_hex(if dark { ANSI_DARK[5] } else { ANSI_LIGHT[5] }),
            NamedColor::DimCyan => from_hex(if dark { ANSI_DARK[6] } else { ANSI_LIGHT[6] }),
            NamedColor::DimWhite => from_hex(if dark { ANSI_DARK[7] } else { ANSI_LIGHT[7] }),
            NamedColor::BrightForeground => default,
            NamedColor::DimForeground => default,
        },
    }
}

fn from_hex(hex: u32) -> Rgba {
    rgb(hex)
}

fn same_style(a: &CellRun, b: &CellRun) -> bool {
    a.fg == b.fg
        && a.bg == b.bg
        && a.bold == b.bold
        && a.italic == b.italic
        && a.underline == b.underline
}

/// Convert one row of cells into styled runs.
///
/// Trailing blanks are dropped so a short prompt line does not paint a
/// full-width bar of background colour.
pub fn row_runs(
    row: &[StyledChar],
    theme: &Theme,
    dark: bool,
) -> Vec<CellRun> {
    // The grid is rectangular, so a row may be shorter than its siblings only
    // if the emulator has fewer columns than we think; treat that as empty.
    let last_significant = row
        .iter()
        // Keep a trailing space only when it paints a background; otherwise it
        // is invisible and would paint a bar of colour for nothing.
        .rposition(|c| c.c != ' ' || !is_default_bg(c))
        .map(|i| i + 1)
        .unwrap_or(0);

    let mut runs: Vec<CellRun> = Vec::new();
    for cell in row.iter().take(last_significant) {
        // The trailing half of a wide glyph has no glyph of its own.
        if cell.wide_spacer {
            continue;
        }
        let (mut fg, mut bg) = (
            resolve(cell.fg, theme, dark, theme.term_foreground),
            resolve(cell.bg, theme, dark, theme.term_background),
        );
        if cell.reverse {
            std::mem::swap(&mut fg, &mut bg);
        }

        let bg = if cell.bg == alacritty_terminal::vte::ansi::Color::Named(
            alacritty_terminal::vte::ansi::NamedColor::Background,
        ) {
            None
        } else {
            Some(Hsla::from(bg))
        };

        let style = CellRun {
            text: String::new(),
            fg: Hsla::from(fg),
            bg,
            bold: cell.bold,
            italic: cell.italic,
            underline: cell.underline,
        };

        match runs.last_mut() {
            Some(last) if same_style(last, &style) => last.text.push(cell.c),
            _ => runs.push(CellRun {
                text: cell.c.to_string(),
                ..style
            }),
        }
    }
    runs
}

fn is_default_bg(cell: &StyledChar) -> bool {
    cell.bg == alacritty_terminal::vte::ansi::Color::Named(
        alacritty_terminal::vte::ansi::NamedColor::Background,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use alacritty_terminal::vte::ansi::{Color, NamedColor};

    fn cell(c: char, fg: Color, bg: Color) -> StyledChar {
        StyledChar {
            c,
            fg,
            bg,
            bold: false,
            italic: false,
            underline: false,
            dim: false,
            reverse: false,
            wide: false,
            wide_spacer: false,
        }
    }

    const DEFAULT_BG: Color = Color::Named(NamedColor::Background);
    const DEFAULT_FG: Color = Color::Named(NamedColor::Foreground);

    #[test]
    fn trailing_spaces_are_dropped() {
        let theme = Theme::dark();
        let row = vec![
            cell('h', DEFAULT_FG, DEFAULT_BG),
            cell('i', DEFAULT_FG, DEFAULT_BG),
            cell(' ', DEFAULT_FG, DEFAULT_BG),
            cell(' ', DEFAULT_FG, DEFAULT_BG),
        ];
        let runs = row_runs(&row, &theme, true);
        assert_eq!(runs.iter().map(|r| r.text.as_str()).collect::<String>(), "hi");
    }

    #[test]
    fn adjacent_same_style_cells_merge() {
        let theme = Theme::dark();
        let row = vec![
            cell('a', Color::Named(NamedColor::Red), DEFAULT_BG),
            cell('b', Color::Named(NamedColor::Red), DEFAULT_BG),
            cell('c', Color::Named(NamedColor::Red), DEFAULT_BG),
        ];
        let runs = row_runs(&row, &theme, true);
        assert_eq!(runs.len(), 1);
        assert_eq!(runs[0].text, "abc");
    }

    #[test]
    fn differing_styles_split_into_runs() {
        let theme = Theme::dark();
        let row = vec![
            cell('a', Color::Named(NamedColor::Red), DEFAULT_BG),
            cell('b', Color::Named(NamedColor::Blue), DEFAULT_BG),
        ];
        let runs = row_runs(&row, &theme, true);
        assert_eq!(runs.len(), 2);
        assert_eq!(runs[0].text, "a");
        assert_eq!(runs[1].text, "b");
    }

    #[test]
    fn default_background_is_transparent() {
        let theme = Theme::dark();
        let row = vec![cell('a', DEFAULT_FG, DEFAULT_BG)];
        let runs = row_runs(&row, &theme, true);
        assert_eq!(runs[0].bg, None);
    }

    #[test]
    fn explicit_background_is_kept() {
        let theme = Theme::dark();
        let row = vec![cell('a', DEFAULT_FG, Color::Named(NamedColor::Blue))];
        let runs = row_runs(&row, &theme, true);
        assert!(runs[0].bg.is_some());
    }

    #[test]
    fn reverse_swaps_foreground_and_background() {
        let theme = Theme::dark();
        let mut c = cell('a', Color::Named(NamedColor::Red), Color::Named(NamedColor::Blue));
        c.reverse = true;
        let runs = row_runs(&[c], &theme, true);
        // Red text on a blue field inverts to a blue glyph on a red field.
        assert_eq!(
            runs[0].fg,
            Hsla::from(resolve(
                Color::Named(NamedColor::Blue),
                &theme,
                true,
                theme.term_foreground,
            ))
        );
        assert_eq!(
            runs[0].bg,
            Some(Hsla::from(resolve(
                Color::Named(NamedColor::Red),
                &theme,
                true,
                theme.term_foreground,
            )))
        );
    }

    #[test]
    fn wide_glyph_spacers_are_not_drawn() {
        let theme = Theme::dark();
        let mut spacer = cell(' ', DEFAULT_FG, DEFAULT_BG);
        spacer.wide_spacer = true;
        let mut lead = cell('漢', DEFAULT_FG, DEFAULT_BG);
        lead.wide = true;
        let row = vec![lead, spacer, cell('x', DEFAULT_FG, DEFAULT_BG)];
        let runs = row_runs(&row, &theme, true);
        let text: String = runs.iter().map(|r| r.text.as_str()).collect();
        assert_eq!(text, "漢x");
    }

    #[test]
    fn indexed_colours_resolve_through_the_cube() {
        let theme = Theme::dark();
        // 196 is pure red in the 6x6x6 cube.
        let resolved = resolve(Color::Indexed(196), &theme, true, theme.term_foreground);
        assert_eq!(resolved, rgb(0xff0000));
    }

    #[test]
    fn greyscale_ramp_resolves() {
        let theme = Theme::dark();
        // 232 is the first greyscale entry, value 8.
        assert_eq!(
            resolve(Color::Indexed(232), &theme, true, theme.term_foreground),
            rgb(0x080808)
        );
    }

    #[test]
    fn truecolor_passes_through() {
        let theme = Theme::dark();
        let resolved = resolve(
            Color::Spec(alacritty_terminal::vte::ansi::Rgb { r: 1, g: 2, b: 3 }),
            &theme,
            true,
            theme.term_foreground,
        );
        assert_eq!(resolved, rgb(0x010203));
    }

    #[test]
    fn empty_row_produces_no_runs() {
        let theme = Theme::dark();
        assert!(row_runs(&[], &theme, true).is_empty());
    }
}
