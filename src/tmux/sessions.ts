import { execSync, spawn } from "child_process"

export function createSession(name: string, cwd?: string, width = 80, height = 24): boolean {
  try {
    const cmd = cwd
      ? `tmux new-session -d -s "${name}" -c "${cwd}" -x ${width} -y ${height}`
      : `tmux new-session -d -s "${name}" -x ${width} -y ${height}`
    execSync(cmd, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export function killSession(name: string): boolean {
  try {
    execSync(`tmux kill-session -t "${name}"`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export function sessionExists(name: string): boolean {
  try {
    execSync(`tmux has-session -t "${name}"`, { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

export interface TmuxSessionInfo {
  name: string
  created: number
}

export function listSessions(): TmuxSessionInfo[] {
  try {
    const out = execSync('tmux list-sessions -F "#{session_name}"', { encoding: "utf8" })
    return out.trim().split("\n").filter(Boolean).map((name: string) => ({
      name,
      created: Date.now(),
    }))
  } catch {
    return []
  }
}

export function capturePane(sessionName: string, lines = 50): string {
  try {
    const out = execSync(
      `tmux capture-pane -t "${sessionName}" -p -S -${lines} -J`,
      { encoding: "utf8" },
    )
    return out
  } catch {
    return ""
  }
}

const TMUX_SPECIAL_KEYS: Record<string, string> = {
  return: "Enter",
  tab: "Tab",
  backspace: "BSpace",
  escape: "Escape",
  space: "Space",
  delete: "Delete",
  up: "Up",
  down: "Down",
  left: "Left",
  right: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  insert: "Insert",
}

export function sendKeys(
  sessionName: string,
  key: { name: string; ctrl?: boolean; alt?: boolean; shift?: boolean },
): void {
  let tmuxKey: string

  if (key.ctrl) {
    tmuxKey = `C-${key.name.toLowerCase()}`
  } else if (key.alt) {
    const base = key.name in TMUX_SPECIAL_KEYS ? TMUX_SPECIAL_KEYS[key.name] : key.name
    tmuxKey = `M-${base}`
  } else if (key.name in TMUX_SPECIAL_KEYS) {
    tmuxKey = TMUX_SPECIAL_KEYS[key.name]
  } else if (key.name.length === 1) {
    tmuxKey = key.shift ? key.name.toUpperCase() : key.name
  } else {
    tmuxKey = key.name
  }

  try {
    spawn("tmux", ["send-keys", "-t", sessionName, "--", tmuxKey], {
      stdio: "ignore",
      detached: true,
    }).unref()
  } catch {
    // silently fail
  }
}

export function resizeSession(sessionName: string, width: number, height: number): void {
  try {
    execSync(
      `tmux resize-window -t "${sessionName}" -x ${width} -y ${height}`,
      { stdio: "ignore" },
    )
  } catch {
    // silently fail
  }
}
