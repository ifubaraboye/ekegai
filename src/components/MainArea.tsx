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
  const layout = activeWs?.splitLayout ?? "vertical"

  const hasPanes = activeWs ? activeWs.paneIds.length > 0 : false

  if (!hasPanes) {
    return (
      <box
        flexGrow={1}
        backgroundColor={colors.background}
        flexDirection="row"
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
      flexDirection={layout === "horizontal" ? "column" : "row"}
      padding={1}
      gap={1}
    >
      {children}
    </box>
  )
}
