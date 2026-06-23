import { useEffect, useRef } from "react"
import stripAnsi from "strip-ansi"
import { spawnPty, type PtyInstance } from "../pty/manager"
import { registerPty, unregisterPty } from "../pty/registry"
import { parseAnsi, type StyledLine } from "../pty/ansi"
import { usePaneStore } from "../store/panes"
import { useNotificationStore } from "../store/notifications"
import { useWorkspaceStore } from "../store/workspaces"

interface UsePtyOutputOptions {
  paneId: string
  cwd: string
  workspaceId?: string
  shell?: string
  onData?: (lines: StyledLine[]) => void
}

const WAIT_PATTERNS = [
  /Claude is waiting/i,
  /Waiting for input/i,
  /Press Enter/i,
  /Waiting for your response/i,
  /\[awaiting input\]/i,
]

function detectNotification(raw: string, paneId: string, workspaceId: string): boolean {
  if (raw.includes("\x1b]9;")) {
    const match = raw.match(/\x1b\]9;(.+?)(?:\x07|\x1b\\)/)
    if (match) {
      pushNotif(paneId, workspaceId, match[1])
      return true
    }
  }

  if (raw.includes("\x1b]777;notify;")) {
    const match = raw.match(/\x1b\]777;notify;(.+?);(.+?)(?:\x07|\x1b\\)/)
    if (match) {
      pushNotif(paneId, workspaceId, `${match[1]}: ${match[2]}`)
      return true
    }
  }

  const plain = stripAnsi(raw)
  for (const pattern of WAIT_PATTERNS) {
    if (pattern.test(plain)) {
      pushNotif(paneId, workspaceId, plain.trim().slice(0, 120))
      return true
    }
  }

  return false
}

function pushNotif(paneId: string, workspaceId: string, message: string) {
  useNotificationStore.getState().push({ paneId, workspaceId, message })
  const ws = useWorkspaceStore.getState().workspaces[workspaceId]
  if (ws) {
    useWorkspaceStore.getState().setUnread(workspaceId, true)
  }
  usePaneStore.getState().setStatus(paneId, "waiting")
}

export function usePtyOutput({ paneId, cwd, workspaceId = "default", shell, onData }: UsePtyOutputOptions) {
  const ptyRef = useRef<PtyInstance | null>(null)
  const notifiedRef = useRef(false)

  useEffect(() => {
    const state = usePaneStore.getState()
    const appendLines = state.appendLines
    const setStatus = state.setStatus

    const pty = spawnPty(cwd, shell)
    ptyRef.current = pty
    registerPty(paneId, pty)

    if (!state.panes[paneId]) {
      state.addPane({
        id: paneId,
        workspaceId,
        title: shell || "terminal",
        ptyPid: pty.pid,
        lines: [],
        status: "running",
        cwd,
        isFocused: false,
      })
    } else {
      state.setStatus(paneId, "running")
    }

    const unsubData = pty.onData((data: string) => {
      notifiedRef.current = detectNotification(data, paneId, workspaceId) || notifiedRef.current
      const newLines = parseAnsi(data)
      if (newLines.length > 0) {
        appendLines(paneId, newLines)
        onData?.(newLines)
      }
    })

    const unsubExit = pty.onExit((code: number) => {
      setStatus(paneId, code === 0 ? "idle" : "error")
      if (!notifiedRef.current && code === 0) {
        pushNotif(paneId, workspaceId, "Process completed")
      }
    })

    return () => {
      unsubData()
      unsubExit()
      unregisterPty(paneId)
      pty.kill()
      usePaneStore.getState().removePane(paneId)
    }
  }, [paneId, cwd, workspaceId, shell])

  return {
    write: (data: string) => ptyRef.current?.write(data),
    resize: (cols: number, rows: number) => ptyRef.current?.resize(cols, rows),
  }
}
