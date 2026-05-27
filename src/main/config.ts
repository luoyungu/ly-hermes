import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { execFileSync, spawn, execFile, type ChildProcess } from "child_process";
import http from "http";
import https from "https";
import * as yaml from "./lib/yaml-simple";
import { ensureDir, safeWriteFile, yamlStringify } from "./utils";
import { getSetting, loadDbSavedModels, saveDbSavedModels, setSetting } from "./db";
import { refreshTrayMenu } from "./tray";
import { webIpc } from "./ipc/web-api-ipc";
import { ipcHandle } from "./ipc/remote-handle";
import { registerWebApiChannel } from "../server/web-api-registry";
import {
  deleteMcpServer,
  listMcpServers,
  saveMcpServer,
  testMcpServer,
  type McpServerInput,
} from "./services/tool-api";

export function getProviderEnvKey(provider: string): string {
  return PROVIDER_KEY_MAP[provider]?.envKey || "OPENAI_API_KEY";
}

export function getApiServerKeyForProfile(profileName: string): string {
  return "lyhermes-local-" + crypto
    .createHash("sha256")
    .update(`${HERMES_HOME}:${profileName || "default"}`)
    .digest("hex")
    .slice(0, 32);
}

export const PROVIDER_KEY_MAP: Record<string, { envKey: string; baseUrl: string; baseEnvKey?: string }> = {
  deepseek:    { envKey: "DEEPSEEK_API_KEY",    baseUrl: "https://api.deepseek.com/v1", baseEnvKey: "DEEPSEEK_BASE_URL" },
  qwen:        { envKey: "DASHSCOPE_API_KEY",    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", baseEnvKey: "DASHSCOPE_BASE_URL" },
  zhipu:       { envKey: "GLM_API_KEY",          baseUrl: "https://open.bigmodel.cn/api/paas/v4", baseEnvKey: "GLM_BASE_URL" },
  moonshot:    { envKey: "MOONSHOT_API_KEY",     baseUrl: "https://api.moonshot.cn/v1" },
  yi:          { envKey: "YI_API_KEY",           baseUrl: "https://api.lingyiwanwu.com/v1" },
  minimax:     { envKey: "MINIMAX_API_KEY",      baseUrl: "https://api.minimax.chat/v1", baseEnvKey: "MINIMAX_BASE_URL" },
  spark:       { envKey: "SPARK_API_KEY",        baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  siliconflow: { envKey: "SILICONFLOW_API_KEY",  baseUrl: "https://api.siliconflow.cn/v1" },
  ernie:       { envKey: "QIANFAN_API_KEY",      baseUrl: "https://qianfan.baidubce.com/v2" },
};

/** LyHermes UI provider id → Hermes Agent 原生推理 provider（避免 custom 误路由到 OpenRouter） */
const HERMES_INFERENCE_PROVIDER_MAP: Record<string, string> = {
  deepseek: "deepseek",
  qwen: "alibaba",
  zhipu: "zai",
  minimax: "minimax",
};

export function getHermesInferenceProvider(presetProvider: string): string {
  return HERMES_INFERENCE_PROVIDER_MAP[presetProvider] || "custom";
}

const PRESET_ENV_SYNC_KEYS = new Set([
  "HERMES_INFERENCE_PROVIDER",
  "OPENAI_API_KEY",
  "CUSTOM_API_KEY",
  "OPENAI_BASE_URL",
  "CUSTOM_API_BASE_URL",
  "CUSTOM_BASE_URL",
  "DASHSCOPE_BASE_URL",
  ...Object.values(PROVIDER_KEY_MAP).map((info) => info.envKey),
  ...Object.values(PROVIDER_KEY_MAP).map((info) => info.baseEnvKey || ""),
]);

function parseEnvLines(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    if (!key) continue;
    result[key] = line.slice(eqIdx + 1);
  }
  return result;
}

/** 将预设 provider（如 qwen）的 API Key 同步为 OpenAI 兼容推理环境变量 */
export function syncPresetProviderEnvFile(
  envPath: string,
  provider: string,
  options?: { baseUrl?: string; apiKey?: string; allowExistingApiKey?: boolean },
): Record<string, string> {
  const providerInfo = PROVIDER_KEY_MAP[provider];
  const isCustom = provider === "custom" || (!providerInfo && provider !== "");
  if (!providerInfo && !isCustom) return {};

  let envContent = "";
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, "utf-8");
  }
  const parsed = parseEnvLines(envContent);
  const allowExistingApiKey = options?.allowExistingApiKey !== false;

  let apiKey = (options?.apiKey || "").trim();
  if (!apiKey && allowExistingApiKey && providerInfo) {
    apiKey = (parsed[providerInfo.envKey] || "").trim();
  } else if (!apiKey && allowExistingApiKey && isCustom) {
    apiKey = (parsed.OPENAI_API_KEY || parsed.CUSTOM_API_KEY || "").trim();
  }
  if (!apiKey && allowExistingApiKey && isCustom) {
    for (const info of Object.values(PROVIDER_KEY_MAP)) {
      const value = (parsed[info.envKey] || "").trim();
      if (value) {
        apiKey = value;
        break;
      }
    }
  }

  const baseUrl =
    (options?.baseUrl || "").trim() ||
    (providerInfo?.baseUrl || "").trim() ||
    (parsed.OPENAI_BASE_URL || parsed.CUSTOM_API_BASE_URL || "").trim();

  const envKey = providerInfo?.envKey || "OPENAI_API_KEY";
  const keysToRemove = new Set(PRESET_ENV_SYNC_KEYS);
  keysToRemove.add(envKey);

  const lines = envContent
    .split("\n")
    .filter((line) => {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) return true;
      const key = line.slice(0, eqIdx).trim();
      return !keysToRemove.has(key);
    });

  const inferenceProvider = getHermesInferenceProvider(provider);
  const isNativeProvider = inferenceProvider !== "custom";

  if (apiKey) {
    if (providerInfo) lines.push(`${envKey}=${apiKey}`);
    if (!isNativeProvider) {
      lines.push(`OPENAI_API_KEY=${apiKey}`);
      lines.push(`CUSTOM_API_KEY=${apiKey}`);
    }
  }
  lines.push(`HERMES_INFERENCE_PROVIDER=${inferenceProvider}`);
  if (baseUrl) {
    if (providerInfo?.baseEnvKey) {
      lines.push(`${providerInfo.baseEnvKey}=${baseUrl}`);
    }
    if (!isNativeProvider) {
      lines.push(`OPENAI_BASE_URL=${baseUrl}`);
      lines.push(`CUSTOM_API_BASE_URL=${baseUrl}`);
      lines.push(`CUSTOM_BASE_URL=${baseUrl}`);
    }
  }

  ensureDir(path.dirname(envPath));
  safeWriteFile(envPath, lines.filter(Boolean).join("\n").trimEnd() + "\n");

  const synced: Record<string, string> = {
    HERMES_INFERENCE_PROVIDER: inferenceProvider,
  };
  if (apiKey) {
    if (providerInfo) synced[envKey] = apiKey;
    if (!isNativeProvider) {
      synced.OPENAI_API_KEY = apiKey;
      synced.CUSTOM_API_KEY = apiKey;
    }
  }
  if (baseUrl) {
    if (providerInfo?.baseEnvKey) synced[providerInfo.baseEnvKey] = baseUrl;
    if (!isNativeProvider) {
      synced.OPENAI_BASE_URL = baseUrl;
      synced.CUSTOM_API_BASE_URL = baseUrl;
      synced.CUSTOM_BASE_URL = baseUrl;
    }
  }
  return synced;
}

export const HERMES_HOME: string =
  process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
export const APP_DATA_DIR: string = path.join(os.homedir(), ".lyhermes");
export const DEFAULT_HERMES_BIN: string =
  process.platform === "win32"
    ? path.join(HERMES_HOME, "hermes-agent", "venv", "Scripts", "hermes.exe")
    : path.join(HERMES_HOME, "hermes-agent", "venv", "bin", "hermes");
export const PROFILES_DIR: string = path.join(HERMES_HOME, "profiles");
export const DEFAULT_API_HOST: string = "127.0.0.1";
export const DEFAULT_API_PORT: number = 8644;
const HERMES_GITEE_REPO_URL = "https://gitee.com/YanPro/ly-hermes-agent";
const HERMES_GITEE_BRANCH_API =
  "https://gitee.com/api/v5/repos/YanPro/ly-hermes-agent/branches/main";
const HERMES_GITEE_COMPARE_API =
  "https://gitee.com/api/v5/repos/YanPro/ly-hermes-agent/compare";
const HERMES_GITEE_ZIP_URL = "http://120.26.42.178:88/main.zip";
const HERMES_REPO_DIR = path.join(HERMES_HOME, "hermes-agent");
const HERMES_SOURCE_FILE = path.join(HERMES_REPO_DIR, ".hermes-desktop-source.json");
const DESKTOP_REQUIRED_PY_PACKAGES = [
  "aiohttp==3.13.3",
  "websockets==15.0.1",
];
export const WALLPAPERS_DIR: string = path.join(
  APP_DATA_DIR,
  "wallpapers",
);

export function getHermesEnhancedPath(basePath = process.env.PATH || ""): string {
  const extraPaths: string[] = [];
  if (process.platform === "win32") {
    const home = os.homedir();
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    extraPaths.push(
      path.join(programFiles, "Git", "cmd"),
      path.join(programFiles, "Git", "bin"),
      path.join(programFilesX86, "Git", "cmd"),
      path.join(programFilesX86, "Git", "bin"),
      path.join(localAppData, "Programs", "Git", "cmd"),
      path.join(localAppData, "Programs", "Git", "bin"),
      path.join(localAppData, "Microsoft", "WindowsApps"),
      path.join(home, "AppData", "Local", "Microsoft", "WindowsApps"),
    );
  }

  const parts = basePath.split(path.delimiter).filter(Boolean);
  const seen = new Set(parts.map((item) => item.toLowerCase()));
  for (const item of extraPaths) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      parts.push(item);
      seen.add(key);
    }
  }
  return parts.join(path.delimiter);
}

export function findWindowsGitBashPath(env: NodeJS.ProcessEnv = process.env): string | null {
  if (process.platform !== "win32") return null;
  const configured = env.HERMES_GIT_BASH_PATH;
  if (configured && fs.existsSync(configured)) return configured;

  const home = os.homedir();
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
  const candidates = [
    path.join(programFiles, "Git", "bin", "bash.exe"),
    path.join(programFilesX86, "Git", "bin", "bash.exe"),
    path.join(localAppData, "Programs", "Git", "bin", "bash.exe"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

export function createHermesProcessEnv(
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env = Object.assign({}, process.env, {
    HOME: os.homedir(),
    HERMES_HOME,
    PATH: getHermesEnhancedPath(process.env.PATH || ""),
  }, overrides);
  const gitBashPath = findWindowsGitBashPath(env);
  if (gitBashPath) {
    env.HERMES_GIT_BASH_PATH = gitBashPath;
  }
  return env;
}

export const RUNTIME_DEFAULTS: Record<string, unknown> = {
  memory: { memory_enabled: true, memory_char_limit: 12200, user_char_limit: 5375, flush_min_turns: 6 },
  compression: { enabled: true, target_ratio: 0.2, threshold: 0.5, protect_last_n: 20 },
  terminal: { timeout: 180, lifetime_seconds: 300 },
  code_execution: { max_tool_calls: 50, timeout: 300 },
  browser: { inactivity_timeout: 120 },
  session_reset: { idle_minutes: 1440, at_hour: 4 },
};

function deepMergeDefaults(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...source };
  for (const [key, val] of Object.entries(target)) {
    if (
      val !== null &&
      typeof val === "object" &&
      !Array.isArray(val) &&
      (result[key] as unknown) !== null &&
      typeof result[key] === "object" &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMergeDefaults(
        val as Record<string, unknown>,
        result[key] as Record<string, unknown>,
      );
    } else {
      result[key] = val;
    }
  }
  return result;
}

const _configCache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 5000;

export function getCached<T>(key: string): T | undefined {
  const entry = _configCache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _configCache.delete(key);
    return undefined;
  }
  return entry.data as T;
}

export function setCache(key: string, data: unknown): void {
  _configCache.set(key, { data, ts: Date.now() });
}

export function invalidateCache(prefix: string): void {
  for (const key of _configCache.keys()) {
    if (key.startsWith(prefix)) _configCache.delete(key);
  }
}

export function loadAppConfig(): Record<string, unknown> {
  const cached = getCached<Record<string, unknown>>("appconfig");
  if (cached) return cached;
  const defaults: Record<string, unknown> = {
    defaults: {
      model: "",
      provider: "",
      base_url: "",
      api_key: "",
      tools: [
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
      ],
      idle_timeout: 30,
      max_online: 5,
      startup_timeout: 30,
    },
    runtime: RUNTIME_DEFAULTS,
    ui: { theme: "dark", language: "zh-CN", font_size: 14 },
    hermes: {
      home: HERMES_HOME,
      bin: process.env.HERMES_BIN || DEFAULT_HERMES_BIN,
      port_range: [8644, 8743],
    },
  };
  const data = getSetting<Record<string, unknown>>("app", "config", defaults);
  setCache("appconfig", data);
  return data;
}

export function saveAppConfig(config: Record<string, unknown>): void {
  setSetting("app", "config", config);
  invalidateCache("appconfig");
}

export function loadPreferences(): Record<string, unknown> {
  return getSetting<Record<string, unknown>>("app", "preferences", {});
}

export function savePreferences(prefs: Record<string, unknown>): void {
  setSetting("app", "preferences", prefs);
}

export function getProfilePath(profileName: string): string {
  if (profileName === "default") return HERMES_HOME;
  return path.join(PROFILES_DIR, profileName);
}

export function readHermesEnv(profileName: string): Record<string, string> {
  const envPath = path.join(getProfilePath(profileName), ".env");
  if (!fs.existsSync(envPath)) {
    if (profileName !== "default") {
      const globalEnvPath = path.join(HERMES_HOME, ".env");
      if (fs.existsSync(globalEnvPath)) {
        return readEnvFile(globalEnvPath);
      }
    }
    return {};
  }
  return readEnvFile(envPath);
}

export function readEnvFile(envPath: string): Record<string, string> {
  const result: Record<string, string> = {};
  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed
          .slice(eq + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        result[key] = val;
      }
    }
  } catch {
    /* fall through */
  }
  return result;
}

export function runHermesCli(
  args: string[],
  profileName?: string,
  timeoutMs = 60000,
): string {
  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
  const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
  const effectiveProfile = profileName || "default";
  const hermesHomeForProfile = effectiveProfile === "default"
    ? HERMES_HOME
    : getProfilePath(effectiveProfile);
  const spawnOpts: Record<string, unknown> = {
    encoding: "utf-8",
    timeout: timeoutMs,
    env: createHermesProcessEnv({
      HERMES_HOME: hermesHomeForProfile,
    }),
    shell: process.platform === "win32",
  };
  const hermesEnv = readHermesEnv(effectiveProfile);
  for (const [key, value] of Object.entries(hermesEnv)) {
    if (value && !(spawnOpts.env as Record<string, string>)[key]) {
      (spawnOpts.env as Record<string, string>)[key] = value;
    }
  }
  const safeArgs = args.map((a) => String(a).slice(0, 500));
  try {
    const out = execFileSync(hermesBin, safeArgs, spawnOpts as Parameters<typeof execFileSync>[2]);
    return (out as string).trim();
  } catch (e: unknown) {
    const err = e as { stderr?: Buffer | string; message?: string; code?: string };
    const msg = (err.stderr && err.stderr.toString().trim()) || err.message || "";
    if (err.code === "ETIMEDOUT") {
      return "命令执行超时，请检查 hermes-agent 是否正常运行，或稍后重试";
    }
    return msg;
  }
}

export function getModelFromProfile(profileName: string): string {
  const configPath = path.join(getProfilePath(profileName), "config.yaml");
  try {
    if (fs.existsSync(configPath)) {
      const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      const model = cfg.model as Record<string, unknown> | undefined;
      if (model) {
        if (model.default) return model.default as string;
        if (model.name) return model.name as string;
      }
    }
  } catch {
    /* fall through */
  }
  const env = readHermesEnv(profileName);
  return env.HERMES_MODEL || "";
}

export function ensureApiServerConfig(): void {
  try {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    if (!fs.existsSync(configPath)) return;
    const content = fs.readFileSync(configPath, "utf-8");
    if (/api_server/i.test(content)) return;
    const addition =
      '\nplatforms:\n  api_server:\n    enabled: true\n    extra:\n      port: 8642\n      host: "127.0.0.1"\n';
    fs.appendFileSync(configPath, addition, "utf-8");
  } catch {
    /* fall through */
  }
}

export function isApiServerReady(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: DEFAULT_API_HOST,
        port,
        path: "/health",
        method: "GET",
        timeout: 2000,
      },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

export function validateProfileName(name: string): boolean {
  if (!name || typeof name !== "string") return false;
  if (!/^[a-z0-9_][a-z0-9_-]{0,63}$/.test(name)) return false;
  return true;
}

function stripHermesCliUpdateInfo(versionText: string): string {
  return versionText
    .split(/\r?\n/)
    .filter((line) => !/^\s*(Update available:|Up to date\b|✓\s*Already up to date|⚕\s*Update available)/i.test(line))
    .join("\n")
    .trim();
}

function ensureHermesGiteeOrigin(): void {
  const hermesRepoDir = HERMES_REPO_DIR;
  if (!fs.existsSync(path.join(hermesRepoDir, ".git"))) return;
  execFileSync("git", ["remote", "set-url", "origin", HERMES_GITEE_REPO_URL], {
    cwd: hermesRepoDir,
    timeout: 10000,
  });
}

function clearHermesCliUpdateCache(): void {
  try {
    fs.rmSync(path.join(HERMES_HOME, ".update_check"), { force: true });
  } catch {
    /* ignore */
  }
}

function prepareHermesVersionCheck(): void {
  ensureHermesGiteeOrigin();
  clearHermesCliUpdateCache();
}

function readGiteeMainSha(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(
      HERMES_GITEE_BRANCH_API,
      { timeout: 10000, headers: { "User-Agent": "HermesDesktop" } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            resolve(data?.commit?.sha || data?.commit?.id || null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function compareGiteeCommits(localCommit: string, remoteSha: string): Promise<number> {
  return new Promise((resolve) => {
    const req = https.get(
      `${HERMES_GITEE_COMPARE_API}/${localCommit}...${remoteSha}`,
      { timeout: 10000, headers: { "User-Agent": "HermesDesktop" } },
      (res) => {
        let body = "";
        res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
        res.on("end", () => {
          try {
            const data = JSON.parse(body);
            const commits = data?.commits;
            resolve(Array.isArray(commits) ? commits.length : (data?.total_commits || 0));
          } catch {
            resolve(0);
          }
        });
      },
    );
    req.on("error", () => resolve(0));
    req.on("timeout", () => { req.destroy(); resolve(0); });
  });
}

async function getHermesGiteeUpdateInfo(): Promise<string> {
  try {
    const canUseGit = hasSystemGit() && fs.existsSync(path.join(HERMES_REPO_DIR, ".git"));
    const localCommit = canUseGit
      ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERMES_REPO_DIR, timeout: 10000 }).toString().trim()
      : readDesktopSourceCommit();
    const remoteSha = await readGiteeMainSha();
    if (!remoteSha) return "";
    if (localCommit && localCommit === remoteSha) return "\nUp to date";

    if (localCommit && canUseGit) {
      let behindCount = 0;
      try {
        execFileSync("git", ["fetch", "origin", "main", "--quiet"], {
          cwd: HERMES_REPO_DIR,
          timeout: 30000,
        });
        behindCount = Number(
          execFileSync("git", ["rev-list", "--count", "HEAD..origin/main"], {
            cwd: HERMES_REPO_DIR,
            timeout: 10000,
          }).toString().trim(),
        ) || 0;
      } catch {
        behindCount = await compareGiteeCommits(localCommit, remoteSha);
      }
      if (behindCount > 0) return `\nUpdate available: ${behindCount} commits behind ${remoteSha.slice(0, 8)}`;
      return localCommit === remoteSha ? "\nUp to date" : `\nUpdate available: Gitee sync available ${remoteSha.slice(0, 8)}`;
    }

    return `\nUpdate available: Gitee sync available ${remoteSha.slice(0, 8)}`;
  } catch {
    return "";
  }
}

function getHermesSourceInfo(): string {
  try {
    if (hasSystemGit() && fs.existsSync(path.join(HERMES_REPO_DIR, ".git"))) {
      const commit = execFileSync("git", ["rev-parse", "--short=8", "HEAD"], {
        cwd: HERMES_REPO_DIR,
        timeout: 10000,
      }).toString().trim();
      if (commit) return `\nCommit: ${commit}`;
    }
    const markerCommit = readDesktopSourceCommit();
    if (markerCommit) return `\nCommit: ${markerCommit.slice(0, 8)}`;
  } catch {
    /* ignore */
  }
  return "";
}

function getHermesVenvPython(): string {
  return process.platform === "win32"
    ? path.join(HERMES_REPO_DIR, "venv", "Scripts", "python.exe")
    : path.join(HERMES_REPO_DIR, "venv", "bin", "python");
}

function hasSystemGit(): boolean {
  try {
    execFileSync("git", ["--version"], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function readDesktopSourceCommit(): string | null {
  try {
    if (!fs.existsSync(HERMES_SOURCE_FILE)) return null;
    const marker = JSON.parse(fs.readFileSync(HERMES_SOURCE_FILE, "utf-8"));
    return typeof marker.commit === "string" ? marker.commit : null;
  } catch {
    return null;
  }
}

function writeDesktopSourceMarker(commit: string | null, method: "git" | "zip"): void {
  try {
    fs.writeFileSync(
      HERMES_SOURCE_FILE,
      JSON.stringify({
        repo: HERMES_GITEE_REPO_URL,
        branch: "main",
        commit,
        method,
        updatedAt: new Date().toISOString(),
      }, null, 2),
      "utf-8",
    );
  } catch {
    /* ignore */
  }
}

interface EmployeeSoulDraft {
  name: string;
  displayName: string;
  role: string;
  soul: string;
}

type EmployeeSoulStyle = "balanced" | "detailed" | "expert" | "companion" | "executor";

interface ModelRequestConfig {
  provider: string;
  model: string;
  baseUrl: string;
  apiKey: string;
}

function stripJsonFence(content: string): string {
  const trimmed = content.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match ? match[1] : trimmed).trim();
}

function toEmployeeSlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return validateProfileName(slug) ? slug : `employee_${Date.now().toString(36)}`;
}

function getSoulStyleInstruction(style: string | undefined): string {
  const styles: Record<EmployeeSoulStyle, string> = {
    balanced: "平衡型：兼顾人格鲜明、专业可靠和日常可用，适合默认员工。",
    detailed: "详细型：内容更完整，SOUL.md 不少于 900 个中文字符，条理清楚，覆盖更多行为细节。",
    expert: "专家型：强调专业判断、结构化分析、行业方法论、风险提示和高质量交付。",
    companion: "陪伴型：强调长期关系、温和表达、记忆敏感度、情绪理解和稳定陪伴，但不要过度亲密。",
    executor: "执行型 Agent：强调目标拆解、行动计划、工具调用、进度反馈、交付检查和结果导向。",
  };
  const key = (style || "balanced") as EmployeeSoulStyle;
  return styles[key] || styles.balanced;
}

function syncAppConfigDefaults(modelConfig: {
  model?: string;
  provider?: string;
  baseUrl?: string;
  apiKey?: string;
}): void {
  const appConfig = loadAppConfig();
  if (!appConfig.defaults) appConfig.defaults = {};
  const defaults = appConfig.defaults as Record<string, unknown>;
  if (modelConfig.model) defaults.model = modelConfig.model;
  if (modelConfig.provider) defaults.provider = modelConfig.provider;
  if (modelConfig.baseUrl) defaults.base_url = modelConfig.baseUrl;
  if (modelConfig.apiKey) defaults.api_key = modelConfig.apiKey;
  saveAppConfig(appConfig);
}

function resolveSavedModelConfig(
  provider: string,
  model: string,
  baseUrl: string,
  apiKey: string,
): ModelRequestConfig {
  const savedModels = loadSavedModels();
  const matched =
    savedModels.find(
      (entry) =>
        entry.model === model &&
        entry.provider === provider &&
        (entry.apiKey as string)?.trim(),
    ) ||
    savedModels.find((entry) => (entry.apiKey as string)?.trim()) ||
    savedModels.find((entry) => entry.model && entry.provider);

  if (!matched) return { provider, model, baseUrl, apiKey };

  const matchedProvider = (matched.provider as string) || provider;
  const matchedModel = (matched.model as string) || model;
  const matchedBaseUrl =
    (matched.baseUrl as string) ||
    baseUrl ||
    PROVIDER_KEY_MAP[matchedProvider]?.baseUrl ||
    "";
  const matchedApiKey = (matched.apiKey as string)?.trim() || apiKey;

  return {
    provider: matchedProvider,
    model: matchedModel,
    baseUrl: matchedBaseUrl,
    apiKey: matchedApiKey,
  };
}

function getDefaultModelRequestConfig(): ModelRequestConfig {
  const appConfig = loadAppConfig();
  const defaults = (appConfig.defaults as Record<string, unknown>) || {};
  const configPath = path.join(HERMES_HOME, "config.yaml");
  let provider = (defaults.provider as string) || "";
  let model = (defaults.model as string) || "";
  let baseUrl = (defaults.base_url as string) || "";

  try {
    if (fs.existsSync(configPath)) {
      const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      const m = cfg.model as Record<string, unknown> | undefined;
      if (m) {
        provider = (m.provider as string) || provider;
        model = (m.default as string) || (m.name as string) || model;
        baseUrl = (m.base_url as string) || baseUrl;
      }
    }
  } catch {
    /* fall through */
  }

  const providerInfo = PROVIDER_KEY_MAP[provider];
  if (!baseUrl) baseUrl = providerInfo?.baseUrl || "";
  const env = readHermesEnv("default");
  let apiKey =
    (providerInfo?.envKey ? env[providerInfo.envKey] : "") ||
    env.OPENAI_API_KEY ||
    env.CUSTOM_API_KEY ||
    (defaults.api_key as string) ||
    "";

  return resolveSavedModelConfig(provider, model, baseUrl, apiKey);
}

export function getSoulGenerationModelInfo(): {
  model: string;
  provider: string;
  ready: boolean;
  hint?: string;
} {
  const config = getDefaultModelRequestConfig();
  if (!config.model) {
    return { model: "", provider: "", ready: false, hint: "请先在设置中选择默认模型" };
  }
  if (!config.baseUrl) {
    return {
      model: config.model,
      provider: config.provider,
      ready: false,
      hint: "请先在设置中配置模型 Base URL",
    };
  }
  if (!config.apiKey) {
    return {
      model: config.model,
      provider: config.provider,
      ready: false,
      hint: "请先在设置中配置 API Key",
    };
  }
  return { model: config.model, provider: config.provider, ready: true };
}

function postChatCompletion(
  config: ModelRequestConfig,
  messages: Array<{ role: string; content: string }>,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!config.model) {
      reject(new Error("请先在设置里选择默认模型"));
      return;
    }
    if (!config.baseUrl) {
      reject(new Error("请先在设置里配置模型 Base URL"));
      return;
    }
    if (!config.apiKey) {
      reject(new Error("请先在设置里配置 API Key"));
      return;
    }
    if (isHermesGatewayBaseUrl(config.baseUrl)) {
      reject(new Error("内部 AI 生成不能使用 Hermes Agent 网关，请在设置里选择具体模型服务商或自定义直连 Base URL"));
      return;
    }

    let target: URL;
    try {
      target = new URL(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`);
    } catch {
      reject(new Error("模型 Base URL 格式不正确"));
      return;
    }

    const body = JSON.stringify({
      model: config.model,
      messages,
      temperature: 0.7,
      max_tokens: 3200,
      stream: false,
    });
    const client = target.protocol === "http:" ? http : https;
    const req = client.request(
      {
        hostname: target.hostname,
        port: target.port || undefined,
        path: `${target.pathname}${target.search}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
          Authorization: `Bearer ${config.apiKey}`,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk: Buffer) => { raw += chunk.toString(); });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw || "{}");
            if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
              reject(new Error(parsed?.error?.message || `模型请求失败：HTTP ${res.statusCode}`));
              return;
            }
            const content = parsed?.choices?.[0]?.message?.content;
            if (!content || typeof content !== "string") {
              reject(new Error("模型没有返回可用内容"));
              return;
            }
            resolve(content);
          } catch (e: unknown) {
            reject(new Error((e as Error).message || "模型响应解析失败"));
          }
        });
      },
    );
    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("模型请求超时"));
    });
    req.write(body);
    req.end();
  });
}

function isHermesGatewayBaseUrl(baseUrl: string): boolean {
  try {
    const target = new URL(baseUrl);
    const hostname = target.hostname.toLowerCase();
    if (!["127.0.0.1", "localhost", "::1"].includes(hostname)) return false;
    const port = Number(target.port || (target.protocol === "https:" ? 443 : 80));
    const appConfig = loadAppConfig();
    const hermes = (appConfig.hermes as Record<string, unknown>) || {};
    const range = Array.isArray(hermes.port_range) ? hermes.port_range.map(Number) : [DEFAULT_API_PORT, DEFAULT_API_PORT + 99];
    const start = Number.isFinite(range[0]) ? range[0] : DEFAULT_API_PORT;
    const end = Number.isFinite(range[1]) ? range[1] : DEFAULT_API_PORT + 99;
    return port >= start && port <= end;
  } catch {
    return false;
  }
}

export async function generateEmployeeSoulDraft(input: {
  prompt?: string;
  name?: string;
  displayName?: string;
  role?: string;
  style?: string;
  refinement?: string;
  existingSoul?: string;
}): Promise<{ success: boolean; draft?: EmployeeSoulDraft; error?: string }> {
  const prompt = (input.prompt || "").trim();
  const refinement = (input.refinement || "").trim();
  const existingSoul = (input.existingSoul || "").trim();
  if (!prompt && !existingSoul) return { success: false, error: "请输入要创建的人物、角色或岗位" };

  try {
    const modelConfig = getDefaultModelRequestConfig();
    const styleInstruction = getSoulStyleInstruction(input.style);
    const messages = [
      {
        role: "system",
        content:
          "你是落云 Hermes 的虚拟员工设定生成器。根据用户输入生成员工创建草稿，只返回 JSON，不要 Markdown。字段必须是 name、displayName、role、soul。name 必须是 3-48 位小写英文、数字、下划线或连字符，适合做系统标识。displayName 使用中文。role 是简短岗位名。soul 是可直接写入 SOUL.md 的中文设定。SOUL.md 必须具体、可执行、结构清晰，默认不少于 700 个中文字符；若用户选择详细型，则不少于 900 个中文字符。soul 必须包含这些 Markdown 小节：# 身份定位、# 核心能力、# 沟通风格、# 工作方式、# 记忆偏好、# 工具使用原则、# 边界与禁忌、# 不确定性处理、# 输出偏好。不要写空泛宣传语，要写这个员工在真实任务里会如何判断和行动。若用户输入真实历史人物或公众人物，只能生成“风格/思想启发型助手”，不得声称自己就是本人，不编造私人经历或未公开观点；若像在请求在世真实人物，也必须避免冒充本人。",
      },
      {
        role: "user",
        content: JSON.stringify({
          prompt,
          style: styleInstruction,
          refinement,
          existingSoul,
          currentName: input.name || "",
          currentDisplayName: input.displayName || "",
          currentRole: input.role || "",
        }),
      },
    ];
    const content = await postChatCompletion(modelConfig, messages);
    const parsed = JSON.parse(stripJsonFence(content)) as Partial<EmployeeSoulDraft>;
    const displayName = String(parsed.displayName || input.displayName || prompt).trim().slice(0, 80);
    const role = String(parsed.role || input.role || "虚拟员工").trim().slice(0, 80);
    const soul = String(parsed.soul || "").trim();
    if (!soul) return { success: false, error: "模型没有生成灵魂设定，请换个描述再试" };
    const name = toEmployeeSlug(String(parsed.name || input.name || displayName || prompt));
    return {
      success: true,
      draft: { name, displayName, role, soul },
    };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message || "生成失败" };
  }
}

export async function parseMcpDescription(input: {
  description?: string;
}): Promise<{ success: boolean; config?: McpServerInput; error?: string }> {
  const description = String(input.description || "").trim();
  if (!description) return { success: false, error: "请输入 MCP 说明" };

  try {
    const modelConfig = getDefaultModelRequestConfig();
    const messages = [
      {
        role: "system",
        content:
          "你是 MCP 配置解析器。用户会粘贴 MCP 安装说明、命令、文档片段或自然语言描述。你只返回 JSON，不要 Markdown。JSON 字段包括：name、transport、command、args、url、env、headers、timeout、connect_timeout。transport 只能是 stdio、http、sse。stdio 必须有 command 和 args 数组；http/sse 必须有 url。不要编造密钥值；如果说明里出现需要用户填写的密钥，只在 env 或 headers 中放空字符串或占位变量名。name 必须是 1-64 位字母、数字、下划线或连字符。识别 MCP Toolbox for Databases 时，优先生成 name=db_toolbox, transport=stdio, command=toolbox，并把 --tools-file 和 tools.yaml 路径放进 args。",
      },
      {
        role: "user",
        content: description,
      },
    ];
    const content = await postChatCompletion(modelConfig, messages);
    const parsed = JSON.parse(stripJsonFence(content)) as Record<string, unknown>;
    const config: McpServerInput = {
      name: String(parsed.name || "my_mcp").trim(),
      transport: String(parsed.transport || (parsed.url ? "http" : "stdio")).trim(),
      command: String(parsed.command || "").trim(),
      args: Array.isArray(parsed.args) ? parsed.args.map(String) : [],
      url: String(parsed.url || "").trim(),
      env: parsed.env && typeof parsed.env === "object" && !Array.isArray(parsed.env)
        ? Object.fromEntries(Object.entries(parsed.env as Record<string, unknown>).map(([k, v]) => [k, String(v || "")]))
        : {},
      headers: parsed.headers && typeof parsed.headers === "object" && !Array.isArray(parsed.headers)
        ? Object.fromEntries(Object.entries(parsed.headers as Record<string, unknown>).map(([k, v]) => [k, String(v || "")]))
        : {},
      timeout: Number(parsed.timeout || 120),
      connect_timeout: Number(parsed.connect_timeout || 60),
    };
    return { success: true, config };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message || "解析失败" };
  }
}

function downloadFile(url: string, dest: string, timeoutMs: number): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const client = url.startsWith("http://") ? http.get : https.get;
    const req = client(url, (res) => {
      let settled = false;
      const finish = (result: { success: boolean; error?: string }): void => {
        if (settled) return;
        settled = true;
        resolve(result);
      };
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        downloadFile(res.headers.location, dest, timeoutMs).then(resolve);
        return;
      }
      if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
        finish({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }
      const expectedBytes = Number(res.headers["content-length"] || 0);
      let receivedBytes = 0;
      res.on("data", (chunk: Buffer) => {
        receivedBytes += chunk.length;
      });
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        if (expectedBytes > 0 && receivedBytes !== expectedBytes) {
          finish({
            success: false,
            error: `下载不完整：${receivedBytes}/${expectedBytes} bytes`,
          });
          return;
        }
        finish({ success: true });
      });
      file.on("error", (err) => finish({ success: false, error: err.message }));
      res.on("aborted", () => {
        finish({ success: false, error: `下载中断：${receivedBytes}/${expectedBytes || "?"} bytes` });
      });
      res.on("error", (err) => finish({ success: false, error: err.message }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ success: false, error: "下载超时" });
    });
    req.on("error", (err) => resolve({ success: false, error: err.message }));
  });
}

function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve({ success: false, stdout, stderr: stderr + "\n(超时)" });
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      resolve({ success: code === 0, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

function removeDir(target: string): void {
  if (!fs.existsSync(target)) return;
  fs.rmSync(target, { recursive: true, force: true });
}

async function updateHermesFromGiteeZip(
  env: Record<string, string>,
  emit: (text: string) => void,
  remoteSha: string | null,
): Promise<{ success: boolean; error?: string }> {
  const python = getHermesVenvPython();
  if (!fs.existsSync(python)) {
    return { success: false, error: "未找到 Hermes 虚拟环境 Python，无法执行无 Git 更新，请重新安装引擎" };
  }

  const tmpRoot = path.join(HERMES_HOME, ".update-tmp");
  const zipPath = path.join(tmpRoot, "hermes-agent.zip");
  const extractDir = path.join(tmpRoot, "repo");
  const venvBackup = path.join(tmpRoot, "venv");

  removeDir(tmpRoot);
  ensureDir(tmpRoot);
  emit("未检测到可用 Git，正在从 Gitee 下载引擎压缩包...\n");
  const download = await downloadFile(HERMES_GITEE_ZIP_URL, zipPath, 300000);
  if (!download.success) {
    return { success: false, error: `Gitee 压缩包下载失败: ${download.error || "网络错误"}` };
  }

  try {
    const header = fs.readFileSync(zipPath).slice(0, 4);
    if (header[0] !== 0x50 || header[1] !== 0x4b) {
      return { success: false, error: "下载的文件不是有效 ZIP，请检查网络" };
    }
  } catch {
    return { success: false, error: "ZIP 文件校验失败" };
  }

  ensureDir(extractDir);
  emit("压缩包下载完成，正在解压...\n");
  const unzip = await runProcess(python, ["-m", "zipfile", "-e", zipPath, extractDir], tmpRoot, env, 120000);
  if (!unzip.success) {
    return { success: false, error: `解压失败: ${unzip.stderr.slice(-300)}` };
  }

  const entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const match = entries.find((entry) => /ly-hermes-agent/i.test(entry.name));
  const repoRoot = entries.length === 1
    ? path.join(extractDir, entries[0].name)
    : match
      ? path.join(extractDir, match.name)
      : extractDir;
  if (!fs.existsSync(path.join(repoRoot, "hermes")) && !fs.existsSync(path.join(repoRoot, "pyproject.toml"))) {
    return { success: false, error: "解压后的目录结构不符合预期" };
  }

  const currentVenv = path.join(HERMES_REPO_DIR, "venv");
  if (fs.existsSync(currentVenv)) {
    fs.renameSync(currentVenv, venvBackup);
  }
  removeDir(HERMES_REPO_DIR);
  fs.renameSync(repoRoot, HERMES_REPO_DIR);
  if (fs.existsSync(venvBackup)) {
    fs.renameSync(venvBackup, path.join(HERMES_REPO_DIR, "venv"));
  }

  emit("正在刷新 Python 依赖...\n");
  const pipArgs = [
    "-m",
    "pip",
    "install",
    "--prefer-binary",
    "--upgrade-strategy",
    "only-if-needed",
    "--retries",
    "3",
    "--timeout",
    "60",
    "-i",
    "https://pypi.tuna.tsinghua.edu.cn/simple",
    "--trusted-host",
    "pypi.tuna.tsinghua.edu.cn",
    "-e",
    ".",
    ...DESKTOP_REQUIRED_PY_PACKAGES,
  ];
  const install = await runProcess(getHermesVenvPython(), pipArgs, HERMES_REPO_DIR, env, 600000);
  if (!install.success) {
    return { success: false, error: `依赖刷新失败: ${install.stderr.slice(-500)}` };
  }

  writeDesktopSourceMarker(remoteSha, "zip");
  removeDir(tmpRoot);
  return { success: true };
}

function loadSavedModels(): Array<Record<string, unknown>> {
  return loadDbSavedModels();
}

function saveSavedModels(models: Array<Record<string, unknown>>): void {
  saveDbSavedModels(models);
}

export function registerConfigIpcHandlers(): void {
  webIpc("get-config", async () => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    if (!fs.existsSync(configPath)) return null;
    try {
      return yaml.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return null;
    }
  });

  webIpc("get-env", async () => {
    const env = readHermesEnv("default");
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
  });

  webIpc("get-hermes-home", async () => {
    return HERMES_HOME;
  });

  webIpc("check-hermes-install", async () => {
    const result: Record<string, unknown> = {
      installed: false,
      configured: false,
      hasApiKey: false,
      version: null,
    };
    const appConfig = loadAppConfig();
    const hermesBin = (appConfig.hermes as Record<string, unknown>)?.bin as string || DEFAULT_HERMES_BIN;
    try {
      const versionOut = execFileSync(hermesBin, ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
        env: createHermesProcessEnv({ HERMES_HOME }),
      }).trim();
      result.installed = true;
      const vMatch = versionOut.match(/(\d+\.\d+\.\d+)/);
      if (vMatch) result.version = vMatch[1];
    } catch {
      /* not installed */
    }
    if (fs.existsSync(path.join(HERMES_HOME, "config.yaml"))) {
      result.configured = true;
    }
    const envPath = path.join(HERMES_HOME, ".env");
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, "utf-8");
      if (/API_KEY\s*=\s*\S+/.test(envContent)) result.hasApiKey = true;
    }
    return result;
  });

  webIpc("get-model-config", async () => {
    const model = getModelFromProfile("default");
    const configPath = path.join(HERMES_HOME, "config.yaml");
    let provider = "";
    let baseUrl = "";
    try {
      if (fs.existsSync(configPath)) {
        const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
        const m = cfg.model as Record<string, unknown> | undefined;
        if (m) {
          provider = (m.provider as string) || "";
          baseUrl = (m.base_url as string) || "";
        }
      }
    } catch {
      /* fall through */
    }
    return { provider, model, baseUrl };
  });

  webIpc("get-available-models", async () => {
    const { getApiPortForProfile } = await import("./employees");
    const port = getApiPortForProfile("default");
    if (!port) return { models: [] };
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: DEFAULT_API_HOST,
          port,
          path: "/v1/models",
          method: "GET",
          timeout: 5000,
        },
        (res) => {
          let data = "";
          res.on("data", (chunk: Buffer) => (data += chunk));
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ models: (parsed && parsed.data) || [] });
            } catch {
              resolve({ models: [] });
            }
          });
        },
      );
      req.on("error", () => resolve({ models: [] }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ models: [] });
      });
      req.end();
    });
  });

  registerWebApiChannel("employee:generate-soul-draft", (input: unknown) =>
    generateEmployeeSoulDraft((input as {
      prompt?: string;
      name?: string;
      displayName?: string;
      role?: string;
      style?: string;
      refinement?: string;
      existingSoul?: string;
    }) || {}),
  );

  ipcHandle("employee:generate-soul-draft", async (_, input: {
    prompt?: string;
    name?: string;
    displayName?: string;
    role?: string;
    style?: string;
    refinement?: string;
    existingSoul?: string;
  }) => {
    return generateEmployeeSoulDraft(input || {});
  });

  ipcHandle("tools:mcp-list", async () => listMcpServers());
  ipcHandle("tools:mcp-save", async (_, input: McpServerInput) => saveMcpServer(input));
  ipcHandle("tools:mcp-delete", async (_, name: string) => deleteMcpServer(name));
  ipcHandle("tools:mcp-test", async (_, name: string) => testMcpServer(name));
  ipcHandle("tools:mcp-parse", async (_, description: string) => parseMcpDescription({ description }));

  webIpc("set-model", async (_, modelName: string) => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    try {
      let cfg: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      }
      if (!cfg.model) cfg.model = {};
      (cfg.model as Record<string, unknown>).default = modelName;
      ensureDir(HERMES_HOME);
      safeWriteFile(configPath, yamlStringify(cfg));
      return { success: true };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  webIpc("set-model-config", async (_, modelConfig: { model?: string; provider?: string; baseUrl?: string }) => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    try {
      let cfg: Record<string, unknown> = {};
      if (fs.existsSync(configPath)) {
        cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      }
      if (!cfg.model) cfg.model = {};
      const m = cfg.model as Record<string, unknown>;
      if (modelConfig.model) m.default = modelConfig.model;
      if (modelConfig.provider) m.provider = modelConfig.provider;
      if (modelConfig.baseUrl) m.base_url = modelConfig.baseUrl;
      ensureDir(HERMES_HOME);
      safeWriteFile(configPath, yamlStringify(cfg));
      syncAppConfigDefaults({
        model: modelConfig.model,
        provider: modelConfig.provider,
        baseUrl: modelConfig.baseUrl,
      });
      return { success: true };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  webIpc("get-soul-generation-model", async () => getSoulGenerationModelInfo());

  webIpc("list-saved-models", async () => {
    return loadSavedModels();
  });

  webIpc(
    "add-saved-model",
    async (
      _,
      name: string,
      provider: string,
      model: string,
      baseUrl: string,
      apiKey: string,
    ) => {
      const models = loadSavedModels();
      const existing = models.find(
        (m) => m.model === model && m.provider === provider,
      );
      if (existing) return existing;
      const entry: Record<string, unknown> = {
        id:
          Date.now().toString(36) +
          Math.random().toString(36).slice(2, 8),
        name: name,
        provider: provider,
        model: model,
        baseUrl: baseUrl || "",
        apiKey: apiKey || "",
        createdAt: Date.now(),
      };
      models.push(entry);
      saveSavedModels(models);
      return entry;
    },
  );

  webIpc("remove-saved-model", async (_, id: string) => {
    const models = loadSavedModels();
    const filtered = models.filter((m) => m.id !== id);
    if (filtered.length === models.length) return false;
    saveSavedModels(filtered);
    return true;
  });

  webIpc(
    "update-saved-model",
    async (
      _,
      id: string,
      name: string,
      provider: string,
      model: string,
      baseUrl: string,
      apiKey: string,
    ) => {
      const models = loadSavedModels();
      const entry = models.find((m) => m.id === id);
      if (!entry) return { error: "模型配置不存在" };
      const dup = models.find(
        (m) => m.id !== id && m.model === model && m.provider === provider,
      );
      if (dup) return { error: "相同 provider+model 的配置已存在" };
      entry.name = name;
      entry.provider = provider;
      entry.model = model;
      entry.baseUrl = baseUrl || "";
      entry.apiKey = apiKey || "";
      saveSavedModels(models);
      return { success: true, entry };
    },
  );

  webIpc(
    "apply-saved-model",
    async (_, id: string, profileName?: string) => {
      const models = loadSavedModels();
      const entry = models.find((m) => m.id === id);
      if (!entry) return { error: "模型配置不存在" };
      const name = profileName || "default";
      const profilePath = getProfilePath(name);
      const configPath = path.join(profilePath, "config.yaml");
      try {
        let cfg: Record<string, unknown> = {};
        if (fs.existsSync(configPath)) {
          cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
        }
        if (!cfg.model) cfg.model = {};
        const m = cfg.model as Record<string, unknown>;
        const previousProvider = (m.provider as string) || "";
        const provider = (entry.provider as string) || "";
        const baseUrl =
          (entry.baseUrl as string) ||
          PROVIDER_KEY_MAP[provider]?.baseUrl ||
          "";
        m.default = entry.model;
        m.provider = provider;
        if (baseUrl) {
          m.base_url = baseUrl;
        } else {
          delete m.base_url;
        }
        safeWriteFile(configPath, yamlStringify(cfg));

        let apiKey = (entry as Record<string, unknown>).apiKey as string;
        if (!apiKey) {
          const appConfig = loadAppConfig();
          const defaults = (appConfig.defaults as Record<string, unknown>) || {};
          const defaultProvider = (defaults.provider as string) || "";
          apiKey =
            !defaultProvider || defaultProvider === provider
              ? (defaults.api_key as string) || ""
              : "";
        }
        const envPath = path.join(profilePath, ".env");
        syncPresetProviderEnvFile(envPath, provider, {
          baseUrl,
          apiKey,
          allowExistingApiKey: previousProvider === provider,
        });

        return { success: true };
      } catch (e: unknown) {
        return { error: (e as Error).message };
      }
    },
  );

  webIpc("get-plugins", async () => {
    const pluginsDir = path.join(HERMES_HOME, "plugins");
    if (!fs.existsSync(pluginsDir)) return [];
    try {
      return fs
        .readdirSync(pluginsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => ({ name: d.name, path: path.join(pluginsDir, d.name) }));
    } catch {
      return [];
    }
  });

  webIpc("get-plugin-info", async (_, pluginName: string) => {
    const pluginDir = path.join(HERMES_HOME, "plugins", pluginName);
    if (!fs.existsSync(pluginDir)) return { error: "插件不存在" };
    const metaFiles = [
      "metadata.json",
      "plugin.json",
      "package.json",
      "manifest.json",
    ];
    for (const f of metaFiles) {
      const fp = path.join(pluginDir, f);
      if (fs.existsSync(fp)) {
        try {
          return { name: pluginName, ...JSON.parse(fs.readFileSync(fp, "utf-8")) };
        } catch {
          /* skip */
        }
      }
    }
    return { name: pluginName, error: "未找到元数据文件" };
  });

  webIpc("get-theme-mode", async () => {
    const prefs = loadPreferences();
    if (prefs.theme_mode) return prefs.theme_mode as string;
    const oldTheme = (prefs.theme as string) || "light";
    if (oldTheme.endsWith("-light") || oldTheme === "light") return "light";
    return "dark";
  });

  webIpc("set-theme-mode", async (_, mode: string) => {
    const prefs = loadPreferences();
    prefs.theme_mode = mode;
    delete prefs.theme;
    savePreferences(prefs);
    return { success: true };
  });

  webIpc("get-accent-color", async () => {
    const prefs = loadPreferences();
    if (prefs.accent_color) return prefs.accent_color as string;
    const oldTheme = (prefs.theme as string) || "dark";
    const mapping: Record<string, string> = {
      dark: "violet", light: "violet",
      ocean: "blue", "ocean-light": "blue",
      forest: "green", "forest-light": "green",
      sunset: "orange", "sunset-light": "orange",
      lavender: "lavender", "lavender-light": "lavender",
      midnight: "indigo",
      rose: "rose", "rose-light": "rose",
      slate: "slate",
    };
    return mapping[oldTheme] || "violet";
  });

  webIpc("set-accent-color", async (_, accent: string) => {
    const prefs = loadPreferences();
    prefs.accent_color = accent;
    delete prefs.theme;
    savePreferences(prefs);
    return { success: true };
  });

  webIpc("get-ui-theme", async () => {
    const prefs = loadPreferences();
    return (prefs.ui_theme as string) || "classic";
  });

  webIpc("set-ui-theme", async (_, theme: string) => {
    const prefs = loadPreferences();
    prefs.ui_theme = theme;
    savePreferences(prefs);
    return { success: true };
  });

  webIpc("get-language", async () => {
    const prefs = loadPreferences();
    return (prefs.language as string) || "zh-CN";
  });

  webIpc("set-language", async (_, language: string) => {
    const prefs = loadPreferences();
    prefs.language = language;
    savePreferences(prefs);
    refreshTrayMenu();
    return { success: true };
  });

  webIpc("get-app-config", async () => {
    return loadAppConfig();
  });

  webIpc(
    "set-app-config",
    async (_, config: Record<string, unknown>) => {
      saveAppConfig(config);
      import("./server-manager")
        .then(({ applyDesktopWebServerConfig }) => applyDesktopWebServerConfig())
        .catch(() => {});
      return { success: true };
    },
  );

  webIpc("get-runtime-config", async () => {
    const appConfig = loadAppConfig();
    const userRuntime = (appConfig.runtime || {}) as Record<string, unknown>;
    return deepMergeDefaults(userRuntime, RUNTIME_DEFAULTS);
  });

  webIpc(
    "set-runtime-config",
    async (_, runtime: Record<string, unknown>) => {
      const appConfig = loadAppConfig();
      appConfig.runtime = runtime;
      saveAppConfig(appConfig);
      return { success: true };
    },
  );

  webIpc(
    "save-wallpaper-file",
    async (_, dataUrl: string) => {
      try {
        const match = dataUrl.match(/^data:image\/(\w+);base64,/);
        if (!match) return { error: "无效的图片数据" };
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        ensureDir(WALLPAPERS_DIR);
        const base64 = dataUrl.slice(match[0].length);
        const buffer = Buffer.from(base64, "base64");
        const filename = `wallpaper_${Date.now()}.${ext}`;
        const filePath = path.join(WALLPAPERS_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
      } catch (e: unknown) {
        return { error: (e as Error).message };
      }
    },
  );

  let _cachedVersion: string | null = null;

  webIpc("get-hermes-version", async () => {
    const versionText = await new Promise<string | null>((resolve) => {
      const appConfig = loadAppConfig();
      const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
      const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
      prepareHermesVersionCheck();
      const env = createHermesProcessEnv({ HERMES_HOME });
      execFile(hermesBin, ["--version"], { env, timeout: 15000, windowsHide: true }, (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            resolve(stripHermesCliUpdateInfo(stdout.toString()));
          }
        },
      );
    });
    const updateInfo = await getHermesGiteeUpdateInfo();
    _cachedVersion = (versionText || "") + getHermesSourceInfo() + updateInfo || null;
    return _cachedVersion;
  });

  webIpc("refresh-hermes-version", async () => {
    _cachedVersion = null;
    const appConfig = loadAppConfig();
    const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
    const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
    prepareHermesVersionCheck();
    const env = createHermesProcessEnv({ HERMES_HOME });
    const versionText = await new Promise<string | null>((resolve) => {
      execFile(hermesBin, ["--version"], { env, timeout: 15000, windowsHide: true }, (error, stdout) => {
        if (error) resolve(null);
        else resolve(stripHermesCliUpdateInfo(stdout.toString()));
      });
    });
    const updateInfo = await getHermesGiteeUpdateInfo();
    _cachedVersion = (versionText || "") + getHermesSourceInfo() + updateInfo || null;
    return _cachedVersion;
  });

  webIpc("run-hermes-doctor", async () => {
    try {
      return runHermesCli(["doctor"], undefined, 60000);
    } catch {
      return "诊断执行失败";
    }
  });

  webIpc("run-hermes-update", async (event) => {
    const appConfig = loadAppConfig();
    const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
    const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
    const env = createHermesProcessEnv({
      HERMES_HOME,
      TERM: "dumb",
    }) as Record<string, string>;
    return new Promise((resolve) => {
      let log = "";
      let resolved = false;
      let proc: ChildProcess | null = null;
      const stripAnsi = (text: string): string => text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const emit = (text: string): void => {
        log += text;
        event.sender.send("install-progress", {
          step: 1,
          totalSteps: 1,
          title: "更新 Hermes Agent",
          detail: text.trim().slice(0, 120),
          log,
        });
        if (!resolved && /Update complete!|✓ Update complete!/.test(log)) {
          resolved = true;
          emit("\n更新完成！\n");
          _cachedVersion = null;
          resolve({ success: true });
          try { proc?.kill(); } catch { /* ignore */ }
        }
      };
      emit("正在更新...\n");

      const run = async (): Promise<void> => {
        const remoteSha = await new Promise<string | null>((remoteResolve) => {
          const req = https.get(HERMES_GITEE_BRANCH_API, { timeout: 10000 }, (res) => {
            let body = "";
            res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
            res.on("end", () => {
              try {
                const data = JSON.parse(body);
                remoteResolve(data?.commit?.sha || data?.commit?.id || null);
              } catch {
                remoteResolve(null);
              }
            });
          });
          req.on("error", () => remoteResolve(null));
          req.on("timeout", () => { req.destroy(); remoteResolve(null); });
        });

        const canUseGit = hasSystemGit() && fs.existsSync(path.join(HERMES_REPO_DIR, ".git"));
        if (!canUseGit) {
          const result = await updateHermesFromGiteeZip(env, emit, remoteSha);
          if (resolved) return;
          resolved = true;
          if (result.success) {
            emit("\n更新完成！\n");
            _cachedVersion = null;
            resolve({ success: true });
          } else {
            resolve({ success: false, error: result.error || "无 Git 更新失败" });
          }
          return;
        }

        try {
          ensureHermesGiteeOrigin();
        } catch (e: unknown) {
          resolved = true;
          resolve({ success: false, error: `切换 Gitee 更新源失败: ${(e as Error).message}` });
          return;
        }

        proc = spawn(hermesBin, ["update"], { env, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
        proc.stdout?.on("data", (data: Buffer) => emit(stripAnsi(data.toString())));
        proc.stderr?.on("data", (data: Buffer) => emit(stripAnsi(data.toString())));
        proc.on("close", (code) => {
          if (resolved) return;
          resolved = true;
          if (code === 0) {
            emit("\n更新完成！\n");
            _cachedVersion = null;
            resolve({ success: true });
          } else {
            const lastLines = log.trim().split("\n").slice(-3).join("\n");
            resolve({ success: false, error: lastLines || `更新失败 (exit code ${code})` });
          }
        });
        proc.on("error", (err) => {
          if (resolved) return;
          resolved = true;
          resolve({ success: false, error: `更新执行失败: ${err.message}` });
        });
        setTimeout(() => {
          if (resolved) return;
          resolved = true;
          if (/Update complete!|✓ Update complete!/.test(log)) {
            emit("\n更新完成！\n");
            _cachedVersion = null;
            resolve({ success: true });
          } else {
            resolve({ success: false, error: "更新超时，请检查网络连接后重试" });
          }
          try { proc?.kill(); } catch { /* ignore */ }
        }, 10 * 60 * 1000);
      };
      void run();
    });
  });
}
