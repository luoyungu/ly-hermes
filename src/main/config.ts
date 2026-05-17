import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { execFileSync, spawn, execFile } from "child_process";
import http from "http";
import * as yaml from "./lib/yaml-simple";
import { ensureDir, safeWriteFile, yamlStringify } from "./utils";

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
export const APP_DATA_DIR: string = path.join(os.homedir(), ".hermes-desktop");
export const DEFAULT_HERMES_BIN: string =
  process.platform === "win32"
    ? path.join(HERMES_HOME, "hermes-agent", "venv", "Scripts", "hermes.exe")
    : path.join(HERMES_HOME, "hermes-agent", "venv", "bin", "hermes");
export const USERS_FILE: string = path.join(APP_DATA_DIR, "users.json");
export const WINDOW_STATE_FILE: string = path.join(
  APP_DATA_DIR,
  "window-state.json",
);
export const PREFERENCES_FILE: string = path.join(
  APP_DATA_DIR,
  "preferences.json",
);
export const CONFIG_FILE: string = path.join(APP_DATA_DIR, "config.json");
export const PROFILES_DIR: string = path.join(HERMES_HOME, "profiles");
export const DEFAULT_API_HOST: string = "127.0.0.1";
export const DEFAULT_API_PORT: number = 8644;
export const SAVED_MODELS_FILE: string = path.join(
  APP_DATA_DIR,
  "saved-models.json",
);
export const WALLPAPERS_DIR: string = path.join(
  APP_DATA_DIR,
  "wallpapers",
);

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
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      setCache("appconfig", data);
      return data;
    }
  } catch {
    /* fall through */
  }
  const defaults: Record<string, unknown> = {
    defaults: {
      model: "",
      provider: "",
      base_url: "",
      api_key: "",
      tools: [
        "browser",
        "terminal",
        "file",
        "memory",
        "web",
        "code",
        "cronjob",
        "skills",
        "vision",
      ],
      idle_timeout: 30,
      max_online: 5,
      startup_timeout: 30,
    },
    ui: { theme: "dark", language: "zh-CN", font_size: 14 },
    hermes: {
      home: HERMES_HOME,
      bin: process.env.HERMES_BIN || DEFAULT_HERMES_BIN,
      port_range: [8644, 8743],
    },
  };
  setCache("appconfig", defaults);
  return defaults;
}

export function saveAppConfig(config: Record<string, unknown>): void {
  ensureDir(APP_DATA_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  invalidateCache("appconfig");
}

export function loadPreferences(): Record<string, unknown> {
  try {
    if (fs.existsSync(PREFERENCES_FILE)) {
      return JSON.parse(fs.readFileSync(PREFERENCES_FILE, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  return {};
}

export function savePreferences(prefs: Record<string, unknown>): void {
  ensureDir(APP_DATA_DIR);
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(prefs, null, 2), "utf-8");
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
  const spawnOpts: Record<string, unknown> = {
    encoding: "utf-8",
    timeout: timeoutMs,
    env: Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME: HERMES_HOME,
    }),
    shell: process.platform === "win32",
  };
  const hermesEnv = readHermesEnv(profileName || "default");
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

function loadSavedModels(): Array<Record<string, unknown>> {
  try {
    if (fs.existsSync(SAVED_MODELS_FILE)) {
      return JSON.parse(fs.readFileSync(SAVED_MODELS_FILE, "utf-8"));
    }
  } catch {
    /* fall through */
  }
  return [];
}

function saveSavedModels(models: Array<Record<string, unknown>>): void {
  ensureDir(APP_DATA_DIR);
  safeWriteFile(SAVED_MODELS_FILE, JSON.stringify(models, null, 2));
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
        console.log("[applySavedModel] provider:", entry.provider, "model:", entry.model, "hasApiKey:", !!apiKey, "savedModelId:", id);
        if (apiKey) {
          const envPath = path.join(profilePath, ".env");
          let envContent = "";
          if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, "utf-8");
          }
          const providerInfo = PROVIDER_KEY_MAP[entry.provider as string];
          const envKey = providerInfo?.envKey || "OPENAI_API_KEY";
          console.log("[applySavedModel] envKey:", envKey, "isBuiltin:", !!providerInfo);
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
          console.log("[applySavedModel] .env written to:", envPath);
        } else {
          console.log("[applySavedModel] WARNING: no apiKey found (not in saved model nor global defaults)");
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

  ipcMain.handle("get-theme", async () => {
    const prefs = loadPreferences();
    return (prefs.theme as string) || "dark";
  });

  ipcMain.handle("set-theme", async (_, theme: string) => {
    const prefs = loadPreferences();
    prefs.theme = theme;
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
      const env = Object.assign({}, process.env, {
        HOME: os.homedir(),
        HERMES_HOME,
      });
      execFile(hermesBin, ["--version"], { env, timeout: 15000 }, (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            _cachedVersion = stdout.toString().trim();
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
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME,
    });
    const versionText = await new Promise<string | null>((resolve) => {
      execFile(hermesBin, ["--version"], { env, timeout: 15000 }, (error, stdout) => {
        if (error) resolve(null);
        else resolve(stdout.toString().trim());
      });
    });
    let checkText = "";
    try {
      checkText = runHermesCli(["update", "--check"]);
    } catch { /* ignore */ }
    let combined = versionText || "";
    if (checkText) {
      const behindMatch = checkText.match(/Update available:\s*(\d+)\s*commits?\s*behind\s*(\S+)/i);
      if (behindMatch) {
        combined += `\nUpdate available: ${behindMatch[1]} commits behind ${behindMatch[2]}`;
      } else if (/Up to date|Already up to date/i.test(checkText)) {
        combined += "\nUp to date";
      }
    }
    _cachedVersion = combined || null;
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
    });
    return new Promise((resolve) => {
      const proc = spawn(hermesBin, ["update"], { env, stdio: ["ignore", "pipe", "pipe"] });
      let log = "";
      let resolved = false;
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
          try { proc.kill(); } catch { /* ignore */ }
        }
      };
      emit("正在更新...\n");
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
        try { proc.kill(); } catch { /* ignore */ }
      }, 10 * 60 * 1000);
    });
  });
}
