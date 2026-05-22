import crypto from "crypto";
import type { AuthResult, AuthStore, PublicUser, UserRecord } from "./types";

export const DEFAULT_USERNAME = "admin";
export const DEFAULT_PASSWORD = "123456";

function publicUser(user: UserRecord): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
  };
}

export class AuthService {
  private currentUser: UserRecord | null = null;

  constructor(private readonly store: AuthStore) {}

  readUsers(): UserRecord[] {
    return this.store.loadUsers();
  }

  writeUsers(users: UserRecord[]): void {
    this.store.saveUsers(users);
  }

  hashPassword(password: string, salt: string): string {
    return crypto
      .pbkdf2Sync(password, salt, 100000, 64, "sha512")
      .toString("hex");
  }

  ensureDefaultUser(): void {
    const users = this.readUsers();
    const existing = users.find((u) => u.username === DEFAULT_USERNAME);
    if (existing) return;
    const salt = crypto.randomBytes(32).toString("hex");
    const hash = this.hashPassword(DEFAULT_PASSWORD, salt);
    users.push({
      id: "u-default",
      username: DEFAULT_USERNAME,
      passwordHash: hash,
      salt,
      displayName: "Admin",
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });
    this.writeUsers(users);
  }

  createUserWithPassword(password: string): void {
    if (!password || password.length < 4) return;
    const users = this.readUsers();
    const existing = users.find((u) => u.username === DEFAULT_USERNAME);
    const salt = crypto.randomBytes(32).toString("hex");
    const hash = this.hashPassword(password, salt);
    if (existing) {
      existing.salt = salt;
      existing.passwordHash = hash;
      this.writeUsers(users);
      return;
    }
    users.push({
      id: "u-default",
      username: DEFAULT_USERNAME,
      passwordHash: hash,
      salt,
      displayName: "Admin",
      createdAt: new Date().toISOString(),
      lastLogin: new Date().toISOString(),
    });
    this.writeUsers(users);
  }

  login(password: string): AuthResult {
    if (!password) return { error: "请输入密码" };
    const users = this.readUsers();
    const user = users.find((u) => u.username === DEFAULT_USERNAME);
    if (!user) return { error: "尚未初始化，请先完成初始设置" };
    const hash = this.hashPassword(password, user.salt);
    if (hash !== user.passwordHash) return { error: "密码错误" };
    user.lastLogin = new Date().toISOString();
    this.writeUsers(users);
    this.currentUser = user;
    return { success: true, user: publicUser(user) };
  }

  logout(): { success: boolean } {
    this.currentUser = null;
    return { success: true };
  }

  getCurrentUser(): PublicUser | null {
    if (!this.currentUser) return null;
    return publicUser(this.currentUser);
  }

  changePassword(oldPassword: string, newPassword: string): { success?: boolean; error?: string } {
    if (!this.currentUser) return { error: "请先登录" };
    const users = this.readUsers();
    const user = users.find((u) => u.id === this.currentUser!.id);
    if (!user) return { error: "用户不存在" };
    const oldHash = this.hashPassword(oldPassword, user.salt);
    if (oldHash !== user.passwordHash) return { error: "旧密码错误" };
    if (!newPassword || newPassword.length < 4) return { error: "新密码至少4个字符" };
    const newSalt = crypto.randomBytes(32).toString("hex");
    const newHash = this.hashPassword(newPassword, newSalt);
    user.salt = newSalt;
    user.passwordHash = newHash;
    this.writeUsers(users);
    this.currentUser = user;
    return { success: true };
  }

  setupPassword(password: string): AuthResult {
    if (!password || password.length < 4) return { error: "密码至少4个字符" };
    this.createUserWithPassword(password);
    const users = this.readUsers();
    const user = users.find((u) => u.username === DEFAULT_USERNAME);
    if (!user) return { error: "创建用户失败" };
    user.lastLogin = new Date().toISOString();
    this.writeUsers(users);
    this.currentUser = user;
    return { success: true, user: publicUser(user) };
  }

  checkInitialized(): boolean {
    return this.readUsers().length > 0;
  }
}
