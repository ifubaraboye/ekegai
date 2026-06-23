import { useState, useEffect, useCallback } from "react"
import { colors } from "./colors"
import Sidebar from "./components/Sidebar"
import MainArea from "./components/MainArea"
import StatusBar from "./components/StatusBar"
import CommandPalette from "./components/CommandPalette"
import NotificationPanel from "./components/NotificationPanel"
import TerminalPane from "./components/TerminalPane"
import { useWorkspaceStore, generateWorkspaceId } from "./store/workspaces"
import { usePaneStore } from "./store/panes"
import { useGlobalKeyboard, type GlobalActions } from "./hooks/useKeyboard"
import { useTmuxPreview } from "./hooks/useTmuxPreview"
import { createSession, killSession } from "./tmux/sessions"

function sessionName(workspaceId: string): string {
  return `ekegai-${workspaceId}`
}

export default function App() {
  const [showPalette, setShowPalette] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)

  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const addPane = usePaneStore((s) => s.addPane)

  useEffect(() => {
    const wsId = generateWorkspaceId()
    const paneId = "main"

    addPane({
      id: paneId,
      workspaceId: wsId,
      title: "workspace-1",
      cwd: process.env.HOME || "/",
      isFocused: true,
    })

    addWorkspace({
      id: wsId,
      name: "workspace-1",
      cwd: process.env.HOME || "/",
      paneIds: [paneId],
      hasUnread: false,
    })

    createSession(sessionName(wsId))
    usePaneStore.getState().focusPane(paneId)
  }, [])

  useTmuxPreview()

  const closeWorkspace = useCallback(() => {
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
  }, [])

  const newWorkspace = useCallback(() => {
    const wsId = generateWorkspaceId()
    const paneId = `pane-${Date.now()}`
    usePaneStore.getState().addPane({
      id: paneId,
      workspaceId: wsId,
      title: `workspace-${Object.keys(useWorkspaceStore.getState().workspaces).length + 1}`,
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
  }, [])

  const jumpToWorkspace = useCallback((n: number) => {
    const ws = useWorkspaceStore.getState()
    const ids = Object.keys(ws.workspaces)
    if (n <= ids.length && n > 0) {
      const targetId = ids[n - 1]
      ws.setActive(targetId)
      const target = ws.workspaces[targetId]
      if (target?.paneIds[0]) {
        usePaneStore.getState().focusPane(target.paneIds[0])
      }
    }
  }, [])

  const jumpToUnread = useCallback(() => {
    const ws = useWorkspaceStore.getState()
    const unreadWs = Object.values(ws.workspaces).find((w) => w.hasUnread)
    if (unreadWs) {
      ws.setActive(unreadWs.id)
      if (unreadWs.paneIds[0]) {
        usePaneStore.getState().focusPane(unreadWs.paneIds[0])
      }
      ws.setUnread(unreadWs.id, false)
    }
  }, [])

  const quit = useCallback(() => {
    const renderer = (globalThis as any).__opentui_renderer
    renderer?.destroy()
    process.exit(0)
  }, [])

  const actions: GlobalActions = {
    togglePalette: () => setShowPalette((v) => !v),
    toggleNotifications: () => setShowNotifications((v) => !v),
    newWorkspace,
    closeWorkspace,
    jumpToUnread,
    jumpToWorkspace,
    toggleSidebar: () => setSidebarVisible((v) => !v),
    quit,
  }

  useGlobalKeyboard(actions, showPalette)

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={colors.background}
    >
      <box flexDirection="row" flexGrow={1}>
        {sidebarVisible && <Sidebar />}
        <MainArea>
          <TerminalRenderer />
        </MainArea>
      </box>

      <StatusBar />

      {showPalette && <CommandPalette onClose={() => setShowPalette(false)} />}
      {showNotifications && (
        <NotificationPanel onClose={() => setShowNotifications(false)} />
      )}
    </box>
  )
}

function TerminalRenderer() {
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const ws = activeId ? useWorkspaceStore((s) => s.workspaces[activeId]) : null
  const activePaneId = usePaneStore((s) => s.focusedPaneId)

  if (!ws) {
    return (
      <box
        flexGrow={1}
        alignItems="center"
        justifyContent="center"
        backgroundColor={colors.background}
      >
        <text fg={colors.textMuted}>No workspace selected</text>
      </box>
    )
  }

  return (
    <TerminalPane
      workspaceId={ws.id}
      title={ws.name}
      cwd={ws.cwd}
      isFocused={activePaneId !== null}
    />
  )
}
