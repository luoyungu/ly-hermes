import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  protocol,
  net,
} from "electron";
import path from "path";
import fs from "fs";
import { WINDOW_STATE_FILE, APP_DATA_DIR } from "./config";
import { ensureDefaultUser } from "./auth";
import { ensureApiServerConfig } from "./config";
import { _gatewayProcesses, _idleTimers, clearIdleTimer } from "./employees";
import { _pendingApprovals } from "./chat";
import { createTrayIcon, ensureDir } from "./utils";
import { registerAuthIpcHandlers } from "./auth";
import { registerConfigIpcHandlers } from "./config";
import { registerEmployeeIpcHandlers } from "./employees";
import { registerChatIpcHandlers } from "./chat";
import { registerSessionIpcHandlers } from "./sessions";

process.on("uncaughtException", (err) => {
  console.error("[MAIN UNCAUGHT]", err);
});

process.on("unhandledRejection", (reason) => {
  console.error("[MAIN UNHANDLED REJECTION]", reason);
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
  const savedState = loadWindowState();
  const windowOptions: Electron.BrowserWindowConstructorOptions = {
    width: ((savedState?.width as number) || 1400),
    height: ((savedState?.height as number) || 900),
    minWidth: 1000,
    minHeight: 600,
    title: "Hermes Desktop",
    titleBarStyle: "hiddenInset",
    backgroundColor: "#000000",
    vibrancy: "under-window" as const,
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
  tray.setToolTip("Hermes Desktop");

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
  protocol.handle("wallpaper", (request) => {
    const filePath = decodeURIComponent(request.url.replace("wallpaper://", ""));
    return net.fetch(`file://${filePath}`);
  });

  ensureDefaultUser();
  ensureApiServerConfig();

  registerAuthIpcHandlers();
  registerConfigIpcHandlers();
  registerEmployeeIpcHandlers(getMainWindow);
  registerChatIpcHandlers(getMainWindow);
  registerSessionIpcHandlers();

  createWindow();
  createTray();
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
