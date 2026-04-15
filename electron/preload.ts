import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  ptyCreate: (ptyId: string, cols: number, rows: number, cwd?: string) => void;
  ptyInput: (ptyId: string, data: string) => void;
  ptyResize: (ptyId: string, cols: number, rows: number) => void;
  ptyKill: (ptyId: string) => void;
  onPtyOutput: (ptyId: string, callback: (data: string) => void) => () => void;
  saveWorkflow: (
    data: string,
  ) => Promise<{ canceled: boolean; filePath?: string }>;
  loadWorkflow: () => Promise<{
    canceled: boolean;
    filePath?: string;
    data?: string;
  }>;
  openFolder: () => Promise<{ canceled: boolean; path?: string }>;
  readDir: (
    path: string,
  ) => Promise<{ name: string; isDirectory: boolean; path: string }[]>;
  ideDetect: () => Promise<{ name: string; command: string }[]>;
  ideOpen: (
    path: string,
    command: string,
  ) => Promise<{ success: boolean; error?: string }>;
}

const api: ElectronAPI = {
  ptyCreate: (ptyId: string, cols: number, rows: number, cwd?: string) => {
    ipcRenderer.send("pty:create", { ptyId, cols, rows, cwd });
  },
  ptyInput: (ptyId: string, data: string) => {
    ipcRenderer.send("pty:input", { ptyId, data });
  },
  ptyResize: (ptyId: string, cols: number, rows: number) => {
    ipcRenderer.send("pty:resize", { ptyId, cols, rows });
  },
  ptyKill: (ptyId: string) => {
    ipcRenderer.send("pty:kill", { ptyId });
  },
  onPtyOutput: (ptyId: string, callback: (data: string) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: string) => {
      callback(data);
    };
    ipcRenderer.on(`pty:output:${ptyId}`, handler);
    return () => {
      ipcRenderer.removeListener(`pty:output:${ptyId}`, handler);
    };
  },
  saveWorkflow: async (data: string) => {
    const result = await ipcRenderer.invoke("workflow:save", { data });
    return result;
  },
  loadWorkflow: async () => {
    const result = await ipcRenderer.invoke("workflow:load");
    return result;
  },
  openFolder: async () => {
    const result = await ipcRenderer.invoke("dialog:openFolder");
    return result;
  },
  readDir: async (path: string) => {
    const result = await ipcRenderer.invoke("fs:readDir", { path });
    return result;
  },
  ideDetect: async () => {
    const result = await ipcRenderer.invoke("ide:detect");
    return result;
  },
  ideOpen: async (path: string, command: string) => {
    const result = await ipcRenderer.invoke("ide:open", { path, command });
    return result;
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
