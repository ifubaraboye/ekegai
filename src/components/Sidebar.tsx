import { useWorkspaceStore } from "../store/workspaces"
import { usePaneStore } from "../store/panes"
import { colors } from "../colors"
import WorkspaceEntry from "./WorkspaceEntry"

interface SidebarProps {
  focusedIndex: number
}

export default function Sidebar({ focusedIndex }: SidebarProps) {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActive = useWorkspaceStore((s) => s.setActive)
  const focusPane = usePaneStore((s) => s.focusPane)
  const panes = usePaneStore((s) => s.panes)

  const entries = Object.values(workspaces)

  return (
    <box
      width={20}
      flexShrink={0}
      backgroundColor={colors.sidebarBg}
      flexDirection="column"
      paddingY={1}
    >
      <box paddingX={1} paddingBottom={1}>
        <text fg={colors.textAccent} bold>Workspaces</text>
      </box>

      {entries.length === 0 && (
        <text fg={colors.textMuted}>  (empty)</text>
      )}

      {entries.map((ws, i) => (
        <box key={ws.id}>
          <WorkspaceEntry
            workspace={ws}
            isActive={ws.id === activeId}
            isFocused={i === focusedIndex}
          />
        </box>
      ))}

      <box paddingX={1} paddingTop={1}>
        <text fg={colors.textMuted}>+ new workspace</text>
      </box>
    </box>
  )
}
