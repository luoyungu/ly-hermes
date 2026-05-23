import { desktopAuthService } from "../core/auth-store";
import { webIpc } from "./web-api-ipc";

export function registerAuthIpcHandlers(): void {
  webIpc("auth-login", async (_, password: string) => {
    return desktopAuthService.login(password);
  });

  webIpc("auth-logout", async () => {
    return desktopAuthService.logout();
  });

  webIpc("auth-get-current", async () => {
    return desktopAuthService.getCurrentUser();
  });

  webIpc(
    "auth-change-password",
    async (_, oldPassword: string, newPassword: string) => {
      return desktopAuthService.changePassword(oldPassword, newPassword);
    },
  );

  webIpc("auth-setup-password", async (_, password: string) => {
    return desktopAuthService.setupPassword(password);
  });

  webIpc("check-initialized", async () => {
    return desktopAuthService.checkInitialized();
  });
}
