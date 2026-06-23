import { colors } from "../colors"
import { useNotificationStore } from "../store/notifications"
import { useWorkspaceStore } from "../store/workspaces"

interface NotificationPanelProps {
  onClose: () => void
}

export default function NotificationPanel({ onClose }: NotificationPanelProps) {
  const notifications = useNotificationStore((s) => s.notifications)
  const markRead = useNotificationStore((s) => s.markRead)
  const workspaces = useWorkspaceStore((s) => s.workspaces)

  if (notifications.length === 0) {
    return (
      <box
        position="absolute"
        left={0}
        top={0}
        width="100%"
        height="100%"
        backgroundColor="rgba(0,0,0,0.3)"
        onClick={onClose}
      >
        <box
          position="absolute"
          right={0}
          top={0}
          width={36}
          height="100%"
          backgroundColor={colors.sidebarBg}
          borderStyle="single"
          borderColor={colors.borderDefault}
          flexDirection="column"
          padding={1}
        >
          <text fg={colors.textAccent} bold>Notifications</text>
          <text fg={colors.textMuted}>  No notifications</text>
        </box>
      </box>
    )
  }

  const grouped: Record<string, typeof notifications> = {}
  for (const n of notifications) {
    const key = n.workspaceId
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(n)
  }

  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      backgroundColor="rgba(0,0,0,0.3)"
      onClick={onClose}
    >
      <box
        position="absolute"
        right={0}
        top={0}
        width={36}
        height="100%"
        backgroundColor={colors.sidebarBg}
        borderStyle="single"
        borderColor={colors.borderWaiting}
        flexDirection="column"
        padding={1}
      >
        <box paddingBottom={1}>
          <text fg={colors.textAccent} bold>Notifications</text>
        </box>
        <scrollbox>
          {Object.entries(grouped).map(([wsId, notifs]) => {
            const ws = workspaces[wsId]
            return (
              <box key={wsId} flexDirection="column" paddingBottom={1}>
                <text fg={colors.textMuted} bold>
                  {ws?.name ?? wsId}
                </text>
                {notifs.map((n) => (
                  <box
                    key={n.id}
                    paddingLeft={1}
                    onClick={() => markRead(n.id)}
                  >
                    <text fg={n.read ? colors.textMuted : colors.notificationDot}>
                      {n.read ? "○" : "●"}
                    </text>
                    <text fg={colors.textPrimary}> {n.message}</text>
                  </box>
                ))}
              </box>
            )
          })}
        </scrollbox>
      </box>
    </box>
  )
}
