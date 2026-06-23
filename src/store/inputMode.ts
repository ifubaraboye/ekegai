import { create } from "zustand"

interface InputModeState {
  mode: "ui" | "pty"
  toggleMode: () => void
  setMode: (m: "ui" | "pty") => void
}

export const useInputMode = create<InputModeState>((set) => ({
  mode: "ui",
  toggleMode: () =>
    set((s) => ({ mode: s.mode === "ui" ? "pty" : "ui" })),
  setMode: (mode) => set({ mode }),
}))
