import fs from "fs";
import os from "os";
import path from "path";
import type { AuthStore, UserRecord } from "../core/auth";

const SERVER_DATA_DIR = process.env.LYHERMES_SERVER_DATA || path.join(os.homedir(), ".lyhermes-server");
const USERS_FILE = path.join(SERVER_DATA_DIR, "users.json");

function ensureServerDataDir(): void {
  fs.mkdirSync(SERVER_DATA_DIR, { recursive: true });
}

export const serverAuthStore: AuthStore = {
  loadUsers(): UserRecord[] {
    try {
      if (!fs.existsSync(USERS_FILE)) return [];
      return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8")) as UserRecord[];
    } catch {
      return [];
    }
  },

  saveUsers(users: UserRecord[]): void {
    ensureServerDataDir();
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
  },
};
