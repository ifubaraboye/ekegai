import { contextBridge, ipcRenderer } from "electron";

export interface ElectronAPI {
  ptyCreate: (ptyId: string, cols: number, rows: number) => void;
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
}

const api: ElectronAPI = {
  ptyCreate: (ptyId: string, cols: number, rows: number) => {
    ipcRenderer.send("pty:create", { ptyId, cols, rows });
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
};

contextBridge.exposeInMainWorld("electronAPI", api);
