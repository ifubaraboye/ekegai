# ekegai (Rust)

A native rewrite of [ekegai](../) in Rust and GPUI.

## Why a rewrite

The TypeScript versions were three divergent experiments that never converged:

| Branch | Shape | Status |
| --- | --- | --- |
| `main` | Electron desktop, node-graph canvas, **only branch with agent code** | dead since 2026-04-17 |
| `opentui-port` | TUI via OpenTUI + `node-pty`, agent code dropped | experimental |
| `ekegai-tui` | TUI via tmux backend, agent code dropped | experimental |

GPUI gives a real native window, GPU-composited rendering, and proper OS
integration (window management, accessibility, IME) that a terminal UI cannot.

## The one semantic worth keeping

From the old `workflowStore.ts`: an agent is configured **per terminal node**,
and running it streams provider output into that node's own PTY. The agent is
visible in the terminal it orchestrates, not in a separate chat pane. Edges
between nodes express "this feeds that", and `Graph::downstream_of` walks them.

## On Waku

The sidebar design is informed by [egoist/waku](https://github.com/egoist/waku)
— date-grouped sessions, collapsible project groups with a guide rail, a
virtualized row list, light/dark themes.

**No Waku code is used.** Waku is `GPL-3.0-only`; ekegai is MIT. Concretely,
copying it was not an option anyway:

- `src/app/sidebar.rs` is 2,637 lines of `impl Waku` methods against Waku's
  root entity, calling `waku_client::WorkspaceClient` and rendering `waku-core`
  domain types. It is a view of Waku's daemon state, not a reusable widget.
- Waku is a binary-only crate with a private `mod sidebar`, not published to
  crates.io, so there is nothing to depend on.
- Waku pins GPUI to its own fork (`egoist/zed`, branch `waku-webview`). We pin
  upstream, so Waku's code would not compile here regardless.

What is borrowed is the *design language*, reimplemented in `ekegai-desktop`.

## Layout

```
crates/
  ekegai-core/      domain model, PTY, session store, secrets. No GPUI.
  ekegai-desktop/   GPUI app (binary: ekegai)
```

`ekegai-core` holds the risky code — spawning shells and parsing terminal
output — so it is testable without a window. See `crates/ekegai-core/tests/`.

## GPUI pin

Upstream `zed-industries/zed` at rev `7733b9922665f103abda7c6a3fde6b9dfdc8eba9`,
declared once in the workspace `Cargo.toml`.

## Secrets

The TypeScript version stored `apiKey` inline in `AgentConfig`, and its
`serialize()` spread the whole object — so every workflow save wrote the key in
cleartext to a user-chosen file.

Here, `AgentConfig` holds only a `secret_ref`. The material lives in the OS
keyring behind the `keyring` feature, which is **off by default**: without it,
`secrets::store` returns an error rather than falling back to plaintext. Build
with `--features keyring` once agent support lands.

## Building

```sh
cargo build -p ekegai-core          # domain + PTY, no GPUI needed
cargo test  -p ekegai-core          # unit + real-PTY integration tests
cargo build -p ekegai-desktop       # needs GPUI
```

Linux build requirements are the usual GPUI set: Wayland and/or X11,
`libxkbcommon`, and a Vulkan-capable driver. Verified on Omarchy with an Intel
CometLake-U iGPU (Mesa Vulkan).

## Status

- [x] **M0** GPUI compiles and renders on this machine (reference app verified)
- [x] **M1a** PTY + terminal emulation, 20 tests green
- [x] **M1b** GPUI terminal view: grid rendered with ANSI styling, keystroke
      translation, resize, event-driven repaint. 52 tests, clippy clean.
- [ ] **M2** Waku-style sidebar
- [ ] **M3** Multi-pane + persistence wired to the UI
- [ ] **M4** Agent orchestration (providers, graph, keyring)
- [ ] **M5** Production gates: packaging

### What is verified, and how

Verified by **running** it: the app opens a window, spawns the user's shell,
renders the prompt and status bar, and sizes the grid to the window. The PTY
round-trip is proven by integration tests that spawn real shells and assert on
the rendered grid, including ANSI colour, truecolor, bold, exit codes, and
process cleanup on drop.

Verified by **test only**: a live keystroke travelling through the compositor
into `on_key_down` and out to the PTY. The translation half is tested with real
`gpui::Keystroke` values, but driving a Wayland window for the full path was
not reliable here, so that last hop is unproven.

Known gaps in M1b:

- No scrollback view, selection, or copy/paste. `alacritty_terminal` keeps the
  history; nothing reads it yet.
- Underline is parsed but not painted (`TextRun.underline` is always `None`).
- The window opens fullscreen; the requested 900x620 bounds are not honoured
  on this compositor.
- One shell per window. No panes, no sidebar yet.
