import type { ReactNode } from "react"
import { useWorkspaceStore } from "../store/workspaces"
import { colors } from "../colors"

interface MainAreaProps {
  children?: ReactNode
}

export default function MainArea({ children }: MainAreaProps) {
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWs = activeId ? workspaces[activeId] : null

  if (!activeWs || activeWs.paneIds.length === 0) {
    return (
      <box
        flexGrow={1}
        backgroundColor={colors.background}
        padding={1}
      >
        <box flexGrow={1} backgroundColor="#1e2030" alignItems="center" justifyContent="center">
          <text fg={colors.textMuted}>No panes open</text>
        </box>
      </box>
    )
  }

  return (
    <box
      flexGrow={1}
      backgroundColor={colors.background}
      padding={1}
    >
      {children}
    </box>
  )
}
