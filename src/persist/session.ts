import type { Workspace } from "../store/workspaces"
import type { Pane } from "../store/panes"

const CONFIG_DIR = `${process.env.HOME || "/tmp"}/.config/ekegai`
const SESSION_PATH = `${CONFIG_DIR}/session.json`
const CONFIG_PATH = `${CONFIG_DIR}/config.json`

interface SessionData {
  workspaces: Workspace[]
  panes: (Omit<Pane, "lines"> & { lines: [] })[]
}

interface UserConfig {
  shell?: string
  colorOverrides?: Record<string, string>
  keybindOverrides?: Record<string, string>
}

export async function saveSession(
  workspaces: Record<string, Workspace>,
  panes: Record<string, Pane>,
): Promise<void> {
  const payload: SessionData = {
    workspaces: Object.values(workspaces),
    panes: Object.values(panes).map((p) => ({
      ...p,
      lines: [],
    })),
  }

  await Bun.write(Bun.file(SESSION_PATH), JSON.stringify(payload, null, 2))
}

export async function loadSession(): Promise<SessionData | null> {
  try {
    const f = Bun.file(SESSION_PATH)
    const exists = await f.exists()
    if (!exists) return null
    const text = await f.text()
    return JSON.parse(text) as SessionData
  } catch {
    return null
  }
}

export async function saveConfig(config: UserConfig): Promise<void> {
  await Bun.write(Bun.file(CONFIG_PATH), JSON.stringify(config, null, 2))
}

export async function loadConfig(): Promise<UserConfig | null> {
  try {
    const f = Bun.file(CONFIG_PATH)
    const exists = await f.exists()
    if (!exists) return null
    const text = await f.text()
    return JSON.parse(text) as UserConfig
  } catch {
    return null
  }
}

export async function ensureConfigDir(): Promise<void> {
  await Bun.write(Bun.file(`${CONFIG_DIR}/.keep`), "")
}
