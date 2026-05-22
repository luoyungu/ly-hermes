import { ipcMain } from "electron";
import { desktopAuthService } from "../core/auth-store";

export function registerAuthIpcHandlers(): void {
  ipcMain.handle("auth-login", async (_, password: string) => {
    return desktopAuthService.login(password);
  });

  ipcMain.handle("auth-logout", async () => {
    return desktopAuthService.logout();
  });

  ipcMain.handle("auth-get-current", async () => {
    return desktopAuthService.getCurrentUser();
  });

  ipcMain.handle(
    "auth-change-password",
    async (_, oldPassword: string, newPassword: string) => {
      return desktopAuthService.changePassword(oldPassword, newPassword);
    },
  );

  ipcMain.handle("auth-setup-password", async (_, password: string) => {
    return desktopAuthService.setupPassword(password);
  });

  ipcMain.handle("check-initialized", async () => {
    return desktopAuthService.checkInitialized();
  });
}
