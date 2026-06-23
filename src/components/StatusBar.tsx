import { colors } from "../colors"
import { useWorkspaceStore } from "../store/workspaces"
import { useNotificationStore } from "../store/notifications"

export default function StatusBar() {
  const wsCount = Object.keys(useWorkspaceStore((s) => s.workspaces)).length
  const unreadCount = useNotificationStore((s) => s.unreadCount)

  return (
    <box height={1} backgroundColor={colors.sidebarBg} flexDirection="row" paddingX={1}>
      <text fg={colors.textAccent}>ekegai</text>
      <text fg={colors.textMuted}>
        {"  "}workspaces: {wsCount}
      </text>
      {unreadCount > 0 && (
        <text fg={colors.notificationDot}>
          {"  "}unread: {unreadCount}
        </text>
      )}
      <text fg={colors.textMuted}>  Ctrl+P: commands  Ctrl+J/K: switch workspace</text>
    </box>
  )
}
