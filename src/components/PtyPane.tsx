import { useRef, useEffect } from "react"
import { usePaneStore } from "../store/panes"
import type { PaneStatus } from "../store/panes"
import { colors } from "../colors"
import PaneHeader from "./PaneHeader"

const borderColorForStatus: Record<PaneStatus, string> = {
  idle: colors.borderDefault,
  running: colors.borderDefault,
  waiting: colors.borderWaiting,
  error: colors.borderError,
}

interface PtyPaneProps {
  paneId: string
}

export default function PtyPane({ paneId }: PtyPaneProps) {
  const pane = usePaneStore((s) => s.panes[paneId])
  const scrollRef = useRef<HTMLDivElement>(null)
  const autoScroll = useRef(true)

  useEffect(() => {
    if (autoScroll.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [pane?.lines.length])

  if (!pane) return null

  const borderColor = pane.isFocused ? colors.borderFocused : borderColorForStatus[pane.status]

  return (
    <box
      flexGrow={1}
      flexDirection="column"
      borderStyle="single"
      borderColor={borderColor}
      backgroundColor="#1e2030"
    >
      <PaneHeader
        title={pane.title}
        cwd={pane.cwd}
        status={pane.status}
      />
      <scrollbox>
        {pane.lines.map((line, i) => (
          <text key={i}>
            {line.segments.map((seg, j) => (
              <span
                key={j}
                fg={seg.fg}
                bg={seg.bg}
                bold={seg.bold}
                dim={seg.dim}
                italic={seg.italic}
                underline={seg.underline}
              >
                {seg.text}
              </span>
            ))}
          </text>
        ))}
      </scrollbox>
    </box>
  )
}
