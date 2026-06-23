import { useState, useCallback } from "react"
import { colors } from "../colors"
import { usePaneStore } from "../store/panes"
import { useWorkspaceStore, generateWorkspaceId } from "../store/workspaces"
import { useNotificationStore } from "../store/notifications"
import { createSession, killSession } from "../tmux/sessions"

interface Action {
  id: string
  label: string
  description: string
  action: () => void
}

interface CommandPaletteProps {
  onClose: () => void
}

function sessionName(workspaceId: string): string {
  return `ekegai-${workspaceId}`
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const actions: Action[] = [
    {
      id: "new-workspace",
      label: "New workspace",
      description: "Create a new tmux workspace",
      action: () => {
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
        onClose()
      },
    },
    {
      id: "close-workspace",
      label: "Close workspace",
      description: "Kill the tmux session for the active workspace",
      action: () => {
        const ws = useWorkspaceStore.getState()
        const id = ws.activeWorkspaceId
        if (!id) return
        const workspace = ws.workspaces[id]
        if (!workspace) return
        for (const pid of workspace.paneIds) {
          usePaneStore.getState().removePane(pid)
        }
        killSession(sessionName(id))
        ws.removeWorkspace(id)
        onClose()
      },
    },
    {
      id: "mark-all-read",
      label: "Mark all notifications read",
      description: "Clear all unread notification badges",
      action: () => {
        useNotificationStore.getState().markAllRead()
        onClose()
      },
    },
  ]

  const filtered = query
    ? actions.filter(
        (a) =>
          a.label.toLowerCase().includes(query.toLowerCase()) ||
          a.description.toLowerCase().includes(query.toLowerCase()),
      )
    : actions

  const handleSubmit = useCallback(() => {
    if (filtered[selectedIndex]) {
      filtered[selectedIndex].action()
    }
  }, [filtered, selectedIndex])

  const handleInput = useCallback((val: string) => {
    setQuery(val)
    setSelectedIndex(0)
  }, [])

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      backgroundColor="rgba(0,0,0,0.7)"
    >
      <box
        width="50%"
        height="40%"
        flexDirection="column"
        backgroundColor={colors.sidebarBg}
        borderStyle="single"
        borderColor={colors.borderFocused}
      >
        <box paddingX={1} paddingY={0}>
          <input
            placeholder="Type a command..."
            value={query}
            onInput={handleInput}
            onSubmit={handleSubmit}
          />
        </box>
        <scrollbox>
          {filtered.map((action, i) => (
            <box
              key={action.id}
              paddingX={1}
              backgroundColor={i === selectedIndex ? colors.activeItemBg : "transparent"}
              onMouseDown={() => {
                setSelectedIndex(i)
                action.action()
              }}
            >
              <text fg={colors.textPrimary}>
                {i === selectedIndex ? "▸ " : "  "}
                {action.label}
              </text>
              <text fg={colors.textMuted}> {action.description}</text>
            </box>
          ))}
        </scrollbox>
      </box>
    </box>
  )
}
