import { ipcMain } from "electron";
import crypto from "crypto";
import fs from "fs";
import { APP_DATA_DIR, USERS_FILE } from "./config";
import { ensureDir } from "./utils";

export const DEFAULT_USERNAME = "admin";
export const DEFAULT_PASSWORD = "123456";

interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  displayName: string;
  createdAt: string;
  lastLogin: string;
}

export let currentUser: UserRecord | null = null;

export function readUsers(): UserRecord[] {
  ensureDir(APP_DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}

export function writeUsers(users: UserRecord[]): void {
  ensureDir(APP_DATA_DIR);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}

export function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
}

export function ensureDefaultUser(): void {
  const users = readUsers();
  const existing = users.find((u) => u.username === DEFAULT_USERNAME);
  if (existing) {
    const testHash = hashPassword(DEFAULT_PASSWORD, existing.salt);
    if (testHash !== existing.passwordHash) {
      const newSalt = crypto.randomBytes(32).toString("hex");
      const newHash = hashPassword(DEFAULT_PASSWORD, newSalt);
      existing.salt = newSalt;
      existing.passwordHash = newHash;
      existing.displayName = "Admin";
      writeUsers(users);
    }
    return;
  }
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = hashPassword(DEFAULT_PASSWORD, salt);
  users.push({
    id: "u-default",
    username: DEFAULT_USERNAME,
    passwordHash: hash,
    salt,
    displayName: "Admin",
    createdAt: new Date().toISOString(),
    lastLogin: new Date().toISOString(),
  });
  writeUsers(users);
}

export function registerAuthIpcHandlers(): void {
  ipcMain.handle("auth-login", async (_, password: string) => {
    ensureDefaultUser();
    if (!password) return { error: "请输入密码" };
    const users = readUsers();
    const user = users.find((u) => u.username === DEFAULT_USERNAME);
    if (!user) return { error: "用户不存在" };
    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) return { error: "密码错误" };
    user.lastLogin = new Date().toISOString();
    writeUsers(users);
    currentUser = user;
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
      },
    };
  });

  ipcMain.handle("auth-logout", async () => {
    currentUser = null;
    return { success: true };
  });

  ipcMain.handle("auth-get-current", async () => {
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName,
    };
  });

  ipcMain.handle(
    "auth-change-password",
    async (_, oldPassword: string, newPassword: string) => {
      if (!currentUser) return { error: "请先登录" };
      const users = readUsers();
      const user = users.find((u) => u.id === currentUser!.id);
      if (!user) return { error: "用户不存在" };
      const oldHash = hashPassword(oldPassword, user.salt);
      if (oldHash !== user.passwordHash) return { error: "旧密码错误" };
      if (!newPassword || newPassword.length < 4)
        return { error: "新密码至少4个字符" };
      const newSalt = crypto.randomBytes(32).toString("hex");
      const newHash = hashPassword(newPassword, newSalt);
      user.salt = newSalt;
      user.passwordHash = newHash;
      writeUsers(users);
      currentUser = user;
      return { success: true };
    },
  );
}
