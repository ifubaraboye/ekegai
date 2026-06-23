import { useEffect, useRef } from "react"
import { capturePane } from "../tmux/sessions"
import { usePreviewStore } from "../store/preview"
import { useWorkspaceStore } from "../store/workspaces"

function sessionName(workspaceId: string): string {
  return `ekegai-${workspaceId}`
}

export function useTmuxPreview() {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const poll = () => {
      const workspaces = useWorkspaceStore.getState().workspaces
      const setPreview = usePreviewStore.getState().setPreview
      for (const id of Object.keys(workspaces)) {
        const text = capturePane(sessionName(id), 50)
        setPreview(id, text)
      }
    }

    poll()
    intervalRef.current = setInterval(poll, 100)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])
}
