import { create } from "zustand"

export interface Pane {
  id: string
  workspaceId: string
  title: string
  cwd: string
  isFocused: boolean
}

interface PaneState {
  panes: Record<string, Pane>
  focusedPaneId: string | null
  addPane: (pane: Pane) => void
  removePane: (id: string) => void
  setFocused: (id: string | null) => void
  setTitle: (id: string, title: string) => void
  focusPane: (id: string) => void
}

export const usePaneStore = create<PaneState>((set) => ({
  panes: {},
  focusedPaneId: null,

  addPane: (pane) =>
    set((s) => ({ panes: { ...s.panes, [pane.id]: pane } })),

  removePane: (id) =>
    set((s) => {
      const { [id]: _, ...rest } = s.panes
      return {
        panes: rest,
        focusedPaneId: s.focusedPaneId === id ? null : s.focusedPaneId,
      }
    }),

  setFocused: (id) =>
    set((s) => {
      const updated = { ...s.panes }
      for (const key of Object.keys(updated)) {
        updated[key] = { ...updated[key], isFocused: key === id }
      }
      return { panes: updated, focusedPaneId: id }
    }),

  setTitle: (id, title) =>
    set((s) => {
      const pane = s.panes[id]
      if (!pane) return s
      return {
        panes: { ...s.panes, [id]: { ...pane, title } },
      }
    }),

  focusPane: (id) =>
    set((s) => {
      const updated = { ...s.panes }
      for (const key of Object.keys(updated)) {
        updated[key] = { ...updated[key], isFocused: key === id }
      }
      return { panes: updated, focusedPaneId: id }
    }),
}))
