import { colors } from "../colors"
import { usePreviewStore } from "../store/preview"
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
      backgroundColor="#000000"
    >
      <scrollbox>
        <text fg={colors.textPrimary}>
          {preview || "tmux session starting..."}
        </text>
      </scrollbox>

    </box>
  )
}
