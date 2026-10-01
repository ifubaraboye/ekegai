//! A live shell session: PTY + terminal emulator, with no GPUI types.
//!
//! This is the riskiest part of the app, so it lives in `core` and is
//! testable without a window. The GPUI layer only ever sees [`SessionEvent`]s
//! and calls [`PtySession::write`] / [`PtySession::resize`].
//!
//! Design notes:
//! - `alacritty_terminal` 0.26 wants a `Dimensions` *trait* impl, not a struct.
//! - Bytes are pushed through a vte `Processor`, which drives `Term` as the
//!   `Handler`.
//! - All blocking PTY I/O happens on a dedicated thread. The UI thread only
//!   ever touches the shared `Term` behind a short-lived lock.

use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{Receiver, Sender, channel};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use alacritty_terminal::event::VoidListener;
use alacritty_terminal::grid::Dimensions;
use alacritty_terminal::index::{Column, Line, Point};
use alacritty_terminal::term::cell::Cell;
use alacritty_terminal::term::Term;
use alacritty_terminal::vte::ansi::Processor;
use portable_pty::{CommandBuilder, MasterPty, PtySize};

/// How many lines of scrollback to retain.
const SCROLLBACK_LINES: usize = 10_000;
/// Cap on bytes drained from the PTY per wakeup, so a runaway process cannot
/// starve the UI thread.
const MAX_DRAIN_BYTES: usize = 256 * 1024;

/// A rendered row: one `char` plus the styling needed to paint it.
#[derive(Clone, Debug, PartialEq)]
pub struct StyledChar {
    pub c: char,
    pub fg: alacritty_terminal::vte::ansi::Color,
    pub bg: alacritty_terminal::vte::ansi::Color,
    pub bold: bool,
    pub italic: bool,
    pub underline: bool,
    pub dim: bool,
    pub reverse: bool,
}

/// One row of the visible screen.
pub type Row = Vec<StyledChar>;

/// A full frame: rows plus where the cursor is.
#[derive(Clone, Debug, PartialEq)]
pub struct Frame {
    pub rows: Vec<Row>,
    pub cursor: Point,
    pub cursor_visible: bool,
}

/// Things the UI layer needs to hear about.
#[derive(Clone, Debug, PartialEq)]
pub enum SessionEvent {
    /// New frame available; the UI should repaint.
    Frame,
    /// The child exited on its own.
    Exited(i32),
    /// Something went wrong managing the PTY.
    Error(String),
}

#[derive(Clone, Copy)]
struct Dims {
    total: usize,
    screen: usize,
    cols: usize,
}

impl Dimensions for Dims {
    fn total_lines(&self) -> usize {
        self.total
    }
    fn screen_lines(&self) -> usize {
        self.screen
    }
    fn columns(&self) -> usize {
        self.cols
    }
}

type SharedTerm = Arc<Mutex<Term<VoidListener>>>;

struct TermHandle {
    term: SharedTerm,
    dims: Mutex<Dims>,
}

impl TermHandle {
    fn snapshot(&self) -> Frame {
        let dims = self.dims.lock().expect("dims poisoned");
        let term = self.term.lock().expect("term poisoned");
        let grid = term.grid();

        let mut rows = Vec::with_capacity(dims.screen);
        for row_idx in 0..dims.screen {
            let line = &grid[Line(row_idx as i32)];
            let mut row: Row = Vec::with_capacity(dims.cols);
            for col_idx in 0..dims.cols {
                let cell: &Cell = &line[Column(col_idx)];
                let flags = cell.flags;
                row.push(StyledChar {
                    c: cell.c,
                    fg: cell.fg,
                    bg: cell.bg,
                    bold: flags.contains(alacritty_terminal::term::cell::Flags::BOLD),
                    italic: flags
                        .contains(alacritty_terminal::term::cell::Flags::ITALIC),
                    underline: flags
                        .contains(alacritty_terminal::term::cell::Flags::UNDERLINE),
                    dim: flags.contains(alacritty_terminal::term::cell::Flags::DIM),
                    reverse: flags
                        .contains(alacritty_terminal::term::cell::Flags::INVERSE),
                });
            }
            rows.push(row);
        }

        Frame {
            rows,
            cursor: grid.cursor.point,
            cursor_visible: term.mode().contains(alacritty_terminal::term::TermMode::SHOW_CURSOR),
        }
    }
}

/// A running shell attached to a PTY.
pub struct PtySession {
    master: Box<dyn MasterPty + Send>,
    /// `take_writer` may only be called once, so the writer is held for the
    /// session's lifetime rather than re-acquired per write.
    writer: Box<dyn Write + Send>,
    pid: Option<u32>,
    handle: Arc<TermHandle>,
    events: Receiver<SessionEvent>,
    /// Read side, owned by the reader thread.
    _reader: Option<JoinHandle<()>>,
    closed: Arc<AtomicBool>,
    cols: usize,
    rows: usize,
}

impl PtySession {
    /// Spawn `shell` in `cwd` and start pumping output.
    pub fn spawn(
        shell: Option<String>,
        cwd: &Path,
        cols: u16,
        rows: u16,
    ) -> anyhow::Result<Self> {
        let pty_system = portable_pty::native_pty_system();
        let pair = pty_system.openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let shell = shell
            .or_else(|| std::env::var("SHELL").ok())
            .unwrap_or_else(|| "/bin/sh".to_string());

        let mut cmd = CommandBuilder::new(&shell);
        // Match what the TypeScript version set, so existing rc files and
        // prompt tooling behave the same.
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.cwd(cwd);

        let mut child = pair.slave.spawn_command(cmd)?;
        drop(pair.slave);

        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;

        let dims = Dims {
            total: SCROLLBACK_LINES,
            screen: rows as usize,
            cols: cols as usize,
        };
        let term = Term::new(
            alacritty_terminal::term::Config {
                scrolling_history: SCROLLBACK_LINES,
                ..Default::default()
            },
            &dims,
            VoidListener,
        );

        let handle = Arc::new(TermHandle {
            term: Arc::new(Mutex::new(term)),
            dims: Mutex::new(dims),
        });

        let (tx, rx) = channel::<SessionEvent>();

        let pid = child.process_id();

        // Reader thread: PTY bytes -> vte parser -> shared Term.
        let reader_handle = {
            let handle = Arc::clone(&handle);
            let tx = tx.clone();
            std::thread::Builder::new()
                .name("ekegai-pty-reader".into())
                .spawn(move || {
                    let mut parser: Processor = Processor::new();
                    let mut buf = [0u8; 8192];
                    loop {
                        match reader.read(&mut buf) {
                            Ok(0) => {
                                let _ = tx.send(SessionEvent::Exited(0));
                                break;
                            }
                            Ok(n) => {
                                {
                                    let mut term = handle.term.lock().expect("term poisoned");
                                    parser.advance(&mut *term, &buf[..n]);
                                }
                                if tx.send(SessionEvent::Frame).is_err() {
                                    break;
                                }
                            }
                            Err(_) => {
                                let _ = tx.send(SessionEvent::Exited(1));
                                break;
                            }
                        }
                    }
                })?
        };

        // Reaper thread: `Child::wait` blocks, so the child lives here. The
        // session keeps only a killer, which is how `Drop` interrupts it.
        // Without this, a shell that exits leaves the UI showing a live pane.
        let closed = Arc::new(AtomicBool::new(false));
        {
            let closed_flag = Arc::clone(&closed);
            let killer = child.clone_killer();
            let tx = tx.clone();
            std::thread::Builder::new()
                .name("ekegai-pty-reap".into())
                .spawn(move || {
                    let status = child.wait();
                    if closed_flag.load(Ordering::Relaxed) {
                        let mut killer = killer;
                        let _ = killer.kill();
                        return;
                    }
                    match status {
                        Ok(status) => {
                            let _ = tx.send(SessionEvent::Exited(exit_code(status)));
                        }
                        Err(err) => {
                            let _ = tx.send(SessionEvent::Error(err.to_string()));
                        }
                    }
                })?;
        }

        Ok(Self {
            master: pair.master,
            writer,
            pid,
            handle,
            events: rx,
            _reader: Some(reader_handle),
            closed,
            cols: cols as usize,
            rows: rows as usize,
        })
    }

    /// Take any pending events without blocking. The UI calls this when
    /// GPUI asks for a repaint.
    pub fn drain_events(&mut self) -> Vec<SessionEvent> {
        let mut out = Vec::new();
        let mut budget = MAX_DRAIN_BYTES;
        while budget > 0 {
            match self.events.try_recv() {
                Ok(event) => {
                    let stop = matches!(event, SessionEvent::Exited(_));
                    out.push(event);
                    if stop {
                        break;
                    }
                    budget -= 1;
                }
                Err(_) => break,
            }
        }
        out
    }

    /// Block until at least one event is available, for use off the UI thread.
    pub fn next_event(&self) -> Option<SessionEvent> {
        self.events.recv().ok()
    }

    /// Render the current screen.
    pub fn snapshot(&self) -> Frame {
        self.handle.snapshot()
    }

    pub fn write(&mut self, bytes: &[u8]) -> anyhow::Result<()> {
        self.writer.write_all(bytes)?;
        self.writer.flush()?;
        Ok(())
    }

    /// Convenience for keystrokes that need no translation.
    pub fn write_str(&mut self, s: &str) -> anyhow::Result<()> {
        self.write(s.as_bytes())
    }

    /// Report the new size in cells. No-op if unchanged, so we do not spam the
    /// child process with SIGWINCH on every layout pass.
    pub fn resize(&mut self, cols: u16, rows: u16) -> anyhow::Result<()> {
        if cols as usize == self.cols && rows as usize == self.rows {
            return Ok(());
        }
        self.cols = cols as usize;
        self.rows = rows as usize;

        // The emulator's own grid must be resized, not just our copy of the
        // dimensions -- otherwise `snapshot` reads out of bounds.
        {
            let mut dims = self.handle.dims.lock().expect("dims poisoned");
            dims.cols = self.cols;
            dims.screen = self.rows;
            dims.total = SCROLLBACK_LINES;
            let snapshot = dims.clone();
            let mut term = self.handle.term.lock().expect("term poisoned");
            term.resize(snapshot);
        }

        self.master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })?;
        // Ask the child to redraw at the new size. XTWINOPS is widely ignored;
        // the cursor-position nudge makes the shell repaint regardless.
        self.write(b"\x1b[8;0;0t")?;
        self.write(format!("\x1b[{};{}H", self.rows, self.cols).as_bytes())?;
        Ok(())
    }

    pub fn size(&self) -> (usize, usize) {
        (self.cols, self.rows)
    }

    pub fn pid(&self) -> Option<u32> {
        self.pid
    }
}

fn exit_code(status: portable_pty::ExitStatus) -> i32 {
    status.exit_code() as i32
}

impl Drop for PtySession {
    fn drop(&mut self) {
        // Signals the reaper thread, which owns the `Child` and does the kill.
        self.closed.store(true, Ordering::Relaxed);
    }
}

/// Convenience for tests and the "run one command" path.
pub fn run_command(cmd: &str, cwd: &Path, cols: u16, rows: u16) -> anyhow::Result<String> {
    let pty_system = portable_pty::native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;
    let mut builder = CommandBuilder::new("bash");
    builder.args(["-lc", cmd]);
    builder.cwd(cwd);
    let mut child = pair.slave.spawn_command(builder)?;
    drop(pair.slave);

    let mut reader = pair.master.try_clone_reader()?;
    let mut writer = pair.master.take_writer()?;
    writer.write_all(b"exit\n")?;
    writer.flush()?;

    let dims = Dims {
        total: 1000,
        screen: rows as usize,
        cols: cols as usize,
    };
    let mut term = Term::new(
        alacritty_terminal::term::Config::default(),
        &dims,
        VoidListener,
    );
    let mut parser: Processor = Processor::new();

    let mut out = Vec::new();
    let mut buf = [0u8; 4096];
    let deadline = std::time::Instant::now() + Duration::from_secs(15);
    while std::time::Instant::now() < deadline {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                out.extend_from_slice(&buf[..n]);
                parser.advance(&mut term, &buf[..n]);
                if child.try_wait()?.is_some() {
                    // Drain whatever is left after the child is gone.
                    while let Ok(n) = reader.read(&mut buf) {
                        if n == 0 {
                            break;
                        }
                        out.extend_from_slice(&buf[..n]);
                        parser.advance(&mut term, &buf[..n]);
                    }
                    break;
                }
            }
            Err(_) => break,
        }
    }
    let _ = child.kill();
    Ok(String::from_utf8_lossy(&out).to_string())
}

/// Waker used by the GPUI layer to learn that a repaint is needed without
/// polling. The reader thread pushes into a channel; the UI drains it.
pub fn notifier() -> (Sender<SessionEvent>, Receiver<SessionEvent>) {
    channel()
}
