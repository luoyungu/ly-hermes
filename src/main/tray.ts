import { Tray, Menu, BrowserWindow } from "electron";
import { createTrayIcon } from "./utils";
import { getSetting } from "./db";

const APP_NAME = "落云.Hermes";

type TrayLocale = "zh-CN" | "en";

const TRAY_LABELS = {
  "zh-CN": {
    showWindow: "显示窗口",
    newChat: "新对话",
    quit: "退出",
  },
  en: {
    showWindow: "Show Window",
    newChat: "New Chat",
    quit: "Quit",
  },
} as const;

let tray: Tray | null = null;
let getMainWindow: (() => BrowserWindow | null) | null = null;
let onQuit: (() => void) | null = null;

function getTrayLocale(): TrayLocale {
  const prefs = getSetting<Record<string, unknown>>("app", "preferences", {});
  return prefs.language === "en" ? "en" : "zh-CN";
}

function buildContextMenu(): Menu {
  const labels = TRAY_LABELS[getTrayLocale()];
  return Menu.buildFromTemplate([
    {
      label: labels.showWindow,
      click: () => {
        const win = getMainWindow?.();
        if (win) {
          win.show();
          win.focus();
        }
      },
    },
    {
      label: labels.newChat,
      click: () => {
        const win = getMainWindow?.();
        if (win) {
          win.show();
          win.focus();
          win.webContents.send("new-conversation");
        }
      },
    },
    { type: "separator" },
    {
      label: labels.quit,
      click: () => {
        onQuit?.();
      },
    },
  ]);
}

export function createTray(
  getWindow: () => BrowserWindow | null,
  quitHandler: () => void,
): void {
  getMainWindow = getWindow;
  onQuit = quitHandler;
  const icon = createTrayIcon();
  tray = new Tray(icon);
  tray.on("click", () => {
    const win = getMainWindow?.();
    if (win) {
      win.show();
      win.focus();
    }
  });
  refreshTrayMenu();
}

export function refreshTrayMenu(): void {
  if (!tray) return;
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(buildContextMenu());
}
