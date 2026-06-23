import { useState, useCallback } from "react"
import { colors } from "../colors"
import { usePaneStore } from "../store/panes"
import { useWorkspaceStore, generateWorkspaceId } from "../store/workspaces"
import { useNotificationStore } from "../store/notifications"
import { useInputMode } from "../store/inputMode"

interface Action {
  id: string
  label: string
  description: string
  action: () => void
}

interface CommandPaletteProps {
  onClose: () => void
}

export default function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)

  const actions: Action[] = [
    {
      id: "new-workspace",
      label: "New workspace",
      description: "Create a new workspace",
      action: () => {
        const wsId = generateWorkspaceId()
        const paneId = `pane-${Date.now()}`
        usePaneStore.getState().addPane({
          id: paneId,
          workspaceId: wsId,
          title: "terminal",
          ptyPid: null,
          lines: [],
          status: "idle",
          cwd: process.env.HOME || "/",
          isFocused: false,
        })
        const wsCount = Object.keys(useWorkspaceStore.getState().workspaces).length
        useWorkspaceStore.getState().addWorkspace({
          id: wsId,
          name: `workspace-${wsCount + 1}`,
          cwd: process.env.HOME || "/",
          gitBranch: null,
          listeningPorts: [],
          paneIds: [paneId],
          splitLayout: "vertical",
          hasUnread: false,
        })
        onClose()
      },
    },
    {
      id: "new-pane",
      label: "New pane",
      description: "Add a new terminal pane",
      action: () => {
        const paneId = `pane-${Date.now()}`
        const wsState = useWorkspaceStore.getState()
        const activeWsId = wsState.activeWorkspaceId
        if (!activeWsId) return
        const ws = wsState.workspaces[activeWsId]
        if (!ws) return
        usePaneStore.getState().addPane({
          id: paneId,
          workspaceId: activeWsId,
          title: "terminal",
          ptyPid: null,
          lines: [],
          status: "idle",
          cwd: ws.cwd,
          isFocused: false,
        })
        wsState.addPaneToWorkspace(activeWsId, paneId)
        onClose()
      },
    },
    {
      id: "split-right",
      label: "Split pane right",
      description: "Split the focused pane to the right",
      action: () => {
        const paneId = `pane-${Date.now()}`
        const wsState = useWorkspaceStore.getState()
        const activeWsId = wsState.activeWorkspaceId
        if (!activeWsId) return
        const ws = wsState.workspaces[activeWsId]
        if (!ws) return
        usePaneStore.getState().addPane({
          id: paneId,
          workspaceId: activeWsId,
          title: "terminal",
          ptyPid: null,
          lines: [],
          status: "idle",
          cwd: ws.cwd,
          isFocused: false,
        })
        wsState.addPaneToWorkspace(activeWsId, paneId)
        wsState.setSplitLayout(activeWsId, "vertical")
        onClose()
      },
    },
    {
      id: "split-down",
      label: "Split pane down",
      description: "Split the focused pane downward",
      action: () => {
        const paneId = `pane-${Date.now()}`
        const wsState = useWorkspaceStore.getState()
        const activeWsId = wsState.activeWorkspaceId
        if (!activeWsId) return
        const ws = wsState.workspaces[activeWsId]
        if (!ws) return
        usePaneStore.getState().addPane({
          id: paneId,
          workspaceId: activeWsId,
          title: "terminal",
          ptyPid: null,
          lines: [],
          status: "idle",
          cwd: ws.cwd,
          isFocused: false,
        })
        wsState.addPaneToWorkspace(activeWsId, paneId)
        wsState.setSplitLayout(activeWsId, "horizontal")
        onClose()
      },
    },
    {
      id: "close-pane",
      label: "Close pane",
      description: "Close the focused pane",
      action: () => {
        const paneState = usePaneStore.getState()
        const wsState = useWorkspaceStore.getState()
        const focusedId = paneState.focusedPaneId
        if (!focusedId) return
        const pane = paneState.panes[focusedId]
        if (!pane) return
        wsState.removePaneFromWorkspace(pane.workspaceId, focusedId)
        paneState.removePane(focusedId)
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
    {
      id: "toggle-input-mode",
      label: "Toggle input mode",
      description: "Switch between UI navigation and PTY passthrough (Ctrl+Shift+Z)",
      action: () => {
        useInputMode.getState().toggleMode()
        onClose()
      },
    },
    {
      id: "quit",
      label: "Quit ekegai",
      description: "Exit the application",
      action: () => {
        const renderer = (globalThis as any).__opentui_renderer
        renderer?.destroy()
        process.exit(0)
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
              onClick={() => {
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
