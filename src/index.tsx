import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import { ensureConfigDir, saveSession } from "./persist/session"
import App from "./App"
import { useWorkspaceStore } from "./store/workspaces"
import { usePaneStore } from "./store/panes"

await ensureConfigDir()

const renderer = await createCliRenderer({
  exitOnCtrlC: false,
})

;(globalThis as any).__opentui_renderer = renderer

async function onExit() {
  const ws = useWorkspaceStore.getState().workspaces
  const panes = usePaneStore.getState().panes
  await saveSession(ws, panes)
  renderer.destroy()
}

process.on("SIGINT", () => {
  onExit().then(() => process.exit(0))
})

process.on("SIGTERM", () => {
  onExit().then(() => process.exit(0))
})

renderer.on("destroy", async () => {
  const ws = useWorkspaceStore.getState().workspaces
  const panes = usePaneStore.getState().panes
  await saveSession(ws, panes)
})

createRoot(renderer).render(<App />)
