import { ipcMain, BrowserWindow, app } from "electron";
import { autoUpdater } from "electron-updater";

let _getMainWindow: (() => BrowserWindow | null) | null = null;

export function initUpdater(getMainWindow: () => BrowserWindow | null): void {
  _getMainWindow = getMainWindow;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update-status", { status: "checking" });
  });

  autoUpdater.on("update-available", (info) => {
    sendToRenderer("update-status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes,
      fileSize: info.files?.[0]?.size,
    });
  });

  autoUpdater.on("update-not-available", () => {
    sendToRenderer("update-status", { status: "not-available" });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update-status", {
      status: "downloading",
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", () => {
    sendToRenderer("update-status", { status: "downloaded" });
  });

  autoUpdater.on("error", (err) => {
    sendToRenderer("update-status", { status: "error", error: err.message });
  });

  ipcMain.handle("check-app-update", async () => {
    try {
      await autoUpdater.checkForUpdates();
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle("download-app-update", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message };
    }
  });

  ipcMain.handle("install-app-update", () => {
    setImmediate(() => autoUpdater.quitAndInstall());
  });

  ipcMain.handle("get-app-version", () => {
    return app.getVersion();
  });
}

function sendToRenderer(channel: string, data: unknown): void {
  if (!_getMainWindow) return;
  const win = _getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}
