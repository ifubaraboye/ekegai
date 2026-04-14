import { app, ipcMain, BrowserWindow, shell, dialog } from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import log from "electron-log";
import * as pty from "node-pty";
import * as os from "os";
import * as fs from "fs";

log.initialize();
log.transports.file.level = "info";

const ptyMap = new Map<string, pty.IPty>();

function getShell(): string {
  if (process.platform === "win32") {
    return "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function createPty(ptyId: string, cols: number, rows: number): void {
  if (ptyMap.has(ptyId)) {
    log.warn(`PTY ${ptyId} already exists, killing old one`);
    const oldPty = ptyMap.get(ptyId);
    oldPty?.kill();
    ptyMap.delete(ptyId);
  }

  const shell = getShell();
  const cwd = process.env.HOME || process.env.USERPROFILE || os.homedir();

  const env: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    const value = process.env[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";

  const options: pty.IPtyOptions = {
    name: "xterm-256color",
    cols,
    rows,
    cwd: cwd,
    env: env,
  };

  if (process.platform === "win32") {
    options.useConpty = true;
  }

  log.info(`Spawning shell: ${shell} in ${cwd}`);

  const ptyProcess = pty.spawn(shell, [], options);
  ptyMap.set(ptyId, ptyProcess);

  ptyProcess.onData((data: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(`pty:output:${ptyId}`, data);
    }
  });

  ptyProcess.onExit(({ exitCode }) => {
    log.info(`PTY ${ptyId} exited with code ${exitCode}`);
    ptyMap.delete(ptyId);
  });

  log.info(`Created PTY ${ptyId} with shell ${shell}`);
}

function writeToPty(ptyId: string, data: string): void {
  const ptyProcess = ptyMap.get(ptyId);
  if (ptyProcess) {
    ptyProcess.write(data);
  } else {
    log.warn(`PTY ${ptyId} not found for write`);
  }
}

function resizePty(ptyId: string, cols: number, rows: number): void {
  const ptyProcess = ptyMap.get(ptyId);
  if (ptyProcess) {
    ptyProcess.resize(cols, rows);
  } else {
    log.warn(`PTY ${ptyId} not found for resize`);
  }
}

function killPty(ptyId: string): void {
  const ptyProcess = ptyMap.get(ptyId);
  if (ptyProcess) {
    ptyProcess.kill();
    ptyMap.delete(ptyId);
    log.info(`Killed PTY ${ptyId}`);
  } else {
    log.warn(`PTY ${ptyId} not found for kill`);
  }
}

ipcMain.on("pty:create", (_event, { ptyId, cols, rows }) => {
  createPty(ptyId, cols, rows);
});

ipcMain.on("pty:input", (_event, { ptyId, data }) => {
  writeToPty(ptyId, data);
});

ipcMain.on("pty:resize", (_event, { ptyId, cols, rows }) => {
  resizePty(ptyId, cols, rows);
});

ipcMain.on("pty:kill", (_event, { ptyId }) => {
  killPty(ptyId);
});

ipcMain.handle("workflow:save", async (_event, { data }) => {
  const result = await dialog.showSaveDialog({
    defaultPath: "workflow.json",
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["showOverwriteConfirmation"],
  });
  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }
  fs.writeFileSync(result.filePath, data, "utf-8");
  log.info(`Saved workflow to ${result.filePath}`);
  return { canceled: false, filePath: result.filePath };
});

ipcMain.handle("workflow:load", async () => {
  const result = await dialog.showOpenDialog({
    filters: [{ name: "JSON", extensions: ["json"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true };
  }
  const data = fs.readFileSync(result.filePaths[0], "utf-8");
  log.info(`Loaded workflow from ${result.filePaths[0]}`);
  return { canceled: false, filePath: result.filePaths[0], data };
});

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.mjs"),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.webContents.session.webRequest.onHeadersReceived(
    (details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' http://localhost:*",
          ],
        },
      });
    },
  );

  mainWindow.on("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (is.dev && process.env["ELECTRON_RENDERER_URL"]) {
    mainWindow.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId("com.agentflow");

  app.on("browser-window-created", (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const [ptyId] of ptyMap) {
    killPty(ptyId);
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught Exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  log.error("Unhandled Rejection:", reason);
});
