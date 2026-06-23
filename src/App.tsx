import { useState, useEffect, useCallback } from "react"
import { useOnResize } from "@opentui/react"
import { colors } from "./colors"
import Sidebar from "./components/Sidebar"
import MainArea from "./components/MainArea"
import StatusBar from "./components/StatusBar"
import CommandPalette from "./components/CommandPalette"
import NotificationPanel from "./components/NotificationPanel"
import { useWorkspaceStore, generateWorkspaceId } from "./store/workspaces"
import { usePaneStore } from "./store/panes"
import { useNotificationStore } from "./store/notifications"
import { usePtyOutput } from "./hooks/usePtyOutput"
import { useGlobalKeyboard, type GlobalActions } from "./hooks/useKeyboard"
import { useInputMode } from "./store/inputMode"
import PtyPane from "./components/PtyPane"
import { resizeAll } from "./pty/registry"

function PtyHost({ paneId }: { paneId: string }) {
  const pane = usePaneStore((s) => s.panes[paneId])
  usePtyOutput({ paneId, cwd: process.env.HOME || "/" })
  if (!pane) return null
  return <PtyPane paneId={paneId} />
}

function PaneRenderer() {
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeWs = activeId ? workspaces[activeId] : null
  const paneIds = activeWs?.paneIds ?? []

  return (
    <>
      {paneIds.map((pid) => (
        <PtyHost key={pid} paneId={pid} />
      ))}
    </>
  )
}

export default function App() {
  const [showPalette, setShowPalette] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [sidebarVisible, setSidebarVisible] = useState(true)
  const [sidebarIndex, setSidebarIndex] = useState(-1)
  const [notificationIndex, setNotificationIndex] = useState(0)
  const mode = useInputMode((s) => s.mode)

  const addWorkspace = useWorkspaceStore((s) => s.addWorkspace)
  const addPane = usePaneStore((s) => s.addPane)

  useEffect(() => {
    const wsId = generateWorkspaceId()
    const paneId = "main"

    addPane({
      id: paneId,
      workspaceId: wsId,
      title: "terminal",
      ptyPid: null,
      lines: [],
      status: "idle",
      cwd: process.env.HOME || "/",
      isFocused: true,
    })

    addWorkspace({
      id: wsId,
      name: "workspace-1",
      cwd: process.env.HOME || "/",
      gitBranch: null,
      listeningPorts: [],
      paneIds: [paneId],
      splitLayout: "vertical",
      hasUnread: false,
    })

    usePaneStore.getState().focusPane(paneId)
  }, [])

  useOnResize((width, height) => {
    const sidebarWidth = 20
    const mainCols = Math.max(20, width - sidebarWidth - 2)
    const mainRows = Math.max(5, height - 2)
    resizeAll(mainCols, mainRows)
  })

  const closePane = useCallback(() => {
    const ps = usePaneStore.getState()
    const ws = useWorkspaceStore.getState()
    const focusedId = ps.focusedPaneId
    if (!focusedId) return
    const pane = ps.panes[focusedId]
    if (!pane) return
    ws.removePaneFromWorkspace(pane.workspaceId, focusedId)
    ps.removePane(focusedId)
  }, [])

  const closeWorkspace = useCallback(() => {
    const ws = useWorkspaceStore.getState()
    const id = ws.activeWorkspaceId
    if (!id) return
    const workspace = ws.workspaces[id]
    if (!workspace) return
    for (const pid of workspace.paneIds) {
      usePaneStore.getState().removePane(pid)
    }
    ws.removeWorkspace(id)
  }, [])

  const newPane = useCallback(() => {
    const wsState = useWorkspaceStore.getState()
    const activeWsId = wsState.activeWorkspaceId
    if (!activeWsId) return
    const ws = wsState.workspaces[activeWsId]
    if (!ws) return
    const paneId = `pane-${Date.now()}`
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
    usePaneStore.getState().focusPane(paneId)
  }, [])

  const newWorkspace = useCallback(() => {
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
    usePaneStore.getState().focusPane(paneId)
  }, [])

  const focusDirection = useCallback((dir: "left" | "right" | "up" | "down") => {
    const ps = usePaneStore.getState()
    const ws = useWorkspaceStore.getState()
    const activeWsId = ws.activeWorkspaceId
    if (!activeWsId) return
    const workspace = ws.workspaces[activeWsId]
    if (!workspace) return
    const ids = workspace.paneIds
    const currentIdx = ps.focusedPaneId ? ids.indexOf(ps.focusedPaneId) : -1
    let nextIdx = currentIdx
    if (dir === "right") nextIdx = Math.min(currentIdx + 1, ids.length - 1)
    else if (dir === "left") nextIdx = Math.max(currentIdx - 1, 0)
    else if (dir === "down") {
      if (workspace.splitLayout === "horizontal") {
        nextIdx = Math.min(currentIdx + 1, ids.length - 1)
      }
    } else if (dir === "up") {
      if (workspace.splitLayout === "horizontal") {
        nextIdx = Math.max(currentIdx - 1, 0)
      }
    }
    if (nextIdx >= 0 && nextIdx < ids.length) {
      ps.focusPane(ids[nextIdx])
    }
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

  const renamePane = useCallback(() => {
    const ps = usePaneStore.getState()
    const focusedId = ps.focusedPaneId
    if (!focusedId) return
    const pane = ps.panes[focusedId]
    if (!pane) return
    const newName = prompt("Rename pane:", pane.title)
    if (newName) {
      ps.setTitle(focusedId, newName)
    }
  }, [])

  const quit = useCallback(() => {
    const renderer = (globalThis as any).__opentui_renderer
    renderer?.destroy()
    process.exit(0)
  }, [])

  const closePalette = useCallback(() => setShowPalette(false), [])
  const closeNotifications = useCallback(() => setShowNotifications(false), [])

  const actions: GlobalActions = {
    togglePalette: () => setShowPalette((v) => !v),
    closePalette,
    toggleNotifications: () => {
      setShowNotifications((v) => { if (!v) setNotificationIndex(0); return !v })
    },
    closeNotifications,
    newWorkspace,
    closePane,
    closeWorkspace,
    splitRight: newPane,
    splitDown: () => {
      const wsState = useWorkspaceStore.getState()
      const activeWsId = wsState.activeWorkspaceId
      if (!activeWsId) return
      const ws = wsState.workspaces[activeWsId]
      if (!ws) return
      wsState.setSplitLayout(activeWsId, "horizontal")
      newPane()
    },
    jumpToUnread,
    focusDirection,
    jumpToWorkspace,
    toggleSidebar: () => setSidebarVisible((v) => !v),
    renamePane,
    quit,
  }

  const sidebarMove = useCallback(
    (dir: -1 | 1) => setSidebarIndex((i) => Math.max(0, Math.min(i + dir, Object.keys(useWorkspaceStore.getState().workspaces).length - 1))),
    [],
  )
  const sidebarActivate = useCallback(() => {
    const wsList = Object.values(useWorkspaceStore.getState().workspaces)
    const ws = wsList[sidebarIndex]
    if (!ws) return
    useWorkspaceStore.getState().setActive(ws.id)
    const firstPane = ws.paneIds[0]
    if (firstPane) usePaneStore.getState().focusPane(firstPane)
  }, [sidebarIndex])

  const sidebarFocus = useCallback(() => {
    setSidebarIndex((i) => (i >= 0 ? i : 0))
  }, [])

  const notificationMove = useCallback(
    (dir: -1 | 1) => setNotificationIndex((i) => {
      const notifs = useNotificationStore.getState().notifications
      return Math.max(0, Math.min(i + dir, notifs.length - 1))
    }),
    [],
  )
  const notificationActivate = useCallback(() => {
    const notifs = useNotificationStore.getState().notifications
    const n = notifs[notificationIndex]
    if (n) useNotificationStore.getState().markRead(n.id)
  }, [notificationIndex])

  useGlobalKeyboard(
    actions,
    {
      palette: showPalette,
      notifications: showNotifications,
      notificationIndex,
      notificationCount: useNotificationStore.getState().notifications.length,
      onNotificationMove: notificationMove,
      onNotificationActivate: notificationActivate,
    },
    {
      visible: sidebarVisible,
      focused: sidebarIndex >= 0 && !showPalette && !showNotifications,
      selectedIndex: Math.max(0, sidebarIndex),
      count: Object.keys(useWorkspaceStore.getState().workspaces).length,
      onMove: sidebarMove,
      onActivate: sidebarActivate,
      onFocus: sidebarFocus,
    },
  )

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor={colors.background}
    >
      <box flexDirection="row" flexGrow={1}>
        {sidebarVisible && <Sidebar focusedIndex={sidebarIndex} />}
        <MainArea>
          <PaneRenderer />
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
