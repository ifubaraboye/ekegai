import type { PaneStatus } from "../store/panes"
import { colors } from "../colors"

const statusDot: Record<PaneStatus, string> = {
  idle: colors.statusIdle,
  running: colors.statusRunning,
  waiting: colors.statusWaiting,
  error: colors.statusError,
}

interface PaneHeaderProps {
  title: string
  cwd: string
  gitBranch?: string | null
  port?: string | null
  status: PaneStatus
}

export default function PaneHeader({ title, cwd, gitBranch, port, status }: PaneHeaderProps) {
  const dotColor = statusDot[status]
  return (
    <box height={1} flexDirection="row" paddingX={1}>
      <text fg={dotColor}>●</text>
      <text fg={colors.textPrimary}> {title} </text>
      <text fg={colors.textMuted}>{cwd}</text>
      {gitBranch && <text fg={colors.textMuted}>  {gitBranch}</text>}
      {port && <text fg={colors.textMuted}>  :{port}</text>}
      <text fg={dotColor}>  {status}</text>
    </box>
  )
}
