import * as pty from "node-pty"

export interface PtyInstance {
  pid: number
  cols: number
  rows: number
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): () => void
  onExit(cb: (code: number, signal?: number) => void): () => void
}

export function spawnPty(
  cwd: string,
  shell?: string,
  cols = 80,
  rows = 24,
): PtyInstance {
  const sh = shell || process.env.SHELL || "bash"
  const proc = pty.spawn(sh, [], {
    name: "xterm-256color",
    cols,
    rows,
    cwd,
    env: process.env as Record<string, string>,
  })

  return {
    get pid() { return proc.pid },
    get cols() { return proc.cols },
    get rows() { return proc.rows },
    write: (data: string) => proc.write(data),
    resize: (c: number, r: number) => proc.resize(c, r),
    kill: () => proc.kill(),
    onData: (cb: (data: string) => void) => {
      const d = proc.onData(cb)
      return () => d.dispose()
    },
    onExit: (cb: (code: number, signal?: number) => void) => {
      const d = proc.onExit((e) => cb(e.exitCode, e.signal))
      return () => d.dispose()
    },
  }
}
