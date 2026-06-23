import { colors } from "../colors"
import { usePreviewStore } from "../store/preview"
import PaneHeader from "./PaneHeader"

interface TerminalPaneProps {
  workspaceId: string
  title: string
  cwd: string
  isFocused: boolean
}

export default function TerminalPane({ workspaceId, title, cwd, isFocused }: TerminalPaneProps) {
  const preview = usePreviewStore((s) => s.previews[workspaceId]) ?? ""

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      borderStyle="single"
      borderColor={isFocused ? colors.borderFocused : colors.borderDefault}
      backgroundColor="#1e2030"
    >
      <PaneHeader title={title} cwd={cwd} />
      <scrollbox>
        <text fg={colors.textPrimary}>
          {preview || "tmux session starting..."}
        </text>
      </scrollbox>
      <box height={1} paddingX={1} backgroundColor={colors.sidebarBg}>
        <text fg={colors.textMuted}>
          Type to send to tmux  |  Ctrl+P: commands
        </text>
      </box>
    </box>
  )
}
