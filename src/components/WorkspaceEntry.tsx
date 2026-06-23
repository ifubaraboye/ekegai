import type { Workspace } from "../store/workspaces"
import { colors } from "../colors"

interface WorkspaceEntryProps {
  workspace: Workspace
  isActive: boolean
  isFocused?: boolean
}

export default function WorkspaceEntry({ workspace, isActive, isFocused }: WorkspaceEntryProps) {
  const prefix = workspace.hasUnread ? "↯" : workspace.paneIds.length > 0 ? "●" : "○"
  const prefixColor = workspace.hasUnread ? colors.notificationDot : colors.statusIdle
  const bg = isActive ? colors.activeItemBg : isFocused ? "#2a2a3e" : "transparent"

  return (
    <box flexDirection="column" paddingX={1} backgroundColor={bg}>
      <box flexDirection="row">
        <text fg={prefixColor}>{prefix}</text>
        <text fg={colors.textPrimary} bold={isActive}>
          {" "}{workspace.name.length > 16
            ? workspace.name.slice(0, 16)
            : workspace.name}
        </text>
        <text fg={colors.textMuted}>
          {" "}[{workspace.paneIds.length} pty]
        </text>
      </box>
      <box paddingLeft={2}>
        {workspace.gitBranch && (
          <text fg={colors.textMuted}>
            {workspace.gitBranch}
          </text>
        )}
        {workspace.listeningPorts.length > 0 && (
          <text fg={colors.textMuted}>
            {" · "}:{workspace.listeningPorts[0]}
          </text>
        )}
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
