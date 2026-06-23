import { createCliRenderer } from "@opentui/core"
import { createRoot } from "@opentui/react"
import App from "./App"

const renderer = await createCliRenderer({
  exitOnCtrlC: true,
})

;(globalThis as any).__opentui_renderer = renderer

createRoot(renderer).render(<App />)
