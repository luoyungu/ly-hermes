import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { BrowserWindow } from "electron";
import * as yaml from "../lib/yaml-simple";
import {
  PROFILES_DIR,
  loadAppConfig,
  RUNTIME_DEFAULTS,
  getProfilePath,
  readHermesEnv,
  runHermesCli,
  validateProfileName,
  syncPresetProviderEnvFile,
} from "../config";
import { resolveLyProviderId, toHermesConfigProvider } from "../../shared/provider-registry";
import { ensureDir, safeWriteFile, yamlStringify } from "../utils";
import { notifyRenderer } from "../ipc/desktop-events";
import { getSessionCount } from "../sessions";
import {
  loadMemoryFile,
  saveMemoryFile,
  exportEmployeeDesktopData,
} from "../db";
import {
  readEmployeeMeta,
  writeEmployeeMeta,
  wakeUpEmployee,
  putEmployeeToSleep,
  allocatePort,
} from "../employees";

const DEFAULT_DESKTOP_TOOLS = [
  "web",
  "browser",
  "terminal",
  "file",
  "code_execution",
  "vision",
  "image_gen",
  "tts",
  "skills",
  "memory",
  "session_search",
  "clarify",
  "delegation",
  "cronjob",
  "moa",
  "todo",
];

function getMemoryRuntimeLimits(): { memoryCharLimit: number; userCharLimit: number } {
  const appConfig = loadAppConfig();
  const runtime = (appConfig.runtime as Record<string, unknown> | undefined) || {};
  const defMem = (RUNTIME_DEFAULTS.memory as Record<string, unknown>) || {};
  const memCfg = Object.assign({}, defMem, (runtime.memory as Record<string, unknown>) || {});
  return {
    memoryCharLimit: Number(memCfg.memory_char_limit || defMem.memory_char_limit || 12200) || 12200,
    userCharLimit: Number(memCfg.user_char_limit || defMem.user_char_limit || 5375) || 5375,
  };
}

function createWebAccessToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function getWebAccessToken(meta: Record<string, unknown> | null | undefined): string {
  return typeof meta?.web_access_token === "string" ? meta.web_access_token : "";
}

export function createEmployeeProfile(
  config: Record<string, unknown>,
  getMainWindow: () => BrowserWindow | null,
): { success?: boolean; name?: string; error?: string } {
  const name = config.name as string;
  if (!validateProfileName(name)) {
    return { error: "员工名称只能包含小写字母、数字、下划线和连字符，且以字母或数字开头" };
  }
  if (name === "default") {
    return { error: "不能使用 default 作为员工名称" };
  }

  const profilePath = path.join(PROFILES_DIR, name);
  if (fs.existsSync(profilePath)) {
    return { error: "员工 " + name + " 已存在" };
  }

  const appConfig = loadAppConfig();
  const defaults = (appConfig.defaults as Record<string, unknown>) || {};
  const runtime = (appConfig.runtime as Record<string, unknown>) || {};
  const port =
    (config.gateway_port as number) || allocatePort();
  if (!port) return { error: "没有可用端口" };

  const output = runHermesCli(["profile", "create", name], "default");
  if (output.includes("Error") || output.includes("error")) {
    if (!fs.existsSync(profilePath)) {
      ensureDir(profilePath);
    }
  }

  const model =
    (config.model as string) ||
    (defaults.model as string) ||
    "";
  const provider =
    resolveLyProviderId(
      (config.provider as string) ||
      (defaults.provider as string) ||
      "",
    );
  const baseUrl =
    (config.base_url as string) ||
    (defaults.base_url as string) ||
    "";

  const defMem = (RUNTIME_DEFAULTS.memory as Record<string, unknown>) || {};
  const defComp = (RUNTIME_DEFAULTS.compression as Record<string, unknown>) || {};
  const defTerm = (RUNTIME_DEFAULTS.terminal as Record<string, unknown>) || {};
  const defCode = (RUNTIME_DEFAULTS.code_execution as Record<string, unknown>) || {};
  const defBrowser = (RUNTIME_DEFAULTS.browser as Record<string, unknown>) || {};
  const defSession = (RUNTIME_DEFAULTS.session_reset as Record<string, unknown>) || {};

  const memCfg = Object.assign({}, defMem, (runtime.memory as Record<string, unknown>) || {});
  const compCfg = Object.assign({}, defComp, (runtime.compression as Record<string, unknown>) || {});
  const termCfg = Object.assign({}, defTerm, (runtime.terminal as Record<string, unknown>) || {});
  const codeCfg = Object.assign({}, defCode, (runtime.code_execution as Record<string, unknown>) || {});
  const browserCfg = Object.assign({}, defBrowser, (runtime.browser as Record<string, unknown>) || {});
  const sessionCfg = Object.assign({}, defSession, (runtime.session_reset as Record<string, unknown>) || {});

  const configYaml = yamlStringify({
    model: { default: model, provider: toHermesConfigProvider(provider), base_url: baseUrl },
    platforms: {
      api_server: {
        extra: { port: port, host: "127.0.0.1" },
      },
    },
    platform_toolsets: {
      cli:
        (config.tools as string[]) ||
        (defaults.tools as string[]) ||
        DEFAULT_DESKTOP_TOOLS,
      api_server:
        (config.tools as string[]) ||
        (defaults.tools as string[]) ||
        DEFAULT_DESKTOP_TOOLS,
    },
    agent: { max_turns: 60, reasoning_effort: "medium" },
    memory: {
      enabled: memCfg.memory_enabled,
      max_chars: memCfg.memory_char_limit,
      user_char_limit: memCfg.user_char_limit,
      flush_min_turns: memCfg.flush_min_turns,
    },
    compression: {
      enabled: compCfg.enabled,
      target_ratio: compCfg.target_ratio,
      threshold: compCfg.threshold,
      protect_last_n: compCfg.protect_last_n,
    },
    terminal: {
      timeout: termCfg.timeout,
      lifetime_seconds: termCfg.lifetime_seconds,
    },
    code_execution: {
      max_tool_calls: codeCfg.max_tool_calls,
      timeout: codeCfg.timeout,
    },
    browser: {
      inactivity_timeout: browserCfg.inactivity_timeout,
    },
    session_reset: {
      idle_minutes: sessionCfg.idle_minutes,
      at_hour: sessionCfg.at_hour,
    },
  });
  ensureDir(profilePath);
  fs.writeFileSync(
    path.join(profilePath, "config.yaml"),
    configYaml,
    "utf-8",
  );

  const defaultProvider = resolveLyProviderId((defaults.provider as string) || "");
  const defaultApiKey =
    !defaultProvider || defaultProvider === provider
      ? (defaults.api_key as string) || ""
      : "";
  if (config.api_key || defaultApiKey) {
    const apiKey =
      (config.api_key as string) || defaultApiKey;
    syncPresetProviderEnvFile(path.join(profilePath, ".env"), provider, {
      baseUrl,
      apiKey,
    });
  }

  if (config.soul) {
    fs.writeFileSync(
      path.join(profilePath, "SOUL.md"),
      config.soul as string,
      "utf-8",
    );
  }

  writeEmployeeMeta(name, {
    name: (config.displayName as string) || name,
    role: (config.role as string) || "员工",
    avatar: (config.avatar as string) || "🧑‍💼",
    color: (config.color as string) || "#6C5CE7",
    tags: (config.tags as string[]) || [],
    petSlug: (config.petSlug as string) || "",
    gateway_port: port,
    idle_timeout:
      (config.idle_timeout as number) ||
      (defaults.idle_timeout as number) ||
      30,
    created_at: new Date().toISOString().split("T")[0],
  });

  if (config.wakeUp) {
    setTimeout(
      () => wakeUpEmployee(name, getMainWindow()),
      500,
    );
  }

  const win = getMainWindow();
  notifyRenderer(win, "employee-list-changed", { action: "created", name });

  return { success: true, name };
}

export function updateEmployeeProfile(
  name: string,
  changes: Record<string, unknown>,
  getMainWindow?: () => BrowserWindow | null,
): { success: boolean } {
  const meta = readEmployeeMeta(name) || {};
  if (changes.displayName !== undefined) meta.name = changes.displayName;
  if (changes.role !== undefined) meta.role = changes.role;
  if (changes.avatar !== undefined) meta.avatar = changes.avatar;
  if (changes.color !== undefined) meta.color = changes.color;
  if (changes.tags !== undefined) meta.tags = changes.tags;
  if (changes.idle_timeout !== undefined)
    meta.idle_timeout = changes.idle_timeout;
  if (changes.webAccessEnabled !== undefined) {
    meta.web_access_enabled = changes.webAccessEnabled === true;
    if (meta.web_access_enabled && !getWebAccessToken(meta)) {
      meta.web_access_token = createWebAccessToken();
    }
  }
  if (changes.petSlug !== undefined) meta.petSlug = changes.petSlug;
  writeEmployeeMeta(name, meta);
  if (getMainWindow) {
    notifyRenderer(getMainWindow(), "employee-list-changed", { action: "updated", name });
  }
  return { success: true };
}

export async function deleteEmployeeProfile(
  name: string,
  getMainWindow: () => BrowserWindow | null,
): Promise<{ success?: boolean; error?: string }> {
  if (name === "default") return { error: "不能删除默认员工" };
  await putEmployeeToSleep(name, getMainWindow());
  const output = runHermesCli(
    ["profile", "delete", name, "--yes"],
    "default",
  );
  const success = !output.includes("Error");
  if (success) {
    const win = getMainWindow();
    notifyRenderer(win, "employee-list-changed", { action: "deleted", name });
  }
  return { success };
}

export function getEmployeeSoulContent(name: string): string {
  if (!validateProfileName(name) && name !== "default") return "";
  const soulPath = path.join(getProfilePath(name), "SOUL.md");
  if (!fs.existsSync(soulPath)) return "";
  try {
    return fs.readFileSync(soulPath, "utf-8");
  } catch {
    return "";
  }
}

export function setEmployeeSoulContent(
  name: string,
  content: string,
): { success?: boolean; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  const profilePath = getProfilePath(name);
  ensureDir(profilePath);
  safeWriteFile(path.join(profilePath, "SOUL.md"), content);
  return { success: true };
}

export function resetEmployeeSoulContent(
  name: string,
): { success?: boolean; soul?: string; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  const defaultSoul =
    "You are Hermes, a helpful AI assistant. You are friendly, knowledgeable, and always eager to help.\n" +
    "You communicate clearly and concisely. When asked to perform tasks, you think step-by-step and explain your reasoning.\n" +
    "You are honest about your limitations and ask for clarification when needed.\n";
  const profilePath = getProfilePath(name);
  ensureDir(profilePath);
  safeWriteFile(path.join(profilePath, "SOUL.md"), defaultSoul);
  return { success: true, soul: defaultSoul };
}

export function getEmployeeConfigYaml(
  name: string,
): Record<string, unknown> | null {
  if (!validateProfileName(name) && name !== "default") return null;
  const configPath = path.join(getProfilePath(name), "config.yaml");
  if (!fs.existsSync(configPath)) return null;
  try {
    return yaml.parse(fs.readFileSync(configPath, "utf-8"));
  } catch {
    return null;
  }
}

export function setEmployeeConfigYaml(
  name: string,
  configObj: Record<string, unknown>,
): { success?: boolean; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  const profilePath = getProfilePath(name);
  ensureDir(profilePath);
  const configPath = path.join(profilePath, "config.yaml");
  let existing: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      existing = yaml.parse(fs.readFileSync(configPath, "utf-8")) as Record<string, unknown>;
    }
  } catch { /* fall through */ }
  const merged = { ...existing, ...configObj };
  safeWriteFile(configPath, yamlStringify(merged));
  return { success: true };
}

export function getEmployeeEnvMasked(name: string): Record<string, string> {
  const env = readHermesEnv(name);
  const result: Record<string, string> = {};
  for (const [key, val] of Object.entries(env)) {
    if (
      key.includes("KEY") ||
      key.includes("TOKEN") ||
      key.includes("SECRET")
    ) {
      result[key] = val.slice(0, 4) + "****";
    } else {
      result[key] = val;
    }
  }
  return result;
}

export function setEmployeeEnvVars(
  name: string,
  envObj: Record<string, string>,
): { success?: boolean; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  if (!envObj || typeof envObj !== "object")
    return { error: "无效的环境变量" };
  const ENV_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
  for (const key of Object.keys(envObj)) {
    if (!ENV_KEY_RE.test(key))
      return { error: "无效的环境变量名: " + key };
    if (/[\0\r\n]/.test(String(envObj[key])))
      return { error: "环境变量值不能包含换行符" };
  }
  const profilePath = getProfilePath(name);
  ensureDir(profilePath);
  const existing = readHermesEnv(name);
  const merged = Object.assign({}, existing, envObj);
  let content = "";
  for (const [key, val] of Object.entries(merged)) {
    if (val) content += key + "=" + val + "\n";
  }
  fs.writeFileSync(path.join(profilePath, ".env"), content, "utf-8");
  return { success: true };
}

export function getEmployeeToolsList(name: string): string[] {
  if (!validateProfileName(name) && name !== "default") return [];
  const configPath = path.join(getProfilePath(name), "config.yaml");
  if (!fs.existsSync(configPath)) return DEFAULT_DESKTOP_TOOLS;
  try {
    const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
    const pt = cfg.platform_toolsets as Record<string, unknown> | undefined;
    if (pt?.api_server && Array.isArray(pt.api_server)) {
      return pt.api_server;
    }
    if (pt?.cli && Array.isArray(pt.cli)) {
      return pt.cli;
    }
    const platforms = cfg.platforms as Record<string, unknown> | undefined;
    const cli = platforms?.cli as Record<string, unknown> | undefined;
    if (cli?.tools && Array.isArray(cli.tools)) {
      return cli.tools;
    }
    return DEFAULT_DESKTOP_TOOLS;
  } catch {
    return DEFAULT_DESKTOP_TOOLS;
  }
}

export function setEmployeeToolsList(
  name: string,
  tools: string[],
): { success?: boolean; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  const profilePath = getProfilePath(name);
  ensureDir(profilePath);
  const configPath = path.join(profilePath, "config.yaml");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  if (!cfg.platform_toolsets) cfg.platform_toolsets = {};
  (cfg.platform_toolsets as Record<string, unknown>).cli = tools;
  (cfg.platform_toolsets as Record<string, unknown>).api_server = tools;
  safeWriteFile(configPath, yamlStringify(cfg));
  return { success: true };
}

export function toggleEmployeeTool(
  name: string,
  toolKey: string,
  enabled: boolean,
): { success?: boolean; tools?: string[]; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  const profilePath = getProfilePath(name);
  ensureDir(profilePath);
  const configPath = path.join(profilePath, "config.yaml");
  let cfg: Record<string, unknown> = {};
  try {
    if (fs.existsSync(configPath)) {
      cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  let currentTools: string[] = [];
  const pt = cfg.platform_toolsets as Record<string, unknown> | undefined;
  if (pt?.api_server && Array.isArray(pt.api_server)) {
    currentTools = pt.api_server.slice() as string[];
  } else if (pt?.cli && Array.isArray(pt.cli)) {
    currentTools = pt.cli.slice() as string[];
  } else {
    const platforms = cfg.platforms as
      | Record<string, unknown>
      | undefined;
    const cli = platforms?.cli as Record<string, unknown> | undefined;
    if (cli?.tools && Array.isArray(cli.tools)) {
      currentTools = (cli.tools as string[]).slice();
    }
  }
  if (enabled) {
    if (currentTools.indexOf(toolKey) < 0) currentTools.push(toolKey);
  } else {
    currentTools = currentTools.filter((t) => t !== toolKey);
  }
  if (!cfg.platform_toolsets) cfg.platform_toolsets = {};
  (cfg.platform_toolsets as Record<string, unknown>).cli = currentTools;
  (cfg.platform_toolsets as Record<string, unknown>).api_server = currentTools;
  safeWriteFile(configPath, yamlStringify(cfg));
  return { success: true, tools: currentTools };
}

export function getEmployeeMemoryData(name: string): Record<string, unknown> {
  if (!validateProfileName(name) && name !== "default")
    return { memory: [], user: "", stats: {} };
  try {
    const result: Record<string, unknown> = {
      memory: [],
      user: "",
      stats: {},
    };
    const limits = getMemoryRuntimeLimits();
    const content = loadMemoryFile(name, "memory");
    if (content) {
      const entries = content
        .split("\n§\n")
        .filter((e: string) => e.trim().length > 0);
      result.memory = entries.map(
        (e: string, i: number) => ({ index: i, content: e.trim() }),
      );
      result.memoryCharCount = content.length;
    }
    result.memoryCharLimit = limits.memoryCharLimit;
    const user = loadMemoryFile(name, "user");
    if (user) {
      result.user = user;
      result.userCharCount = (result.user as string).length;
    }
    result.userCharLimit = limits.userCharLimit;
    result.stats = { totalSessions: getSessionCount() };
    return result;
  } catch {
    return { memory: [], user: "", stats: {} };
  }
}

export function addEmployeeMemoryEntry(
  name: string,
  content: string,
): { success?: boolean; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  try {
    const { memoryCharLimit } = getMemoryRuntimeLimits();
    const existing = loadMemoryFile(name, "memory");
    const newContent = existing.trim()
      ? existing.trimEnd() + "\n§\n" + content.trim()
      : content.trim();
    if (newContent.length > memoryCharLimit)
      return {
        error: "超出记忆容量限制 (" + newContent.length + "/" + memoryCharLimit + ")",
      };
    saveMemoryFile(name, "memory", newContent);
    return { success: true };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

export function deleteEmployeeMemoryEntry(
  name: string,
  index: number,
): { success?: boolean; error?: string } {
  if (!validateProfileName(name) && name !== "default")
    return { error: "无效的员工名称" };
  try {
    const content = loadMemoryFile(name, "memory");
    if (!content) return { error: "记忆不存在" };
    const entries = content
      .split("\n§\n")
      .filter((e: string) => e.trim().length > 0);
    const idx = parseInt(String(index), 10);
    if (idx < 0 || idx >= entries.length)
      return { error: "条目不存在" };
    entries.splice(idx, 1);
    saveMemoryFile(name, "memory", entries.join("\n§\n"));
    return { success: true };
  } catch (e: unknown) {
    return { error: String(e) };
  }
}

export function getEmployeeSkillsDirList(
  name: string,
): Array<{ name: string; path: string }> {
  if (!validateProfileName(name) && name !== "default") return [];
  const skillsDir = path.join(getProfilePath(name), "skills");
  if (!fs.existsSync(skillsDir)) return [];
  try {
    const skills: Array<{ name: string; path: string }> = [];
    const dirs = fs.readdirSync(skillsDir, { withFileTypes: true });
    for (const d of dirs) {
      if (d.isDirectory()) {
        skills.push({ name: d.name, path: path.join(skillsDir, d.name) });
      }
    }
    return skills;
  } catch {
    return [];
  }
}

export function removeEmployeeSkillDir(
  name: string,
  skillName: string,
): { success?: boolean; error?: string } {
  const skillDir = path.join(getProfilePath(name), "skills", skillName);
  if (!fs.existsSync(skillDir)) {
    return { error: "技能 " + skillName + " 不存在" };
  }
  try {
    fs.rmSync(skillDir, { recursive: true, force: true });
    return { success: true };
  } catch (e: unknown) {
    return { error: (e as Error).message };
  }
}

export function renameEmployeeProfile(
  oldName: string,
  newName: string,
  getMainWindow?: () => BrowserWindow | null,
): { success?: boolean; error?: string } {
  if (!validateProfileName(oldName) || !validateProfileName(newName)) {
    return { error: "无效的员工名称" };
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(newName)) {
    return { error: "新名称只能包含英文字母、数字、下划线和连字符" };
  }
  if (oldName === "default") {
    return { error: "不能重命名默认员工" };
  }
  const newProfilePath = path.join(PROFILES_DIR, newName);
  if (fs.existsSync(newProfilePath)) {
    return { error: "员工 " + newName + " 已存在" };
  }
  const output = runHermesCli(
    ["profile", "rename", oldName, newName],
    "default",
  );
  if (output.includes("Error") || output.includes("error")) {
    return { error: output };
  }
  const meta = readEmployeeMeta(newName) || readEmployeeMeta(oldName);
  if (meta) {
    meta.name = meta.name === oldName ? newName : meta.name;
    writeEmployeeMeta(newName, meta);
  }
  if (getMainWindow) {
    notifyRenderer(getMainWindow(), "employee-list-changed", {
      action: "updated",
      name: newName,
      oldName,
    });
  }
  return { success: true };
}

export function exportEmployeeProfile(
  name: string,
): { success?: boolean; output?: string; error?: string } {
  if (!validateProfileName(name)) return { error: "无效的员工名称" };
  const output = runHermesCli(["profile", "export", name], "default");
  const desktopExport = exportEmployeeDesktopData(name);
  if (output.includes("Error") || output.includes("error")) {
    return {
      error: desktopExport.success
        ? `${output}\n桌面端员工数据已导出: ${desktopExport.path}`
        : output,
    };
  }
  return {
    success: true,
    output: desktopExport.success
      ? `${output}\n桌面端员工数据已导出: ${desktopExport.path}`
      : `${output}\n桌面端员工数据导出失败: ${desktopExport.error || "unknown error"}`,
  };
}
