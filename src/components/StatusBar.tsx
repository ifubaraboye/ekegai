import { colors } from "../colors"
import { useWorkspaceStore } from "../store/workspaces"
import { usePaneStore } from "../store/panes"
import { useNotificationStore } from "../store/notifications"
import { useInputMode } from "../store/inputMode"

export default function StatusBar() {
  const wsCount = Object.keys(useWorkspaceStore((s) => s.workspaces)).length
  const paneCount = Object.keys(usePaneStore((s) => s.panes)).length
  const unreadCount = useNotificationStore((s) => s.unreadCount)
  const mode = useInputMode((s) => s.mode)

  return (
    <box height={1} backgroundColor={colors.sidebarBg} flexDirection="row" paddingX={1}>
      <text fg={colors.textAccent}>ekegai</text>
      <text fg={mode === "pty" ? colors.statusRunning : colors.textMuted}>
        {" ["}{mode === "pty" ? "PTY" : "UI"}{"]"}
      </text>
      <text fg={colors.textMuted}>
        {"  "}workspaces: {wsCount}{"  "}panes: {paneCount}
      </text>
      {unreadCount > 0 && (
        <text fg={colors.notificationDot}>
          {"  "}unread: {unreadCount}
        </text>
      )}
      <text fg={colors.textMuted}>
        {"  "}{mode === "pty" ? "Ctrl+Shift+Z: UI" : "Enter: type  Ctrl+P: commands"}
      </text>
    </box>
  )
}
