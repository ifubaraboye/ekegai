import {
  app,
  ipcMain,
  BrowserWindow,
  shell,
  dialog,
  powerMonitor,
} from "electron";
import { join } from "path";
import { electronApp, optimizer, is } from "@electron-toolkit/utils";
import log from "electron-log";
import * as pty from "node-pty";
import * as os from "os";
import * as fs from "fs";

log.initialize();
log.transports.file.level = "info";

interface TerminalState {
  ptyId: string;
  cwd: string;
  projectId?: string;
  label: string;
  createdAt: number;
  scrollback: string[];
}

interface SessionData {
  version: number;
  terminals: TerminalState[];
  lastSaved: number;
}

function getSessionFilePath(): string {
  return join(app.getPath("userData"), "session-data.json");
}

function loadSessionFromDisk(): SessionData {
  const filePath = getSessionFilePath();
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, "utf-8");
      return JSON.parse(data);
    }
  } catch (err) {
    log.warn("Failed to load session:", err);
  }
  return { version: 1, terminals: [], lastSaved: 0 };
}

function saveSessionToDisk(session: SessionData): void {
  const filePath = getSessionFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2), "utf-8");
  } catch (err) {
    log.error("Failed to save session:", err);
  }
}

const MAX_SCROLLBACK_LINES = 500;

const ptyMap = new Map<string, pty.IPty>();
const scrollbackMap = new Map<string, string[]>();
const ptyCwdMap = new Map<string, string>();

function getShell(): string {
  if (process.platform === "win32") {
    return "powershell.exe";
  }
  return process.env.SHELL || "/bin/bash";
}

function createPty(
  ptyId: string,
  cols: number,
  rows: number,
  cwd?: string,
): void {
  if (ptyMap.has(ptyId)) {
    const existingPty = ptyMap.get(ptyId);
    if (existingPty) {
      existingPty.resize(cols, rows);
      log.info(`Resized existing PTY ${ptyId}`);
      return;
    }
  }

  const shellPath = getShell();
  const workingDir =
    cwd || process.env.HOME || process.env.USERPROFILE || os.homedir();

  const env: Record<string, string> = {};
  for (const key of Object.keys(process.env)) {
    const value = process.env[key];
    if (typeof value === "string") {
      env[key] = value;
    }
  }
  env.TERM = "xterm-256color";
  env.COLORTERM = "truecolor";

  const options: Record<string, unknown> = {
    name: "xterm-256color",
    cols,
    rows,
    cwd: workingDir,
    env: env,
  };

  if (process.platform === "win32") {
    options.useConpty = true;
  }

  log.info(`Spawning shell: ${shellPath} in ${workingDir}`);

  const ptyProcess = pty.spawn(shellPath, [], options);
  ptyMap.set(ptyId, ptyProcess);
  scrollbackMap.set(ptyId, []);
  ptyCwdMap.set(ptyId, workingDir);

  ptyProcess.onData((data: string) => {
    const win = BrowserWindow.getAllWindows()[0];
    if (win && !win.isDestroyed()) {
      win.webContents.send(`pty:output:${ptyId}`, data);
    }
    const scrollback = scrollbackMap.get(ptyId);
    if (scrollback) {
      const lines = data.split("\n");
      for (const line of lines) {
        if (line) {
          scrollback.push(line);
          if (scrollback.length > MAX_SCROLLBACK_LINES) {
            scrollback.shift();
          }
        }
      }
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
  if (cols <= 0 || rows <= 0) {
    log.warn(`Invalid resize dimensions for ${ptyId}: ${cols}x${rows}`);
    return;
  }
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

ipcMain.on("pty:create", (_event, { ptyId, cols, rows, cwd }) => {
  createPty(ptyId, cols, rows, cwd);
});

ipcMain.on("pty:input", (_event, { ptyId, data }) => {
  writeToPty(ptyId, data);
});

ipcMain.on("pty:resize", (_event, { ptyId, cols, rows }) => {
  resizePty(ptyId, cols, rows);
});

ipcMain.on("pty:kill", (_event, { ptyId }) => {
  killPty(ptyId);
  scrollbackMap.delete(ptyId);
  ptyCwdMap.delete(ptyId);
});

function saveSession(): void {
  const terminals: TerminalState[] = [];
  ptyMap.forEach((ptyProcess, ptyId) => {
    const cwd = ptyCwdMap.get(ptyId) || "";
    const scrollback = scrollbackMap.get(ptyId) || [];
    terminals.push({
      ptyId,
      cwd,
      scrollback: [...scrollback],
      label: "",
      createdAt: Date.now(),
    });
  });
  const session: SessionData = {
    version: 1,
    terminals,
    lastSaved: Date.now(),
  };
  saveSessionToDisk(session);
  log.info(`Session saved: ${terminals.length} terminals`);
}

function loadSession(): TerminalState[] {
  const session = loadSessionFromDisk();
  log.info(`Session loaded: ${session.terminals.length} terminals`);
  return session.terminals;
}

ipcMain.handle("session:save", async () => {
  saveSession();
  return { success: true };
});

ipcMain.handle("session:load", async () => {
  return loadSession();
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

ipcMain.handle("dialog:openFolder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths?.length) {
    return { canceled: true };
  }
  log.info(`Opened folder: ${result.filePaths[0]}`);
  return { canceled: false, path: result.filePaths[0] };
});

ipcMain.handle("fs:readDir", async (_event, { path }) => {
  try {
    const entries = fs.readdirSync(path, { withFileTypes: true });
    const files = entries
      .map((entry) => ({
        name: entry.name,
        isDirectory: entry.isDirectory(),
        path: `${path}/${entry.name}`,
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    return files;
  } catch (error) {
    log.error(`Error reading directory ${path}:`, error);
    return [];
  }
});

ipcMain.handle("ide:detect", async () => {
  const { exec } = require("child_process");
  const available: { name: string; command: string }[] = [];

  const ideCommands = [
    { name: "VS Code", command: "code" },
    { name: "Zed", command: "zed" },
    { name: "Cursor", command: "cursor" },
  ];

  for (const ide of ideCommands) {
    try {
      const isAvailable = await new Promise<boolean>((resolve) => {
        exec(`which ${ide.command}`, (err) => resolve(!err));
      });
      if (isAvailable) available.push(ide);
    } catch {
      // Ignore errors
    }
  }

  return available;
});

ipcMain.handle("ide:open", async (_event, { path, command }) => {
  const { spawn } = require("child_process");
  try {
    spawn(command, [path], {
      detached: true,
      stdio: "ignore",
    }).unref();
    return { success: true };
  } catch (error) {
    log.error(`Error opening IDE: ${error}`);
    return { success: false, error: String(error) };
  }
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

  setInterval(() => {
    saveSession();
  }, 30000);

  powerMonitor.on("suspend", () => {
    log.info("System suspending, saving session...");
    saveSession();
  });

  powerMonitor.on("resume", () => {
    log.info("System resumed");
  });

  powerMonitor.on("lock-screen", () => {
    log.info("Screen locked, saving session...");
    saveSession();
  });

  app.on("before-quit", () => {
    saveSession();
  });
});

app.on("window-all-closed", () => {
  ptyMap.forEach((_, ptyId) => {
    killPty(ptyId);
  });
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
