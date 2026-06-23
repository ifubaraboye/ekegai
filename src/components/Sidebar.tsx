import { useCallback } from "react"
import { useWorkspaceStore, generateWorkspaceId } from "../store/workspaces"
import { usePaneStore } from "../store/panes"
import { colors } from "../colors"
import WorkspaceEntry from "./WorkspaceEntry"
import { createSession } from "../tmux/sessions"

function sessionName(workspaceId: string): string {
  return `ekegai-${workspaceId}`
}

export default function Sidebar() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActive = useWorkspaceStore((s) => s.setActive)
  const focusPane = usePaneStore((s) => s.focusPane)
  const panes = usePaneStore((s) => s.panes)

  const newWorkspace = useCallback(() => {
    const wsId = generateWorkspaceId()
    const paneId = `pane-${Date.now()}`
    usePaneStore.getState().addPane({
      id: paneId,
      workspaceId: wsId,
      title: "terminal",
      cwd: process.env.HOME || "/",
      isFocused: false,
    })
    const wsCount = Object.keys(useWorkspaceStore.getState().workspaces).length
    useWorkspaceStore.getState().addWorkspace({
      id: wsId,
      name: `workspace-${wsCount + 1}`,
      cwd: process.env.HOME || "/",
      paneIds: [paneId],
      hasUnread: false,
    })
    createSession(sessionName(wsId))
    usePaneStore.getState().focusPane(paneId)
    useWorkspaceStore.getState().setActive(wsId)
  }, [])

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
        <text fg={colors.textAccent}>Workspaces</text>
      </box>

      {entries.length === 0 && (
        <text fg={colors.textMuted}>  (empty)</text>
      )}

      {entries.map((ws) => (
        <box
          key={ws.id}
          onMouseDown={() => {
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

      <box paddingX={1} paddingTop={1} onMouseDown={newWorkspace}>
        <text fg={colors.textMuted}>+ new workspace</text>
      </box>
    </box>
  )
}
