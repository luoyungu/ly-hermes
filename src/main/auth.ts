import { ipcMain } from "electron";
import crypto from "crypto";
import { loadDbUsers, saveDbUsers } from "./db";

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
  return loadDbUsers();
}

export function writeUsers(users: UserRecord[]): void {
  saveDbUsers(users);
}

export function hashPassword(password: string, salt: string): string {
  return crypto
    .pbkdf2Sync(password, salt, 100000, 64, "sha512")
    .toString("hex");
}

export function ensureDefaultUser(): void {
  const users = readUsers();
  const existing = users.find((u) => u.username === DEFAULT_USERNAME);
  if (existing) return;
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

export function createUserWithPassword(password: string): void {
  if (!password || password.length < 4) return;
  const users = readUsers();
  const existing = users.find((u) => u.username === DEFAULT_USERNAME);
  const salt = crypto.randomBytes(32).toString("hex");
  const hash = hashPassword(password, salt);
  if (existing) {
    existing.salt = salt;
    existing.passwordHash = hash;
    writeUsers(users);
  } else {
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
}

export function registerAuthIpcHandlers(): void {
  ipcMain.handle("auth-login", async (_, password: string) => {
    if (!password) return { error: "请输入密码" };
    const users = readUsers();
    const user = users.find((u) => u.username === DEFAULT_USERNAME);
    if (!user) return { error: "尚未初始化，请先完成初始设置" };
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

  ipcMain.handle(
    "auth-setup-password",
    async (_, password: string) => {
      if (!password || password.length < 4)
        return { error: "密码至少4个字符" };
      createUserWithPassword(password);
      const users = readUsers();
      const user = users.find((u) => u.username === DEFAULT_USERNAME);
      if (user) {
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
      }
      return { error: "创建用户失败" };
    },
  );

  ipcMain.handle("check-initialized", async () => {
    const users = readUsers();
    return users.length > 0;
  });
}
