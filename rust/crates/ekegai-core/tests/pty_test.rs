//! Integration tests for the PTY layer.
//!
//! These spawn real shells, so they are the tests that actually prove the
//! riskiest part of the app works on this machine.

#![cfg(unix)]

use std::path::PathBuf;
use std::time::{Duration, Instant};

use ekegai_core::pty::{PtySession, SessionEvent};

fn cwd() -> PathBuf {
    std::env::var("HOME").map(PathBuf::from).unwrap_or_else(|_| PathBuf::from("/"))
}

/// Wait until `predicate` holds for the session's rendered screen, or time out.
fn wait_for_screen(session: &mut PtySession, needle: &str, timeout: Duration) -> bool {
    let deadline = Instant::now() + timeout;
    while Instant::now() < deadline {
        for event in session.drain_events() {
            if let SessionEvent::Error(err) = event {
                panic!("session error: {err}");
            }
        }
        let frame = session.snapshot();
        let seen = frame
            .rows
            .iter()
            .map(|row| row.iter().map(|c| c.c).collect::<String>())
            .collect::<Vec<_>>()
            .join("\n");
        if seen.contains(needle) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    false
}

fn screen_text(session: &PtySession) -> String {
    session
        .snapshot()
        .rows
        .iter()
        .map(|row| row.iter().map(|c| c.c).collect::<String>())
        .collect::<Vec<_>>()
        .join("\n")
}

#[test]
fn spawns_a_shell_and_echoes_into_the_grid() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    session.write_str("echo EKEGAI_PTY_OK\n").expect("write");
    assert!(
        wait_for_screen(&mut session, "EKEGAI_PTY_OK", Duration::from_secs(20)),
        "marker never appeared; screen was:\n{}",
        screen_text(&session)
    );
}

#[test]
fn reports_the_grid_size_it_was_spawned_with() {
    let session = PtySession::spawn(Some("bash".into()), &cwd(), 100, 30).expect("spawn");
    assert_eq!(session.size(), (100, 30));
    let frame = session.snapshot();
    assert_eq!(frame.rows.len(), 30);
    assert_eq!(frame.rows[0].len(), 100);
}

#[test]
fn resizing_updates_the_grid() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    session.resize(120, 40).expect("resize");
    assert_eq!(session.size(), (120, 40));
    let frame = session.snapshot();
    assert_eq!(frame.rows.len(), 40);
    assert_eq!(frame.rows[0].len(), 120);
}

#[test]
fn resize_to_the_same_size_is_a_no_op() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    // Must not error or emit a redundant SIGWINCH.
    session.resize(80, 24).expect("same-size resize is fine");
    assert_eq!(session.size(), (80, 24));
}

#[test]
fn writes_reach_the_shell() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    // `cd` proves the bytes were interpreted by the shell, not just echoed.
    session.write_str("cd /tmp && pwd\n").expect("write");
    assert!(
        wait_for_screen(&mut session, "/tmp", Duration::from_secs(20)),
        "shell did not act on input; screen was:\n{}",
        screen_text(&session)
    );
}

/// Poll until some cell matching `ch` satisfies `pred`.
///
/// Waiting on the *attribute* rather than the text matters: the shell echoes
/// the command line, so the letter shows up unstyled in the echo before the
/// real styled output is printed.
fn wait_for_cell(session: &mut PtySession, ch: char, pred: impl Fn(&ekegai_core::StyledChar) -> bool) -> bool {
    let deadline = Instant::now() + Duration::from_secs(20);
    while Instant::now() < deadline {
        for event in session.drain_events() {
            if let SessionEvent::Error(err) = event {
                panic!("session error: {err}");
            }
        }
        let frame = session.snapshot();
        if frame.rows.iter().flatten().any(|c| c.c == ch && pred(c)) {
            return true;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    false
}

#[test]
fn ansi_colour_is_parsed_into_cell_attributes() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    session
        .write_str("printf '\\033[31mRED\\033[0m\\n'\n")
        .expect("write");
    // SGR 31 must become the named red foreground, which only the vte parser
    // can do.
    assert!(
        wait_for_cell(&mut session, 'R', |c| c.fg
            == alacritty_terminal::vte::ansi::Color::Named(
                alacritty_terminal::vte::ansi::NamedColor::Red
            )),
        "no red R cell appeared; screen was:\n{}",
        screen_text(&session)
    );
}

#[test]
fn ansi_text_attributes_are_parsed() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    session
        .write_str("printf '\\033[1mBOLD\\033[0m\\n'\n")
        .expect("write");
    assert!(
        wait_for_cell(&mut session, 'B', |c| c.bold),
        "no bold B cell appeared; screen was:\n{}",
        screen_text(&session)
    );
}

#[test]
fn ansi_truecolor_is_parsed() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    session
        .write_str("printf '\\033[38;2;255;0;0mT\\033[0m\\n'\n")
        .expect("write");
    assert!(
        wait_for_cell(&mut session, 'T', |c| c.fg
            == alacritty_terminal::vte::ansi::Color::Spec(
                alacritty_terminal::vte::ansi::Rgb {
                    r: 255,
                    g: 0,
                    b: 0
                }
            )),
        "no truecolor T cell appeared; screen was:\n{}",
        screen_text(&session)
    );
}

#[test]
fn child_exit_is_reported() {
    let mut session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    session.write_str("exit\n").expect("write");
    let deadline = Instant::now() + Duration::from_secs(20);
    let mut saw_exit = false;
    while Instant::now() < deadline {
        for event in session.drain_events() {
            if let SessionEvent::Exited(status) = event {
                // A clean `exit` reports 0.
                assert_eq!(status, 0);
                saw_exit = true;
            }
        }
        if saw_exit {
            break;
        }
        std::thread::sleep(Duration::from_millis(25));
    }
    assert!(saw_exit, "never observed an Exited event");
}

#[test]
fn dropping_the_session_does_not_hang_or_leak() {
    let session = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn");
    let pid = session.pid().expect("a pid");
    drop(session);
    // Give the OS a moment to reap, then confirm the child is gone.
    let deadline = Instant::now() + Duration::from_secs(10);
    while Instant::now() < deadline {
        if !process_alive(pid) {
            return;
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("child {pid} still alive after PtySession was dropped");
}

fn process_alive(pid: u32) -> bool {
    std::path::Path::new(&format!("/proc/{pid}")).exists()
}

#[test]
fn many_sessions_do_not_interfere() {
    let mut a = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn a");
    let mut b = PtySession::spawn(Some("bash".into()), &cwd(), 80, 24).expect("spawn b");
    a.write_str("echo AAA\n").expect("write a");
    b.write_str("echo BBB\n").expect("write b");
    assert!(wait_for_screen(&mut a, "AAA", Duration::from_secs(20)));
    assert!(wait_for_screen(&mut b, "BBB", Duration::from_secs(20)));
    // Each session shows only its own output.
    assert!(!screen_text(&a).contains("BBB"));
    assert!(!screen_text(&b).contains("AAA"));
}
