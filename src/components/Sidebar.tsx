import { useWorkspaceStore } from "../store/workspaces"
import { usePaneStore } from "../store/panes"
import { colors } from "../colors"
import WorkspaceEntry from "./WorkspaceEntry"

export default function Sidebar() {
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

      {entries.map((ws) => (
        <box
          key={ws.id}
          onClick={() => {
            setActive(ws.id)
            const firstPane = ws.paneIds[0]
            if (firstPane && panes[firstPane]) {
              focusPane(firstPane)
            }
          }}
        >
          <WorkspaceEntry
            workspace={ws}
            isActive={ws.id === activeId}
          />
        </box>
      ))}

      <box paddingX={1} paddingTop={1}>
        <text fg={colors.textMuted}>+ new workspace</text>
      </box>
    </box>
  )
}
