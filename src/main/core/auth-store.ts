import { AuthService, type AuthStore, type UserRecord } from "../../core/auth";
import { loadDbUsers, saveDbUsers } from "../db";

const desktopAuthStore: AuthStore = {
  loadUsers(): UserRecord[] {
    return loadDbUsers();
  },
  saveUsers(users: UserRecord[]): void {
    saveDbUsers(users);
  },
};

export const desktopAuthService = new AuthService(desktopAuthStore);
