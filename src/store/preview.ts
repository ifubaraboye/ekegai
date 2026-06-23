import { create } from "zustand"

interface PreviewState {
  previews: Record<string, string>
  setPreview: (workspaceId: string, text: string) => void
}

export const usePreviewStore = create<PreviewState>((set) => ({
  previews: {},
  setPreview: (workspaceId, text) =>
    set((s) => ({ previews: { ...s.previews, [workspaceId]: text } })),
}))
