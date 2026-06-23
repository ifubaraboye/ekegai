import { useKeyboard as useOtuiKeyboard } from "@opentui/react"
import { useWorkspaceStore } from "../store/workspaces"
import { sendKeys } from "../tmux/sessions"

export interface GlobalActions {
  togglePalette: () => void
  toggleNotifications: () => void
  newWorkspace: () => void
  closeWorkspace: () => void
  jumpToUnread: () => void
  jumpToWorkspace: (n: number) => void
  toggleSidebar: () => void
  quit: () => void
}

function sessionName(workspaceId: string): string {
  return `ekegai-${workspaceId}`
}

export function useGlobalKeyboard(actions: GlobalActions, paletteOpen: boolean) {
  useOtuiKeyboard((key) => {
    if (paletteOpen) return

    if (key.ctrl && key.name === "p") { actions.togglePalette(); return }
    if (key.ctrl && key.name === "i") { actions.toggleNotifications(); return }
    if (key.ctrl && key.shift && key.name === "u") { actions.jumpToUnread(); return }
    if (key.ctrl && key.name === "n") { actions.newWorkspace(); return }
    if (key.ctrl && key.name === "w") { actions.closeWorkspace(); return }
    if (key.ctrl && key.name === "b") { actions.toggleSidebar(); return }
    if (key.name === "q" && !key.ctrl) { actions.quit(); return }
    if (key.name === "escape") { actions.togglePalette(); return }

    if (key.ctrl && /^[1-9]$/.test(key.name)) {
      actions.jumpToWorkspace(parseInt(key.name))
      return
    }

    if (key.ctrl && key.name === "j") {
      const ws = useWorkspaceStore.getState()
      const ids = Object.keys(ws.workspaces)
      const idx = ids.indexOf(ws.activeWorkspaceId ?? "")
      if (idx < ids.length - 1) {
        const next = ids[idx + 1]
        ws.setActive(next)
      }
      return
    }

    if (key.ctrl && key.name === "k") {
      const ws = useWorkspaceStore.getState()
      const ids = Object.keys(ws.workspaces)
      const idx = ids.indexOf(ws.activeWorkspaceId ?? "")
      if (idx > 0) {
        const prev = ids[idx - 1]
        ws.setActive(prev)
      }
      return
    }

    const wsId = useWorkspaceStore.getState().activeWorkspaceId
    if (wsId) {
      sendKeys(sessionName(wsId), key)
    }
  })
}
