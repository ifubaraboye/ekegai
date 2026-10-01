//! Keystroke to terminal byte-sequence translation.
//!
//! Getting this wrong is what makes a terminal feel broken: Ctrl-C must send
//! 0x03 rather than being swallowed as a keybinding, Shift-Tab must send the
//! CSI Z sequence that readline and tmux expect, and Alt must prefix ESC.

/// A logical key, so the translation can be unit tested without synthesising
/// platform keystrokes.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Key {
    Char(char),
    Enter,
    Tab,
    Backspace,
    Escape,
    Up,
    Down,
    Left,
    Right,
    Home,
    End,
    PageUp,
    PageDown,
    Delete,
    Insert,
    F(u8),
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Mods {
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    /// Key event produced text rather than a function key.
    pub character_input: bool,
}

/// Translate a key press into the bytes a terminal expects.
///
/// Returns `None` for combinations the terminal should ignore.
pub fn translate(key: Key, mods: Mods) -> Option<Vec<u8>> {
    let base: Vec<u8> = match key {
        Key::Char(c) => {
            if mods.ctrl {
                // Ctrl-A..Ctrl-Z map to 0x01..0x1a. Control codes for the
                // remaining punctuation are computed below.
                let byte = match c {
                    'a'..='z' => (c as u8) - b'a' + 1,
                    'A'..='Z' => (c as u8) - b'A' + 1,
                    '@' => 0,
                    '[' => 0x1b,
                    '\\' => 0x1c,
                    ']' => 0x1d,
                    '^' => 0x1e,
                    '_' => 0x1f,
                    ' ' => 0,
                    '?' => 0x7f,
                    _ => return None,
                };
                vec![byte]
            } else {
                let mut buf = [0u8; 4];
                let encoded = c.encode_utf8(&mut buf).as_bytes().to_vec();
                // Alt-<char> is ESC followed by the character, which is how
                // the shell receives Meta bindings such as Alt-b.
                if mods.alt {
                    let mut out = vec![0x1b];
                    out.extend_from_slice(&encoded);
                    return Some(out);
                }
                return Some(encoded);
            }
        }
        Key::Enter => vec![b'\r'],
        Key::Tab => {
            if mods.shift {
                // Shift-Tab is CSI Z. Not ETX.
                return Some(b"\x1b[Z".to_vec());
            }
            vec![b'\t']
        }
        Key::Backspace => {
            // The DEL byte, which is what xterm sends for Backspace.
            vec![0x7f]
        }
        Key::Escape => vec![0x1b],
        Key::Up => csi(b'A'),
        Key::Down => csi(b'B'),
        Key::Right => csi(b'C'),
        Key::Left => csi(b'D'),
        Key::Home => csi(b'H'),
        Key::End => csi(b'F'),
        Key::PageUp => vec![0x1b, b'[', b'5', b'~'],
        Key::PageDown => vec![0x1b, b'[', b'6', b'~'],
        Key::Delete => vec![0x1b, b'[', b'3', b'~'],
        Key::Insert => vec![0x1b, b'[', b'2', b'~'],
        Key::F(n) => {
            let seq: &[u8] = match n {
                1 => b"\x1bOP",
                2 => b"\x1bOQ",
                3 => b"\x1bOR",
                4 => b"\x1bOS",
                5 => b"\x1b[15~",
                6 => b"\x1b[17~",
                7 => b"\x1b[18~",
                8 => b"\x1b[19~",
                9 => b"\x1b[20~",
                10 => b"\x1b[21~",
                11 => b"\x1b[23~",
                12 => b"\x1b[24~",
                _ => return None,
            };
            seq.to_vec()
        }
    };

    // xterm sends SS3 for arrow keys in application cursor mode, but CSI is
    // universally understood, so we always use CSI.
    if mods.alt {
        let mut out = vec![0x1b];
        out.extend_from_slice(&base);
        return Some(out);
    }
    Some(base)
}

fn csi(final_byte: u8) -> Vec<u8> {
    vec![0x1b, b'[', final_byte]
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plain(key: Key) -> Option<Vec<u8>> {
        translate(key, Mods::default())
    }

    #[test]
    fn enter_and_tab_are_plain() {
        assert_eq!(plain(Key::Enter), Some(vec![b'\r']));
        assert_eq!(plain(Key::Tab), Some(vec![b'\t']));
    }

    #[test]
    fn backspace_sends_del_not_bs() {
        assert_eq!(plain(Key::Backspace), Some(vec![0x7f]));
    }

    #[test]
    fn ctrl_letters_map_to_control_codes() {
        for (c, byte) in [('c', 0x03u8), ('d', 0x04), ('a', 0x01), ('z', 0x1a)] {
            let out = translate(
                Key::Char(c),
                Mods { ctrl: true, ..Default::default() },
            );
            assert_eq!(out, Some(vec![byte]), "Ctrl-{c}");
        }
    }

    #[test]
    fn ctrl_shift_c_is_still_interrupt() {
        // Terminals are expected to treat Ctrl-C as SIGINT regardless of shift.
        let out = translate(
            Key::Char('C'),
            Mods { ctrl: true, shift: true, ..Default::default() },
        );
        assert_eq!(out, Some(vec![0x03]));
    }

    #[test]
    fn ctrl_space_is_nul() {
        let out = translate(
            Key::Char(' '),
            Mods { ctrl: true, ..Default::default() },
        );
        assert_eq!(out, Some(vec![0x00]));
    }

    #[test]
    fn arrows_use_csi() {
        assert_eq!(plain(Key::Up), Some(b"\x1b[A".to_vec()));
        assert_eq!(plain(Key::Down), Some(b"\x1b[B".to_vec()));
        assert_eq!(plain(Key::Right), Some(b"\x1b[C".to_vec()));
        assert_eq!(plain(Key::Left), Some(b"\x1b[D".to_vec()));
    }

    #[test]
    fn shift_tab_is_csi_z() {
        let out = translate(Key::Tab, Mods { shift: true, ..Default::default() });
        assert_eq!(out, Some(b"\x1b[Z".to_vec()));
    }

    #[test]
    fn alt_prefixes_escape() {
        let out = translate(Key::Char('b'), Mods { alt: true, ..Default::default() });
        assert_eq!(out, Some(b"\x1bb".to_vec()));
    }

    #[test]
    fn alt_enter_escapes_the_carriage_return() {
        let out = translate(Key::Enter, Mods { alt: true, ..Default::default() });
        assert_eq!(out, Some(b"\x1b\r".to_vec()));
    }

    #[test]
    fn non_ascii_characters_are_utf8_encoded() {
        assert_eq!(plain(Key::Char('é')), Some("é".as_bytes().to_vec()));
    }

    #[test]
    fn function_keys_use_the_expected_sequences() {
        assert_eq!(plain(Key::F(1)), Some(b"\x1bOP".to_vec()));
        assert_eq!(plain(Key::F(5)), Some(b"\x1b[15~".to_vec()));
    }

    #[test]
    fn unsupported_combinations_are_ignored() {
        // Ctrl with a letter outside the mapping must not emit garbage.
        let out = translate(
            Key::Char('€'),
            Mods { ctrl: true, ..Default::default() },
        );
        assert_eq!(out, None);
    }
}
