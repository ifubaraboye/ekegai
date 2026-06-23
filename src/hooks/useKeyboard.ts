import { useKeyboard as useOtuiKeyboard } from "@opentui/react"
import { useInputMode } from "../store/inputMode"
import { usePaneStore } from "../store/panes"

export interface GlobalActions {
  togglePalette: () => void
  toggleNotifications: () => void
  newWorkspace: () => void
  closePane: () => void
  closeWorkspace: () => void
  splitRight: () => void
  splitDown: () => void
  jumpToUnread: () => void
  focusDirection: (dir: "left" | "right" | "up" | "down") => void
  jumpToWorkspace: (n: number) => void
  toggleSidebar: () => void
  renamePane: () => void
  quit: () => void
}

export function useGlobalKeyboard(actions: GlobalActions) {
  const setMode = useInputMode((s) => s.setMode)
  const mode = useInputMode((s) => s.mode)

  useOtuiKeyboard((key) => {
    if (mode === "pty") {
      if (key.ctrl && key.shift && key.name === "z") {
        setMode("ui")
        return
      }
      const focusedId = usePaneStore.getState().focusedPaneId
      if (focusedId) {
        const pane = usePaneStore.getState().panes[focusedId]
        if (pane?.ptyPid) {
          usePaneStore.getState().setStatus(focusedId, "running")
        }
      }
      return
    }

    if (key.ctrl && key.name === "p") { actions.togglePalette(); return }
    if (key.ctrl && key.name === "i") { actions.toggleNotifications(); return }
    if (key.ctrl && key.shift && key.name === "u") { actions.jumpToUnread(); return }
    if (key.ctrl && key.name === "n") { actions.newWorkspace(); return }
    if (key.ctrl && key.name === "w") { actions.closePane(); return }
    if (key.ctrl && key.shift && key.name === "w") { actions.closeWorkspace(); return }
    if (key.ctrl && key.name === "d") { actions.splitRight(); return }
    if (key.ctrl && key.shift && key.name === "d") { actions.splitDown(); return }
    if (key.ctrl && key.name === "b") { actions.toggleSidebar(); return }
    if (key.ctrl && key.name === "r") { actions.renamePane(); return }
    if (key.name === "q" && !key.ctrl) { actions.quit(); return }
    if (key.name === "escape") { actions.togglePalette(); return }

    if (key.meta) {
      const dirMap: Record<string, "left" | "right" | "up" | "down"> = {
        left: "left", right: "right", up: "up", down: "down",
      }
      if (key.name in dirMap) {
        actions.focusDirection(dirMap[key.name])
        return
      }
    }

    if (key.ctrl && /^[1-9]$/.test(key.name)) {
      actions.jumpToWorkspace(parseInt(key.name))
      return
    }
  })
}
