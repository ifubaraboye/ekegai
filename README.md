# ekegai

A modern desktop application that combines a node-based workflow canvas with real OS terminals. Built with Electron, React, and TypeScript.

## Features

- **Node-Based Workflow Canvas** — Visual workflow orchestration using @xyflow/react
- **Real OS Terminals** — Each node contains a fully functional terminal powered by node-pty and xterm.js
- **Niri-Style Terminal Tiling** — Horizontal scrolling tile layout for multiple terminals
- **Multiple Projects** — Open and manage multiple project directories simultaneously
- **VS Code-Style Sidebar** — Collapsible sidebar with collapsible project groups
- **IDE Integration** — Right-click or use the IDE button to open projects in your preferred editor (VS Code, Zed, Cursor, or custom)
- **Terminal Persistence** — Sessions auto-save every 30 seconds and on system suspend/lock/quit
- **Dark Mode** — Built with a warm, Cursor-inspired dark theme

## Tech Stack

- **Framework:** Electron + electron-vite
- **Frontend:** React 19 + TypeScript
- **Terminal:** node-pty + @xterm/xterm
- **Workflow Canvas:** @xyflow/react
- **State Management:** Zustand
- **Styling:** TailwindCSS + custom CSS

Note: ekegai only supports **Linux** and **macOS**. Windows is not supported.

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Linux or macOS (Windows is NOT supported)

### Installation

```bash
# Clone the repository
git clone https://github.com/ekegai/ekegai.git
cd ekegai

# Install dependencies
npm install
```

### Development

```bash
# Start development server
npm run dev
```

### Build

```bash
# Build for current platform
npm run build

# Package for Linux
npm run build:linux

# Package for macOS
npm run build:mac

# Package for Windows (NOT SUPPORTED)
# Windows is not supported. Only Linux and macOS.
```

The packaged app will be in the `release/` folder.

## Usage

1. **Open a Project** — Click the + button in the sidebar or use "Open project" to add a project folder
2. **Add Terminals** — Click the + button next to a project to spawn a new terminal in that directory
3. **Switch Between Terminals** — Click on terminal tiles or use the sidebar to navigate
4. **Open in IDE** — Click the code icon (</>) on any project row to open it in your preferred IDE
5. **Collapse Sidebar** — Use the collapse button to maximize terminal space

## Terminal Persistence

ekegai automatically saves your terminal sessions:

- Every 30 seconds (autosave)
- On system suspend (lid close)
- On screen lock
- On app quit

On restart, terminals are automatically restored with their working directories and last 500 lines of scrollback.

## Keyboard Shortcuts

- **Enter/Space** on project row — Expand/collapse project
- **Enter/Space** on terminal row — Focus terminal

## Limitations

The terminal does **not** fully restore to its original state upon quitting. On quit, the terminal session ends and the shell exits. Scrollback history and running processes are not restored.

## Configuration

### Custom IDEs

Add custom IDEs via the IDE context menu:

1. Click the code icon (</>) on any project
2. Click "Add IDE..."
3. Enter the IDE name and command (e.g., `nvim` for Neovim)

### Environment

The app inherits environment variables from the parent process and adds:

- `TERM=xterm-256color`
- `COLORTERM=truecolor`

## License

MIT
