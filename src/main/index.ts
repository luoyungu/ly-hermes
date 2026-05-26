import {
  app,
  BrowserWindow,
  Menu,
  protocol,
  net,
  ipcMain,
  nativeImage,
} from "electron";
import path from "path";
import fs from "fs";
import { ensureApiServerConfig } from "./config";
import { _gatewayProcesses, _idleTimers, clearIdleTimer } from "./employees";
import { _pendingApprovals } from "./chat";
import { createTray } from "./tray";
import { getSetting, setSetting } from "./db";
import { registerAuthIpcHandlers } from "./auth";
import { registerConfigIpcHandlers } from "./config";
import { registerEmployeeIpcHandlers } from "./employees";
import { registerChatIpcHandlers } from "./chat";
import { registerSessionIpcHandlers, readLogs as readHermesLogs, clearHermesLog } from "./sessions";
import { registerPetsIpc } from "./pets";
import { applyDesktopWebServerConfig, registerDeploymentIpc, registerDesktopWebServerIpc } from "./server-manager";
import { registerRemoteIpcHandlers } from "./ipc/remote-handle";
import { initUpdater } from "./updater";
import { autoUpdater } from "electron-updater";
import {
  checkInstallStatus,
  verifyInstall,
  runInstall,
  getHermesVersion,
} from "./installer";
import { logInfo, logError, readLogs as readAppLogs, clearLogs, getLogFilePath } from "./logger";
import { webIpc } from "./ipc/web-api-ipc";

process.on("uncaughtException", (err) => {
  logError("main", "Uncaught exception", err);
});

process.on("unhandledRejection", (reason) => {
  logError("main", "Unhandled rejection", reason);
});

let mainWindow: BrowserWindow | null = null;
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
  const state = getSetting<Record<string, unknown>>("app", "window_state", {});
  return Object.keys(state).length > 0 ? state : null;
}

function saveWindowState(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getBounds();
    const isMaximized = mainWindow.isMaximized();
    setSetting("app", "window_state", { ...bounds, isMaximized });
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
    backgroundColor: "#f5f5f7",
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

function createTrayMenu(): void {
  createTray(getMainWindow, () => {
    _isQuitting = true;
    app.quit();
  });
}

app.whenReady().then(() => {
  logInfo("main", "Application starting", { version: app.getVersion(), platform: process.platform });
  Menu.setApplicationMenu(null);

  if (process.platform === "darwin") {
    app.setAboutPanelOptions({
      applicationName: "落云.Hermes",
      version: app.getVersion(),
    });
    try {
      const iconPath = path.join(process.resourcesPath || "", "icon.icns");
      const devIconPath = path.join(__dirname, "../../build/icon.png");
      const p = fs.existsSync(iconPath) ? iconPath : (fs.existsSync(devIconPath) ? devIconPath : "");
      if (p) app.dock?.setIcon(nativeImage.createFromPath(p));
    } catch { /* ignore */ }
  }

  protocol.handle("wallpaper", (request) => {
    const filePath = decodeURIComponent(request.url.replace("wallpaper://", ""));
    return net.fetch(`file://${filePath}`);
  });

  ensureApiServerConfig();

  webIpc("check-install", () => checkInstallStatus());
  webIpc("verify-install", async () => {
    const ok = await verifyInstall();
    if (ok) {
      const version = await getHermesVersion();
      return { installed: true, version: version || undefined };
    }
    return { installed: false, error: "验证失败" };
  });
  webIpc("start-install", async () => {
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
  registerSessionIpcHandlers(getMainWindow);
  registerPetsIpc();
  registerRemoteIpcHandlers();
  registerDesktopWebServerIpc();
  registerDeploymentIpc(getMainWindow);

  import("./ipc/remote-events").then(({ startRemoteEventBridge, startRemoteConnectionMonitor }) => {
    startRemoteEventBridge(getMainWindow);
    startRemoteConnectionMonitor(getMainWindow);
  });

  initUpdater(getMainWindow);

  webIpc("get-app-logs", (_, options?: { level?: string; lines?: number }) => {
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

  webIpc("clear-app-logs", () => {
    clearLogs();
    return { success: true };
  });

  webIpc("get-log-file-path", () => {
    return getLogFilePath();
  });

  webIpc("read-logs", (_, logFile?: string, lines?: number) => {
    return readHermesLogs(logFile, lines);
  });

  webIpc("clear-logs", (_, logFile?: string) => {
    return clearHermesLog(logFile);
  });

  createWindow();
  createTrayMenu();
  applyDesktopWebServerConfig().catch((error: unknown) => {
    logError("server", "Failed to apply desktop web server config", error);
  });

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
