import { create } from "zustand"

export interface Workspace {
  id: string
  name: string
  cwd: string
  paneIds: string[]
  hasUnread: boolean
  gitBranch?: string | null
  listeningPorts?: number[]
  splitLayout?: "horizontal" | "vertical" | "grid"
}

interface WorkspaceState {
  workspaces: Record<string, Workspace>
  activeWorkspaceId: string | null
  addWorkspace: (ws: Workspace) => void
  removeWorkspace: (id: string) => void
  setActive: (id: string) => void
  addPaneToWorkspace: (workspaceId: string, paneId: string) => void
  removePaneFromWorkspace: (workspaceId: string, paneId: string) => void
  setSplitLayout: (id: string, layout: Workspace["splitLayout"]) => void
  setUnread: (id: string, unread: boolean) => void
  setGitBranch: (id: string, branch: string | null) => void
  setPorts: (id: string, ports: number[]) => void
  renameWorkspace: (id: string, name: string) => void
}

let nextWsId = 1
export function generateWorkspaceId(): string {
  return `ws-${nextWsId++}`
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: {},
  activeWorkspaceId: null,

  addWorkspace: (ws) =>
    set((s) => ({
      workspaces: { ...s.workspaces, [ws.id]: ws },
      activeWorkspaceId: s.activeWorkspaceId ?? ws.id,
    })),

  removeWorkspace: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.workspaces
      return {
        workspaces: rest,
        activeWorkspaceId:
          s.activeWorkspaceId === id
            ? Object.keys(rest)[0] ?? null
            : s.activeWorkspaceId,
      }
    }),

  setActive: (id) =>
    set({ activeWorkspaceId: id }),

  addPaneToWorkspace: (workspaceId, paneId) =>
    set((s) => {
      const ws = s.workspaces[workspaceId]
      if (!ws) return s
      return {
        workspaces: {
          ...s.workspaces,
          [workspaceId]: { ...ws, paneIds: [...ws.paneIds, paneId] },
        },
      }
    }),

  removePaneFromWorkspace: (workspaceId, paneId) =>
    set((s) => {
      const ws = s.workspaces[workspaceId]
      if (!ws) return s
      return {
        workspaces: {
          ...s.workspaces,
          [workspaceId]: {
            ...ws,
            paneIds: ws.paneIds.filter((id) => id !== paneId),
          },
        },
      }
    }),

  setSplitLayout: (id, layout) =>
    set((s) => {
      const ws = s.workspaces[id]
      if (!ws) return s
      return {
        workspaces: { ...s.workspaces, [id]: { ...ws, splitLayout: layout } },
      }
    }),

  setUnread: (id, hasUnread) =>
    set((s) => {
      const ws = s.workspaces[id]
      if (!ws) return s
      return {
        workspaces: { ...s.workspaces, [id]: { ...ws, hasUnread } },
      }
    }),

  setGitBranch: (id, gitBranch) =>
    set((s) => {
      const ws = s.workspaces[id]
      if (!ws) return s
      return {
        workspaces: { ...s.workspaces, [id]: { ...ws, gitBranch } },
      }
    }),

  setPorts: (id, listeningPorts) =>
    set((s) => {
      const ws = s.workspaces[id]
      if (!ws) return s
      return {
        workspaces: { ...s.workspaces, [id]: { ...ws, listeningPorts } },
      }
    }),

  renameWorkspace: (id, name) =>
    set((s) => {
      const ws = s.workspaces[id]
      if (!ws) return s
      return {
        workspaces: { ...s.workspaces, [id]: { ...ws, name } },
      }
    }),
}))
