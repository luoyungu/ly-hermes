import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  protocol,
  net,
  ipcMain,
} from "electron";
import path from "path";
import fs from "fs";
import { WINDOW_STATE_FILE, APP_DATA_DIR } from "./config";
import { ensureApiServerConfig } from "./config";
import { _gatewayProcesses, _idleTimers, clearIdleTimer } from "./employees";
import { _pendingApprovals } from "./chat";
import { createTrayIcon, ensureDir } from "./utils";
import { registerAuthIpcHandlers } from "./auth";
import { registerConfigIpcHandlers } from "./config";
import { registerEmployeeIpcHandlers } from "./employees";
import { registerChatIpcHandlers } from "./chat";
import { registerSessionIpcHandlers, readLogs as readHermesLogs, clearHermesLog } from "./sessions";
import { registerPetsIpc } from "./pets";
import { initUpdater } from "./updater";
import { autoUpdater } from "electron-updater";
import {
  checkInstallStatus,
  verifyInstall,
  runInstall,
  getHermesVersion,
} from "./installer";
import { logInfo, logError, readLogs as readAppLogs, clearLogs, getLogFilePath } from "./logger";

process.on("uncaughtException", (err) => {
  logError("main", "Uncaught exception", err);
});

process.on("unhandledRejection", (reason) => {
  logError("main", "Unhandled rejection", reason);
});

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let _isQuitting = false;

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

function loadWindowState(): Record<string, unknown> | null {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  return null;
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getBounds();
    const isMaximized = mainWindow.isMaximized();
    ensureDir(APP_DATA_DIR);
    fs.writeFileSync(
      WINDOW_STATE_FILE,
      JSON.stringify({ ...bounds, isMaximized }),
      "utf-8",
    );
  } catch {
    /* fall through */
  }
}

function createWindow(): void {
  const isMac = process.platform === "darwin";
  const savedState = loadWindowState();
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: ((savedState?.width as number) || 1400),
    height: ((savedState?.height as number) || 900),
    minWidth: 1000,
    minHeight: 600,
    title: "落云.Hermes",
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset",
          vibrancy: "under-window" as const,
        }
      : {
          frame: false,
          autoHideMenuBar: true,
        }),
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  };
  if (
    savedState &&
    savedState.x !== undefined &&
    savedState.y !== undefined
  ) {
    windowOptions.x = savedState.x as number;
    windowOptions.y = savedState.y as number;
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (savedState && savedState.isMaximized) {
    mainWindow.maximize();
  }

  const rendererUrl = process.env['ELECTRON_RENDERER_URL']
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  if (process.env['HERMES_DEVTOOLS']) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return;
    event.preventDefault();
  });

  mainWindow.webContents.on(
    "render-process-gone",
    (_event, details) => {
      console.error(
        "[CRASH] Renderer process gone:",
        details.reason,
        details.exitCode,
      );
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }, 3000);
    },
  );

  mainWindow.on("close", (e) => {
    if (!_isQuitting) {
      e.preventDefault();
      mainWindow!.hide();
      return;
    }
    saveWindowState();
  });

  mainWindow.on("resize", () => saveWindowState());
  mainWindow.on("move", () => saveWindowState());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function createTray(): void {
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.setToolTip("落云.Hermes");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    {
      label: "新对话",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("new-conversation");
        }
      },
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        _isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

app.whenReady().then(() => {
  logInfo("main", "Application starting", { version: app.getVersion(), platform: process.platform });
  Menu.setApplicationMenu(null);

  protocol.handle("wallpaper", (request) => {
    const filePath = decodeURIComponent(request.url.replace("wallpaper://", ""));
    return net.fetch(`file://${filePath}`);
  });

  ensureApiServerConfig();

  ipcMain.handle("check-install", () => checkInstallStatus());
  ipcMain.handle("verify-install", async () => {
    const ok = await verifyInstall();
    if (ok) {
      const version = await getHermesVersion();
      return { installed: true, version: version || undefined };
    }
    return { installed: false, error: "验证失败" };
  });
  ipcMain.handle("start-install", async () => {
    return await runInstall((progress) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("install-progress", progress);
      }
    });
  });

  ipcMain.handle("window-minimize", () => {
    const win = getMainWindow();
    if (win) win.minimize();
  });
  ipcMain.handle("window-maximize", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  ipcMain.handle("window-close", () => {
    const win = getMainWindow();
    if (win) win.close();
  });
  ipcMain.handle("window-is-maximized", () => {
    const win = getMainWindow();
    return win ? win.isMaximized() : false;
  });

  registerAuthIpcHandlers();
  registerConfigIpcHandlers();
  registerEmployeeIpcHandlers(getMainWindow);
  registerChatIpcHandlers(getMainWindow);
  registerSessionIpcHandlers();
  registerPetsIpc();

  initUpdater(getMainWindow);

  ipcMain.handle("get-app-logs", (_, options?: { level?: string; lines?: number }) => {
    switch (options?.level) {
      case "debug":
      case "info":
      case "warn":
      case "error":
        return readAppLogs({ level: options.level, lines: options.lines });
      default:
        return readAppLogs({ lines: options?.lines });
    }
  });

  ipcMain.handle("clear-app-logs", () => {
    clearLogs();
    return { success: true };
  });

  ipcMain.handle("get-log-file-path", () => {
    return getLogFilePath();
  });

  ipcMain.handle("read-logs", (_, logFile?: string, lines?: number) => {
    const result = readHermesLogs(logFile, lines);
    console.log('[read-logs] result:', { path: result.path, contentLength: result.content.length });
    return result;
  });

  ipcMain.handle("clear-logs", (_, logFile?: string) => {
    return clearHermesLog(logFile);
  });

  createWindow();
  createTray();

  logInfo("main", "Application ready");

  if (app.isPackaged) {
    setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  }
});

app.on("before-quit", () => {
  _isQuitting = true;
  Object.keys(_gatewayProcesses).forEach((k) => {
    if (_gatewayProcesses[k] && !_gatewayProcesses[k].killed) {
      _gatewayProcesses[k].kill("SIGTERM");
    }
  });
  Object.keys(_idleTimers).forEach(clearIdleTimer);
});

app.on("window-all-closed", () => {
  /* do nothing, keep running in tray */
});

app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});

setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(_pendingApprovals)) {
    if (now - _pendingApprovals[key].ts > 300000) {
      delete _pendingApprovals[key];
    }
  }
}, 60000);
