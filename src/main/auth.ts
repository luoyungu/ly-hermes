import {
  DEFAULT_PASSWORD,
  DEFAULT_USERNAME,
  type PublicUser,
  type UserRecord,
} from "../core/auth";
import { desktopAuthService } from "./core/auth-store";
import { registerAuthIpcHandlers } from "./ipc/auth-ipc";

export { DEFAULT_PASSWORD, DEFAULT_USERNAME, registerAuthIpcHandlers };
export type { PublicUser, UserRecord };

export function readUsers(): UserRecord[] {
  return desktopAuthService.readUsers();
}

export function writeUsers(users: UserRecord[]): void {
  desktopAuthService.writeUsers(users);
}

export function hashPassword(password: string, salt: string): string {
  return desktopAuthService.hashPassword(password, salt);
}

export function ensureDefaultUser(): void {
  desktopAuthService.ensureDefaultUser();
}

export function createUserWithPassword(password: string): void {
  desktopAuthService.createUserWithPassword(password);
}

export function getCurrentUser(): PublicUser | null {
  return desktopAuthService.getCurrentUser();
}
