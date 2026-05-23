import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { registerWebApiChannel } from "../../server/web-api-registry";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type IpcHandler = (event: IpcMainInvokeEvent, ...args: any[]) => unknown | Promise<unknown>;

const registeredIpcChannels = new Set<string>();

export function webIpc(channel: string, handler: IpcHandler): void {
  if (registeredIpcChannels.has(channel)) {
    console.error(`[webIpc] duplicate channel ignored: ${channel}`);
    return;
  }
  registeredIpcChannels.add(channel);
  registerWebApiChannel(channel, (...args: unknown[]) =>
    handler({} as IpcMainInvokeEvent, ...args),
  );
  ipcMain.handle(channel, handler);
}
