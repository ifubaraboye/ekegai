import { useKeyboard as useOtuiKeyboard } from "@opentui/react"
import { useInputMode } from "../store/inputMode"
import { usePaneStore } from "../store/panes"
import { writeToPty } from "../pty/registry"

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

function forwardToFocusedPty(sequence: string) {
  const focusedId = usePaneStore.getState().focusedPaneId
  if (focusedId) {
    writeToPty(focusedId, sequence)
  }
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
      forwardToFocusedPty(key.sequence)
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
    if (key.name === "escape") { actions.togglePalette(); return }
    if (key.ctrl && key.name === "q") { actions.quit(); return }

    if (key.meta && key.name in { left: 1, right: 1, up: 1, down: 1 }) {
      actions.focusDirection(key.name as "left" | "right" | "up" | "down")
      return
    }

    if (key.ctrl && /^[1-9]$/.test(key.name)) {
      actions.jumpToWorkspace(parseInt(key.name))
      return
    }

    if (key.ctrl && key.shift && key.name === "z") {
      setMode("pty")
      return
    }

    forwardToFocusedPty(key.sequence)
  })
}
