import type { Workspace } from "../store/workspaces"
import { colors } from "../colors"

interface WorkspaceEntryProps {
  workspace: Workspace
  isActive: boolean
}

export default function WorkspaceEntry({ workspace, isActive }: WorkspaceEntryProps) {
  const prefix = workspace.hasUnread ? "↯" : "●"
  const prefixColor = workspace.hasUnread ? colors.notificationDot : colors.statusIdle
  const bg = isActive ? colors.activeItemBg : "transparent"

  return (
    <box flexDirection="column" paddingX={1} backgroundColor={bg}>
      <box flexDirection="row">
        <text fg={prefixColor}>{prefix}</text>
        <text fg={colors.textPrimary}>
          {" "}{workspace.name.length > 16
            ? workspace.name.slice(0, 16)
            : workspace.name}
        </text>
      </box>
      <box paddingLeft={2}>
        <text fg={colors.textMuted}>
          {workspace.cwd.length > 18
            ? "~" + workspace.cwd.slice(workspace.cwd.length - 17)
            : workspace.cwd}
        </text>
      </box>
    </box>
  )
}
