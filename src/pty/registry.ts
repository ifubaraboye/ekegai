import type { PtyInstance } from "./manager"

const instances = new Map<string, PtyInstance>()

export function registerPty(paneId: string, pty: PtyInstance) {
  instances.set(paneId, pty)
}

export function unregisterPty(paneId: string) {
  instances.delete(paneId)
}

export function getPty(paneId: string): PtyInstance | undefined {
  return instances.get(paneId)
}

export function resizeAll(cols: number, rows: number) {
  for (const pty of instances.values()) {
    pty.resize(cols, rows)
  }
}

export function writeToPty(paneId: string, data: string) {
  const pty = instances.get(paneId)
  if (pty) pty.write(data)
}
