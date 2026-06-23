import { colors } from "../colors"

interface PaneHeaderProps {
  title: string
  cwd: string
}

export default function PaneHeader({ title, cwd }: PaneHeaderProps) {
  return (
    <box height={1} flexDirection="row" paddingX={1}>
      <text fg={colors.statusRunning}>●</text>
      <text fg={colors.textPrimary}> {title} </text>
      <text fg={colors.textMuted}>{cwd}</text>
    </box>
  )
}
