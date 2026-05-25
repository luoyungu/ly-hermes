import Database from "better-sqlite3";
import { safeStorage } from "electron";
import fs from "fs";
import os from "os";
import path from "path";
import * as yaml from "./lib/yaml-simple";

const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
const APP_DATA_DIR = path.join(os.homedir(), ".lyhermes");
const DB_FILE = path.join(APP_DATA_DIR, "app.db");
const DEFAULT_AVATAR = "\u{1f916}";
const EMPLOYEE_AVATAR = "\u{1f9d1}\u200d\u{1f4bc}";

let db: Database.Database | null = null;

function ensureAppDataDir(): void {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

function nowIso(): string {
  return new Date().toISOString();
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

function readTextFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}

function readYamlFile(filePath: string): Record<string, unknown> | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return yaml.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

function getProfilePath(profileName: string): string {
  if (profileName === "default") return HERMES_HOME;
  return path.join(HERMES_HOME, "profiles", profileName);
}

function getMemoryFilePath(profileName: string, kind: "memory" | "user"): string {
  return path.join(
    getProfilePath(profileName),
    "memories",
    kind === "memory" ? "MEMORY.md" : "USER.md",
  );
}

function writeTextFile(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function getProfileNames(): string[] {
  const names = new Set<string>(["default"]);
  const profilesDir = path.join(HERMES_HOME, "profiles");
  try {
    for (const entry of fs.readdirSync(profilesDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        names.add(entry.name);
      }
    }
  } catch {
    /* ignore */
  }
  return Array.from(names);
}

function initSchema(database: Database.Database): void {
  database.pragma("journal_mode = WAL");
  database.pragma("foreign_keys = ON");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      namespace TEXT NOT NULL,
      key TEXT NOT NULL,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (namespace, key)
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      last_login TEXT NOT NULL,
      extra_json TEXT
    );

    CREATE TABLE IF NOT EXISTS saved_models (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(provider, model)
    );

    CREATE TABLE IF NOT EXISTS employees (
      profile_name TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL,
      avatar TEXT NOT NULL,
      color TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      pet_slug TEXT NOT NULL DEFAULT '',
      gateway_port INTEGER,
      idle_timeout INTEGER,
      created_at TEXT,
      updated_at TEXT NOT NULL,
      extra_json TEXT
    );

    CREATE TABLE IF NOT EXISTS skill_configs (
      profile_name TEXT PRIMARY KEY,
      enabled_json TEXT NOT NULL,
      stats_json TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  applySchemaMigrations(database);
}

function hasMigration(database: Database.Database, version: number): boolean {
  const row = database
    .prepare("SELECT 1 FROM schema_migrations WHERE version = ?")
    .get(version) as { 1: number } | undefined;
  return !!row;
}

function markMigration(database: Database.Database, version: number): void {
  database
    .prepare("INSERT OR REPLACE INTO schema_migrations (version, applied_at) VALUES (?, ?)")
    .run(version, nowIso());
}

function applySchemaMigrations(database: Database.Database): void {
  if (!hasMigration(database, 1)) {
    markMigration(database, 1);
  }
  if (!hasMigration(database, 2)) {
    const rows = database.prepare("SELECT id, api_key FROM saved_models WHERE api_key != ''").all() as Array<{
      id: string;
      api_key: string;
    }>;
    const update = database.prepare("UPDATE saved_models SET api_key = ?, updated_at = ? WHERE id = ?");
    const tx = database.transaction(() => {
      for (const row of rows) {
        update.run(encodeSecret(row.api_key), Date.now(), row.id);
      }
      markMigration(database, 2);
    });
    tx();
  }
  if (!hasMigration(database, 3)) {
    const tx = database.transaction(() => {
      database.prepare("DROP TABLE IF EXISTS memories").run();
      markMigration(database, 3);
    });
    tx();
  }
}

function encodeSecret(value: unknown): string {
  const text = String(value || "");
  if (!text || text.startsWith("safe:v1:") || text.startsWith("plain:v1:")) return text;
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:v1:${safeStorage.encryptString(text).toString("base64")}`;
  }
  return `plain:v1:${Buffer.from(text, "utf-8").toString("base64")}`;
}

function decodeSecret(value: unknown): string {
  const text = String(value || "");
  if (!text) return "";
  if (text.startsWith("safe:v1:")) {
    try {
      return safeStorage.decryptString(Buffer.from(text.slice("safe:v1:".length), "base64"));
    } catch {
      return "";
    }
  }
  if (text.startsWith("plain:v1:")) {
    try {
      return Buffer.from(text.slice("plain:v1:".length), "base64").toString("utf-8");
    } catch {
      return "";
    }
  }
  return text;
}

function getMeta(database: Database.Database, key: string): string | null {
  const row = database.prepare("SELECT value FROM app_meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function setMeta(database: Database.Database, key: string, value: string): void {
  database
    .prepare(
      "INSERT INTO app_meta (key, value, updated_at) VALUES (?, ?, ?) " +
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .run(key, value, nowIso());
}

function migrateLegacyData(database: Database.Database): void {
  if (getMeta(database, "legacy_migrated_v1") === "true") return;

  const insertSetting = database.prepare(
    "INSERT OR REPLACE INTO settings (namespace, key, value_json, updated_at) VALUES (?, ?, ?, ?)",
  );
  const config = readJsonFile<Record<string, unknown>>(path.join(APP_DATA_DIR, "config.json"), {});
  if (Object.keys(config).length > 0) {
    insertSetting.run("app", "config", JSON.stringify(config), nowIso());
  }
  const preferences = readJsonFile<Record<string, unknown>>(path.join(APP_DATA_DIR, "preferences.json"), {});
  if (Object.keys(preferences).length > 0) {
    insertSetting.run("app", "preferences", JSON.stringify(preferences), nowIso());
  }
  const windowState = readJsonFile<Record<string, unknown>>(path.join(APP_DATA_DIR, "window-state.json"), {});
  if (Object.keys(windowState).length > 0) {
    insertSetting.run("app", "window_state", JSON.stringify(windowState), nowIso());
  }

  const insertUser = database.prepare(
    "INSERT OR REPLACE INTO users " +
      "(id, username, password_hash, salt, display_name, created_at, last_login, extra_json) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const user of readJsonFile<Array<Record<string, unknown>>>(path.join(APP_DATA_DIR, "users.json"), [])) {
    const extra = { ...user };
    delete extra.id;
    delete extra.username;
    delete extra.passwordHash;
    delete extra.salt;
    delete extra.displayName;
    delete extra.createdAt;
    delete extra.lastLogin;
    insertUser.run(
      String(user.id || `u-${Date.now()}`),
      String(user.username || "admin"),
      String(user.passwordHash || ""),
      String(user.salt || ""),
      String(user.displayName || "Admin"),
      String(user.createdAt || nowIso()),
      String(user.lastLogin || nowIso()),
      JSON.stringify(extra),
    );
  }

  const insertModel = database.prepare(
    "INSERT OR REPLACE INTO saved_models " +
      "(id, name, provider, model, base_url, api_key, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const savedModels = readJsonFile<Array<Record<string, unknown>>>(
    path.join(APP_DATA_DIR, "saved-models.json"),
    [],
  );
  for (const model of savedModels) {
    const createdAt = Number(model.createdAt || Date.now());
    insertModel.run(
      String(model.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
      String(model.name || model.model || "模型"),
      String(model.provider || ""),
      String(model.model || ""),
      String(model.baseUrl || ""),
      encodeSecret(model.apiKey),
      createdAt,
      Number(model.updatedAt || createdAt),
    );
  }

  const insertEmployee = database.prepare(
    "INSERT OR REPLACE INTO employees " +
      "(profile_name, display_name, role, avatar, color, tags_json, pet_slug, gateway_port, idle_timeout, created_at, updated_at, extra_json) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  );
  for (const profileName of getProfileNames()) {
    const meta = readYamlFile(path.join(getProfilePath(profileName), "employee.yaml")) || {};
    if (Object.keys(meta).length === 0 && profileName !== "default") continue;
    const extra = { ...meta };
    for (const key of ["name", "role", "avatar", "color", "tags", "petSlug", "gateway_port", "idle_timeout", "created_at"]) {
      delete extra[key];
    }
    insertEmployee.run(
      profileName,
      String(meta.name || (profileName === "default" ? "默认员工" : profileName)),
      String(meta.role || (profileName === "default" ? "通用助手" : "员工")),
      String(meta.avatar || (profileName === "default" ? DEFAULT_AVATAR : EMPLOYEE_AVATAR)),
      String(meta.color || (profileName === "default" ? "#4A90D9" : "#6C5CE7")),
      JSON.stringify(Array.isArray(meta.tags) ? meta.tags : []),
      String(meta.petSlug || ""),
      meta.gateway_port == null ? null : Number(meta.gateway_port),
      meta.idle_timeout == null ? null : Number(meta.idle_timeout),
      String(meta.created_at || ""),
      nowIso(),
      JSON.stringify(extra),
    );
  }

  const insertSkillConfig = database.prepare(
    "INSERT OR REPLACE INTO skill_configs (profile_name, enabled_json, stats_json, updated_at) VALUES (?, ?, ?, ?)",
  );
  for (const profileName of getProfileNames()) {
    const configPath = path.join(getProfilePath(profileName), "skill-config.json");
    const raw = readJsonFile<Record<string, unknown>>(configPath, {});
    if (Object.keys(raw).length === 0) continue;
    insertSkillConfig.run(
      profileName,
      JSON.stringify(raw.enabled && typeof raw.enabled === "object" ? raw.enabled : {}),
      JSON.stringify(raw.stats && typeof raw.stats === "object" ? raw.stats : {}),
      Number(raw.updatedAt || Date.now()),
    );
  }

  setMeta(database, "legacy_migrated_v1", "true");
}

export function getAppDb(): Database.Database {
  if (db) return db;
  ensureAppDataDir();
  db = new Database(DB_FILE);
  initSchema(db);
  migrateLegacyData(db);
  return db;
}

export function getSetting<T>(namespace: string, key: string, fallback: T): T {
  const row = getAppDb()
    .prepare("SELECT value_json FROM settings WHERE namespace = ? AND key = ?")
    .get(namespace, key) as { value_json: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(namespace: string, key: string, value: unknown): void {
  getAppDb()
    .prepare(
      "INSERT INTO settings (namespace, key, value_json, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(namespace, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
    )
    .run(namespace, key, JSON.stringify(value), nowIso());
}

export interface DbUserRecord {
  id: string;
  username: string;
  passwordHash: string;
  salt: string;
  displayName: string;
  createdAt: string;
  lastLogin: string;
}

export function loadDbUsers(): DbUserRecord[] {
  const rows = getAppDb()
    .prepare(
      "SELECT id, username, password_hash, salt, display_name, created_at, last_login FROM users ORDER BY created_at ASC",
    )
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: String(row.id || ""),
    username: String(row.username || ""),
    passwordHash: String(row.password_hash || ""),
    salt: String(row.salt || ""),
    displayName: String(row.display_name || ""),
    createdAt: String(row.created_at || ""),
    lastLogin: String(row.last_login || ""),
  }));
}

export function saveDbUsers(users: DbUserRecord[]): void {
  const database = getAppDb();
  const replace = database.prepare(
    "INSERT OR REPLACE INTO users " +
      "(id, username, password_hash, salt, display_name, created_at, last_login, extra_json) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT extra_json FROM users WHERE id = ?), '{}'))",
  );
  const tx = database.transaction((records: DbUserRecord[]) => {
    for (const user of records) {
      replace.run(
        user.id,
        user.username,
        user.passwordHash,
        user.salt,
        user.displayName,
        user.createdAt,
        user.lastLogin,
        user.id,
      );
    }
  });
  tx(users);
}

export function loadDbSavedModels(): Array<Record<string, unknown>> {
  const rows = getAppDb()
    .prepare("SELECT id, name, provider, model, base_url, api_key, created_at FROM saved_models ORDER BY created_at ASC")
    .all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    provider: row.provider,
    model: row.model,
    baseUrl: row.base_url,
    apiKey: decodeSecret(row.api_key),
    createdAt: row.created_at,
  }));
}

export function saveDbSavedModels(models: Array<Record<string, unknown>>): void {
  const database = getAppDb();
  const replace = database.prepare(
    "INSERT OR REPLACE INTO saved_models (id, name, provider, model, base_url, api_key, created_at, updated_at) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  );
  const existingIds = new Set(models.map((model) => String(model.id || "")));
  const tx = database.transaction((records: Array<Record<string, unknown>>) => {
    for (const model of records) {
      const createdAt = Number(model.createdAt || Date.now());
      replace.run(
        String(model.id || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`),
        String(model.name || model.model || "模型"),
        String(model.provider || ""),
        String(model.model || ""),
        String(model.baseUrl || ""),
        encodeSecret(model.apiKey),
        createdAt,
        Date.now(),
      );
    }
    for (const row of database.prepare("SELECT id FROM saved_models").all() as Array<{ id: string }>) {
      if (!existingIds.has(row.id)) database.prepare("DELETE FROM saved_models WHERE id = ?").run(row.id);
    }
  });
  tx(models);
}

export function loadDbEmployeeMeta(profileName: string): Record<string, unknown> | null {
  const row = getAppDb()
    .prepare("SELECT * FROM employees WHERE profile_name = ?")
    .get(profileName) as Record<string, unknown> | undefined;
  if (!row) return null;
  let tags: unknown[] = [];
  try {
    tags = JSON.parse(String(row.tags_json || "[]")) as unknown[];
  } catch {
    tags = [];
  }
  let extra: Record<string, unknown> = {};
  try {
    extra = JSON.parse(String(row.extra_json || "{}")) as Record<string, unknown>;
  } catch {
    extra = {};
  }
  return {
    ...extra,
    name: row.display_name,
    role: row.role,
    avatar: row.avatar,
    color: row.color,
    tags,
    petSlug: row.pet_slug,
    gateway_port: row.gateway_port,
    idle_timeout: row.idle_timeout,
    created_at: row.created_at,
  };
}

export function saveDbEmployeeMeta(profileName: string, meta: Record<string, unknown>): void {
  const existing = loadDbEmployeeMeta(profileName) || {};
  const merged = { ...existing, ...meta };
  const extra = { ...merged };
  for (const key of ["name", "role", "avatar", "color", "tags", "petSlug", "gateway_port", "idle_timeout", "created_at"]) {
    delete extra[key];
  }
  getAppDb()
    .prepare(
      "INSERT INTO employees " +
        "(profile_name, display_name, role, avatar, color, tags_json, pet_slug, gateway_port, idle_timeout, created_at, updated_at, extra_json) " +
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) " +
        "ON CONFLICT(profile_name) DO UPDATE SET " +
        "display_name = excluded.display_name, role = excluded.role, avatar = excluded.avatar, color = excluded.color, " +
        "tags_json = excluded.tags_json, pet_slug = excluded.pet_slug, gateway_port = excluded.gateway_port, " +
        "idle_timeout = excluded.idle_timeout, created_at = excluded.created_at, updated_at = excluded.updated_at, extra_json = excluded.extra_json",
    )
    .run(
      profileName,
      String(merged.name || (profileName === "default" ? "默认员工" : profileName)),
      String(merged.role || (profileName === "default" ? "通用助手" : "员工")),
      String(merged.avatar || (profileName === "default" ? DEFAULT_AVATAR : EMPLOYEE_AVATAR)),
      String(merged.color || (profileName === "default" ? "#4A90D9" : "#6C5CE7")),
      JSON.stringify(Array.isArray(merged.tags) ? merged.tags : []),
      String(merged.petSlug || ""),
      merged.gateway_port == null ? null : Number(merged.gateway_port),
      merged.idle_timeout == null ? null : Number(merged.idle_timeout),
      String(merged.created_at || ""),
      nowIso(),
      JSON.stringify(extra),
    );
}

export function loadDbSkillConfig(profile?: string): {
  enabled: Record<string, boolean>;
  stats: Record<string, unknown>;
  updatedAt?: number;
} {
  const profileName = profile || "default";
  const row = getAppDb()
    .prepare("SELECT enabled_json, stats_json, updated_at FROM skill_configs WHERE profile_name = ?")
    .get(profileName) as { enabled_json: string; stats_json: string; updated_at: number } | undefined;
  if (!row) return { enabled: {}, stats: {} };
  try {
    return {
      enabled: JSON.parse(row.enabled_json) as Record<string, boolean>,
      stats: JSON.parse(row.stats_json) as Record<string, unknown>,
      updatedAt: Number(row.updated_at),
    };
  } catch {
    return { enabled: {}, stats: {} };
  }
}

export function saveDbSkillConfig(
  profile: string | undefined,
  config: { enabled: Record<string, boolean>; stats: Record<string, unknown> },
): void {
  getAppDb()
    .prepare(
      "INSERT INTO skill_configs (profile_name, enabled_json, stats_json, updated_at) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(profile_name) DO UPDATE SET enabled_json = excluded.enabled_json, stats_json = excluded.stats_json, updated_at = excluded.updated_at",
    )
    .run(profile || "default", JSON.stringify(config.enabled || {}), JSON.stringify(config.stats || {}), Date.now());
}

export function loadMemoryFile(profileName: string, kind: "memory" | "user"): string {
  return readTextFile(getMemoryFilePath(profileName, kind)) || "";
}

export function saveMemoryFile(profileName: string, kind: "memory" | "user", content: string): void {
  writeTextFile(getMemoryFilePath(profileName, kind), content);
}

export function getAppDbPath(): string {
  return DB_FILE;
}

interface AppDataExport {
  version: 1;
  exportedAt: string;
  tables: {
    settings: Array<Record<string, unknown>>;
    users: Array<Record<string, unknown>>;
    saved_models: Array<Record<string, unknown>>;
    employees: Array<Record<string, unknown>>;
    skill_configs: Array<Record<string, unknown>>;
  };
}

function allRows(table: keyof AppDataExport["tables"]): Array<Record<string, unknown>> {
  return getAppDb().prepare(`SELECT * FROM ${table}`).all() as Array<Record<string, unknown>>;
}

function exportSavedModels(includeSecrets: boolean): Array<Record<string, unknown>> {
  const rows = allRows("saved_models");
  return rows.map((row) => ({
    ...row,
    api_key: includeSecrets ? decodeSecret(row.api_key) : "",
  }));
}

export function exportAppDataBackup(outputDir = path.join(HERMES_HOME, "backups"), includeSecrets = false): {
  success: boolean;
  path?: string;
  error?: string;
} {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const outputPath = path.join(outputDir, `lyhermes-desktop-${stamp}.json`);
    const data: AppDataExport = {
      version: 1,
      exportedAt: nowIso(),
      tables: {
        settings: allRows("settings"),
        users: allRows("users"),
        saved_models: exportSavedModels(includeSecrets),
        employees: allRows("employees"),
        skill_configs: allRows("skill_configs"),
      },
    };
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
    return { success: true, path: outputPath };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export function importAppDataBackup(filePath: string): { success: boolean; error?: string } {
  try {
    const data = readJsonFile<AppDataExport | null>(filePath, null);
    if (!data || data.version !== 1 || !data.tables) {
      return { success: false, error: "不是有效的落云.Hermes 桌面端数据备份" };
    }
    const database = getAppDb();
    const tx = database.transaction(() => {
      database.prepare("DELETE FROM settings").run();
      database.prepare("DELETE FROM users").run();
      database.prepare("DELETE FROM saved_models").run();
      database.prepare("DELETE FROM employees").run();
      database.prepare("DELETE FROM skill_configs").run();

      const insertSetting = database.prepare(
        "INSERT INTO settings (namespace, key, value_json, updated_at) VALUES (?, ?, ?, ?)",
      );
      for (const row of data.tables.settings || []) {
        insertSetting.run(row.namespace, row.key, row.value_json, row.updated_at || nowIso());
      }

      const insertUser = database.prepare(
        "INSERT INTO users (id, username, password_hash, salt, display_name, created_at, last_login, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const row of data.tables.users || []) {
        insertUser.run(
          row.id,
          row.username,
          row.password_hash,
          row.salt,
          row.display_name,
          row.created_at,
          row.last_login,
          row.extra_json || "{}",
        );
      }

      const insertModel = database.prepare(
        "INSERT INTO saved_models (id, name, provider, model, base_url, api_key, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const row of data.tables.saved_models || []) {
        insertModel.run(
          row.id,
          row.name,
          row.provider,
          row.model,
          row.base_url || "",
          encodeSecret(row.api_key),
          row.created_at || Date.now(),
          row.updated_at || Date.now(),
        );
      }

      const insertEmployee = database.prepare(
        "INSERT INTO employees (profile_name, display_name, role, avatar, color, tags_json, pet_slug, gateway_port, idle_timeout, created_at, updated_at, extra_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      );
      for (const row of data.tables.employees || []) {
        insertEmployee.run(
          row.profile_name,
          row.display_name,
          row.role,
          row.avatar,
          row.color,
          row.tags_json || "[]",
          row.pet_slug || "",
          row.gateway_port ?? null,
          row.idle_timeout ?? null,
          row.created_at || "",
          row.updated_at || nowIso(),
          row.extra_json || "{}",
        );
      }

      const insertSkillConfig = database.prepare(
        "INSERT INTO skill_configs (profile_name, enabled_json, stats_json, updated_at) VALUES (?, ?, ?, ?)",
      );
      for (const row of data.tables.skill_configs || []) {
        insertSkillConfig.run(row.profile_name, row.enabled_json || "{}", row.stats_json || "{}", row.updated_at || Date.now());
      }

      setMeta(database, "legacy_migrated_v1", "true");
    });
    tx();
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export function exportEmployeeDesktopData(
  profileName: string,
  outputDir = path.join(HERMES_HOME, "backups"),
): { success: boolean; path?: string; error?: string } {
  try {
    fs.mkdirSync(outputDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const safeProfile = profileName.replace(/[^a-zA-Z0-9_-]/g, "_");
    const outputPath = path.join(outputDir, `lyhermes-employee-${safeProfile}-${stamp}.json`);
    const database = getAppDb();
    const data = {
      version: 1,
      exportedAt: nowIso(),
      profileName,
      employee: database.prepare("SELECT * FROM employees WHERE profile_name = ?").get(profileName) || null,
      skillConfig: database.prepare("SELECT * FROM skill_configs WHERE profile_name = ?").get(profileName) || null,
    };
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), "utf-8");
    return { success: true, path: outputPath };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}
