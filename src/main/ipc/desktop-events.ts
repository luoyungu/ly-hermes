import type { BrowserWindow } from "electron";
import { broadcastV1Event } from "../../server/routes/v1/events";

export function notifyRenderer(
  mainWindow: BrowserWindow | null | undefined,
  channel: string,
  data: Record<string, unknown>,
): void {
  broadcastV1Event(channel, data);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}
