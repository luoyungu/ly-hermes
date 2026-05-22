import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { execFileSync, spawn, execFile, type ChildProcess } from "child_process";
import http from "http";
import https from "https";
import * as yaml from "./lib/yaml-simple";
import { ensureDir, safeWriteFile, yamlStringify } from "./utils";
import { getSetting, loadDbSavedModels, saveDbSavedModels, setSetting } from "./db";

const PROVIDER_KEY_MAP: Record<string, { envKey: string; baseUrl: string }> = {
  deepseek:    { envKey: "DEEPSEEK_API_KEY",    baseUrl: "https://api.deepseek.com/v1" },
  qwen:        { envKey: "DASHSCOPE_API_KEY",    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  zhipu:       { envKey: "GLM_API_KEY",          baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  moonshot:    { envKey: "MOONSHOT_API_KEY",     baseUrl: "https://api.moonshot.cn/v1" },
  yi:          { envKey: "YI_API_KEY",           baseUrl: "https://api.lingyiwanwu.com/v1" },
  minimax:     { envKey: "MINIMAX_API_KEY",      baseUrl: "https://api.minimax.chat/v1" },
  spark:       { envKey: "SPARK_API_KEY",        baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  siliconflow: { envKey: "SILICONFLOW_API_KEY",  baseUrl: "https://api.siliconflow.cn/v1" },
  ernie:       { envKey: "QIANFAN_API_KEY",      baseUrl: "https://qianfan.baidubce.com/v2" },
};

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

export const RUNTIME_DEFAULTS: Record<string, unknown> = {
  memory: { memory_enabled: true, memory_char_limit: 2200, user_char_limit: 1375, flush_min_turns: 6 },
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
    env: Object.assign({}, process.env, {
      HOME: os.homedir(),
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
  ipcMain.handle("get-config", async () => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    if (!fs.existsSync(configPath)) return null;
    try {
      return yaml.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle("get-env", async () => {
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

  ipcMain.handle("get-hermes-home", async () => {
    return HERMES_HOME;
  });

  ipcMain.handle("check-hermes-install", async () => {
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
        env: Object.assign({}, process.env, {
          HOME: os.homedir(),
          HERMES_HOME: HERMES_HOME,
        }),
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

  ipcMain.handle("get-model-config", async () => {
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

  ipcMain.handle("get-available-models", async () => {
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

  ipcMain.handle("set-model", async (_, modelName: string) => {
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

  ipcMain.handle("set-model-config", async (_, modelConfig: { model?: string; provider?: string; baseUrl?: string }) => {
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
      return { success: true };
    } catch (e: unknown) {
      return { error: (e as Error).message };
    }
  });

  ipcMain.handle("list-saved-models", async () => {
    return loadSavedModels();
  });

  ipcMain.handle(
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

  ipcMain.handle("remove-saved-model", async (_, id: string) => {
    const models = loadSavedModels();
    const filtered = models.filter((m) => m.id !== id);
    if (filtered.length === models.length) return false;
    saveSavedModels(filtered);
    return true;
  });

  ipcMain.handle(
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

  ipcMain.handle(
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
        m.default = entry.model;
        m.provider = entry.provider;
        if (entry.baseUrl) m.base_url = entry.baseUrl;
        safeWriteFile(configPath, yamlStringify(cfg));

        let apiKey = (entry as Record<string, unknown>).apiKey as string;
        if (!apiKey) {
          const appConfig = loadAppConfig();
          const defaults = (appConfig.defaults as Record<string, unknown>) || {};
          apiKey = (defaults.api_key as string) || "";
        }
        if (apiKey) {
          const envPath = path.join(profilePath, ".env");
          let envContent = "";
          if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, "utf-8");
          }
          const providerInfo = PROVIDER_KEY_MAP[entry.provider as string];
          const envKey = providerInfo?.envKey || "OPENAI_API_KEY";
          const keysToRemove = new Set([envKey]);
          if (providerInfo) {
            keysToRemove.add("OPENAI_API_KEY");
            keysToRemove.add("HERMES_INFERENCE_PROVIDER");
          }
          const lines = envContent
            .split("\n")
            .filter((l: string) => {
              const eqIdx = l.indexOf("=");
              if (eqIdx === -1) return true;
              const key = l.slice(0, eqIdx).trim();
              return !keysToRemove.has(key);
            });
          lines.push(`${envKey}=${apiKey}`);
          safeWriteFile(envPath, lines.join("\n") + "\n");
        }

        return { success: true };
      } catch (e: unknown) {
        return { error: (e as Error).message };
      }
    },
  );

  ipcMain.handle("get-plugins", async () => {
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

  ipcMain.handle("get-plugin-info", async (_, pluginName: string) => {
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

  ipcMain.handle("get-theme-mode", async () => {
    const prefs = loadPreferences();
    if (prefs.theme_mode) return prefs.theme_mode as string;
    const oldTheme = (prefs.theme as string) || "dark";
    if (oldTheme.endsWith("-light") || oldTheme === "light") return "light";
    return "dark";
  });

  ipcMain.handle("set-theme-mode", async (_, mode: string) => {
    const prefs = loadPreferences();
    prefs.theme_mode = mode;
    delete prefs.theme;
    savePreferences(prefs);
    return { success: true };
  });

  ipcMain.handle("get-accent-color", async () => {
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

  ipcMain.handle("set-accent-color", async (_, accent: string) => {
    const prefs = loadPreferences();
    prefs.accent_color = accent;
    delete prefs.theme;
    savePreferences(prefs);
    return { success: true };
  });

  ipcMain.handle("get-ui-theme", async () => {
    const prefs = loadPreferences();
    return (prefs.ui_theme as string) || "classic";
  });

  ipcMain.handle("set-ui-theme", async (_, theme: string) => {
    const prefs = loadPreferences();
    prefs.ui_theme = theme;
    savePreferences(prefs);
    return { success: true };
  });

  ipcMain.handle("get-app-config", async () => {
    return loadAppConfig();
  });

  ipcMain.handle(
    "set-app-config",
    async (_, config: Record<string, unknown>) => {
      saveAppConfig(config);
      import("./server-manager")
        .then(({ applyDesktopWebServerConfig }) => applyDesktopWebServerConfig())
        .catch(() => {});
      return { success: true };
    },
  );

  ipcMain.handle("get-runtime-config", async () => {
    const appConfig = loadAppConfig();
    const userRuntime = (appConfig.runtime || {}) as Record<string, unknown>;
    return deepMergeDefaults(userRuntime, RUNTIME_DEFAULTS);
  });

  ipcMain.handle(
    "set-runtime-config",
    async (_, runtime: Record<string, unknown>) => {
      const appConfig = loadAppConfig();
      appConfig.runtime = runtime;
      saveAppConfig(appConfig);
      return { success: true };
    },
  );

  ipcMain.handle(
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

  ipcMain.handle("get-hermes-version", async () => {
    if (_cachedVersion !== null) return _cachedVersion;
    return new Promise((resolve) => {
      const appConfig = loadAppConfig();
      const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
      const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
      prepareHermesVersionCheck();
      const env = Object.assign({}, process.env, {
        HOME: os.homedir(),
        HERMES_HOME,
      });
      execFile(hermesBin, ["--version"], { env, timeout: 15000, windowsHide: true }, (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            _cachedVersion = stripHermesCliUpdateInfo(stdout.toString());
            resolve(_cachedVersion);
          }
        },
      );
    });
  });

  ipcMain.handle("refresh-hermes-version", async () => {
    _cachedVersion = null;
    const appConfig = loadAppConfig();
    const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
    const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
    prepareHermesVersionCheck();
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME,
    });
    const versionText = await new Promise<string | null>((resolve) => {
      execFile(hermesBin, ["--version"], { env, timeout: 15000, windowsHide: true }, (error, stdout) => {
        if (error) resolve(null);
        else resolve(stripHermesCliUpdateInfo(stdout.toString()));
      });
    });
    let updateInfo = "";
    try {
      const canUseGit = hasSystemGit() && fs.existsSync(path.join(HERMES_REPO_DIR, ".git"));
      const localCommit = canUseGit
        ? execFileSync("git", ["rev-parse", "HEAD"], { cwd: HERMES_REPO_DIR, timeout: 10000 }).toString().trim()
        : readDesktopSourceCommit();
      const remoteSha = await new Promise<string | null>((resolve) => {
        const req = https.get(HERMES_GITEE_BRANCH_API, { timeout: 10000 }, (res) => {
          let body = "";
          res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
          res.on("end", () => {
            try {
              const data = JSON.parse(body);
              resolve(data?.commit?.sha || data?.commit?.id || null);
            } catch { resolve(null); }
          });
        });
        req.on("error", () => resolve(null));
        req.on("timeout", () => { req.destroy(); resolve(null); });
      });
      if (remoteSha) {
        if (localCommit && localCommit === remoteSha) {
          updateInfo = "\nUp to date";
        } else if (localCommit && canUseGit) {
          const behindCount = await new Promise<number>((resolve) => {
            const req = https.get(`${HERMES_GITEE_COMPARE_API}/${localCommit}...${remoteSha}`, { timeout: 10000 }, (res) => {
              let body = "";
              res.on("data", (chunk: Buffer) => { body += chunk.toString(); });
              res.on("end", () => {
                try {
                  const data = JSON.parse(body);
                  const commits = data?.commits;
                  resolve(Array.isArray(commits) ? commits.length : (data?.total_commits || 0));
                } catch { resolve(0); }
              });
            });
            req.on("error", () => resolve(0));
            req.on("timeout", () => { req.destroy(); resolve(0); });
          });
          if (behindCount > 0) {
            updateInfo = `\nUpdate available: ${behindCount} commits behind ${remoteSha.slice(0, 8)}`;
          } else {
            updateInfo = "\nUp to date";
          }
        } else {
          updateInfo = `\nUpdate available: Gitee sync available ${remoteSha.slice(0, 8)}`;
        }
      }
    } catch { /* ignore */ }
    _cachedVersion = (versionText || "") + updateInfo || null;
    return _cachedVersion;
  });

  ipcMain.handle("run-hermes-doctor", async () => {
    try {
      return runHermesCli(["doctor"], undefined, 60000);
    } catch {
      return "诊断执行失败";
    }
  });

  ipcMain.handle("run-hermes-update", async (event) => {
    const appConfig = loadAppConfig();
    const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
    const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
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
