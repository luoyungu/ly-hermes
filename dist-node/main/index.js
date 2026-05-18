"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const electron = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const child_process = require("child_process");
const http = require("http");
const jsYaml = require("js-yaml");
const zlib = require("zlib");
const crypto = require("crypto");
const https = require("https");
const electronUpdater = require("electron-updater");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const jsYaml__namespace = /* @__PURE__ */ _interopNamespaceDefault(jsYaml);
function parse(text) {
  const result = jsYaml__namespace.load(text);
  if (typeof result === "object" && result !== null && !Array.isArray(result)) {
    return result;
  }
  return {};
}
function ensureDir$1(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function safeWriteFile(filePath, content) {
  ensureDir$1(path.dirname(filePath));
  fs.writeFileSync(filePath, content, "utf-8");
}
function yamlStringify(obj) {
  return jsYaml__namespace.dump(obj, { indent: 2, lineWidth: -1, noRefs: true });
}
function createTrayIcon() {
  const size = 16;
  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0);
    for (let x = 0; x < size; x++) {
      const dx = x - size / 2 + 0.5;
      const dy = y - size / 2 + 0.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < size / 2 - 1) {
        raw.push(74, 144, 226, 255);
      } else if (dist < size / 2) {
        raw.push(74, 144, 226, 128);
      } else {
        raw.push(0, 0, 0, 0);
      }
    }
  }
  const compressed = zlib.deflateSync(Buffer.from(raw));
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  function crc32(buf) {
    let c = 4294967295;
    const t = [];
    for (let n = 0; n < 256; n++) {
      let cc = n;
      for (let k = 0; k < 8; k++)
        cc = cc & 1 ? 3988292384 ^ cc >>> 1 : cc >>> 1;
      t[n] = cc;
    }
    for (let i = 0; i < buf.length; i++)
      c = t[(c ^ buf[i]) & 255] ^ c >>> 8;
    return (c ^ 4294967295) >>> 0;
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const tb = Buffer.from(type, "ascii");
    const cb = Buffer.concat([tb, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(cb));
    return Buffer.concat([len, tb, data, crc]);
  }
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const png = Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0))
  ]);
  return electron.nativeImage.createFromBuffer(png);
}
function showChatNotification(title, body, mainWindow2) {
  if (!electron.Notification.isSupported()) return;
  if (mainWindow2 && !mainWindow2.isDestroyed() && mainWindow2.isFocused()) return;
  const notif = new electron.Notification({ title, body });
  notif.on("click", () => {
    if (mainWindow2) {
      mainWindow2.show();
      mainWindow2.focus();
    }
  });
  notif.show();
}
const PROVIDER_KEY_MAP$2 = {
  deepseek: { envKey: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1" },
  qwen: { envKey: "DASHSCOPE_API_KEY", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  zhipu: { envKey: "GLM_API_KEY", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  moonshot: { envKey: "MOONSHOT_API_KEY", baseUrl: "https://api.moonshot.cn/v1" },
  yi: { envKey: "YI_API_KEY", baseUrl: "https://api.lingyiwanwu.com/v1" },
  minimax: { envKey: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.chat/v1" },
  spark: { envKey: "SPARK_API_KEY", baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  siliconflow: { envKey: "SILICONFLOW_API_KEY", baseUrl: "https://api.siliconflow.cn/v1" },
  ernie: { envKey: "QIANFAN_API_KEY", baseUrl: "https://qianfan.baidubce.com/v2" }
};
const HERMES_HOME = process.env.HERMES_HOME || path.join(os.homedir(), ".hermes");
const APP_DATA_DIR = path.join(os.homedir(), ".lyhermes");
const DEFAULT_HERMES_BIN = process.platform === "win32" ? path.join(HERMES_HOME, "hermes-agent", "venv", "Scripts", "hermes.exe") : path.join(HERMES_HOME, "hermes-agent", "venv", "bin", "hermes");
const USERS_FILE = path.join(APP_DATA_DIR, "users.json");
const WINDOW_STATE_FILE = path.join(
  APP_DATA_DIR,
  "window-state.json"
);
const PREFERENCES_FILE = path.join(
  APP_DATA_DIR,
  "preferences.json"
);
const CONFIG_FILE = path.join(APP_DATA_DIR, "config.json");
const PROFILES_DIR = path.join(HERMES_HOME, "profiles");
const DEFAULT_API_HOST = "127.0.0.1";
const DEFAULT_API_PORT = 8644;
const SAVED_MODELS_FILE = path.join(
  APP_DATA_DIR,
  "saved-models.json"
);
const WALLPAPERS_DIR = path.join(
  APP_DATA_DIR,
  "wallpapers"
);
const _configCache = /* @__PURE__ */ new Map();
const CACHE_TTL = 5e3;
function getCached(key) {
  const entry = _configCache.get(key);
  if (!entry) return void 0;
  if (Date.now() - entry.ts > CACHE_TTL) {
    _configCache.delete(key);
    return void 0;
  }
  return entry.data;
}
function setCache(key, data) {
  _configCache.set(key, { data, ts: Date.now() });
}
function invalidateCache(prefix) {
  for (const key of _configCache.keys()) {
    if (key.startsWith(prefix)) _configCache.delete(key);
  }
}
function loadAppConfig() {
  const cached = getCached("appconfig");
  if (cached) return cached;
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      setCache("appconfig", data);
      return data;
    }
  } catch {
  }
  const defaults = {
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
        "vision"
      ],
      idle_timeout: 30,
      max_online: 5,
      startup_timeout: 30
    },
    ui: { theme: "dark", language: "zh-CN", font_size: 14 },
    hermes: {
      home: HERMES_HOME,
      bin: process.env.HERMES_BIN || DEFAULT_HERMES_BIN,
      port_range: [8644, 8743]
    }
  };
  setCache("appconfig", defaults);
  return defaults;
}
function saveAppConfig(config2) {
  ensureDir$1(APP_DATA_DIR);
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config2, null, 2), "utf-8");
  invalidateCache("appconfig");
}
function loadPreferences() {
  try {
    if (fs.existsSync(PREFERENCES_FILE)) {
      return JSON.parse(fs.readFileSync(PREFERENCES_FILE, "utf-8"));
    }
  } catch {
  }
  return {};
}
function savePreferences(prefs) {
  ensureDir$1(APP_DATA_DIR);
  fs.writeFileSync(PREFERENCES_FILE, JSON.stringify(prefs, null, 2), "utf-8");
}
function getProfilePath(profileName) {
  if (profileName === "default") return HERMES_HOME;
  return path.join(PROFILES_DIR, profileName);
}
function readHermesEnv(profileName) {
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
function readEnvFile(envPath) {
  const result = {};
  try {
    const raw = fs.readFileSync(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eq = trimmed.indexOf("=");
      if (eq > 0) {
        const key = trimmed.slice(0, eq).trim();
        const val = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
        result[key] = val;
      }
    }
  } catch {
  }
  return result;
}
function runHermesCli(args, profileName, timeoutMs = 6e4) {
  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes;
  const hermesBin = hermesCfg?.bin || DEFAULT_HERMES_BIN;
  const effectiveProfile = profileName || "default";
  const hermesHomeForProfile = effectiveProfile === "default" ? HERMES_HOME : getProfilePath(effectiveProfile);
  const spawnOpts = {
    encoding: "utf-8",
    timeout: timeoutMs,
    env: Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME: hermesHomeForProfile
    }),
    shell: process.platform === "win32"
  };
  const hermesEnv = readHermesEnv(effectiveProfile);
  for (const [key, value] of Object.entries(hermesEnv)) {
    if (value && !spawnOpts.env[key]) {
      spawnOpts.env[key] = value;
    }
  }
  const safeArgs = args.map((a) => String(a).slice(0, 500));
  try {
    const out = child_process.execFileSync(hermesBin, safeArgs, spawnOpts);
    return out.trim();
  } catch (e) {
    const err = e;
    const msg = err.stderr && err.stderr.toString().trim() || err.message || "";
    if (err.code === "ETIMEDOUT") {
      return "命令执行超时，请检查 hermes-agent 是否正常运行，或稍后重试";
    }
    return msg;
  }
}
function getModelFromProfile(profileName) {
  const configPath = path.join(getProfilePath(profileName), "config.yaml");
  try {
    if (fs.existsSync(configPath)) {
      const cfg = parse(fs.readFileSync(configPath, "utf-8"));
      const model = cfg.model;
      if (model) {
        if (model.default) return model.default;
        if (model.name) return model.name;
      }
    }
  } catch {
  }
  const env = readHermesEnv(profileName);
  return env.HERMES_MODEL || "";
}
function ensureApiServerConfig() {
  try {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    if (!fs.existsSync(configPath)) return;
    const content = fs.readFileSync(configPath, "utf-8");
    if (/api_server/i.test(content)) return;
    const addition = '\nplatforms:\n  api_server:\n    enabled: true\n    extra:\n      port: 8642\n      host: "127.0.0.1"\n';
    fs.appendFileSync(configPath, addition, "utf-8");
  } catch {
  }
}
function isApiServerReady(port) {
  return new Promise((resolve) => {
    const req = http.request(
      {
        hostname: DEFAULT_API_HOST,
        port,
        path: "/health",
        method: "GET",
        timeout: 2e3
      },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}
function validateProfileName(name) {
  if (!name || typeof name !== "string") return false;
  if (!/^[a-z0-9_][a-z0-9_-]{0,63}$/.test(name)) return false;
  return true;
}
function loadSavedModels() {
  try {
    if (fs.existsSync(SAVED_MODELS_FILE)) {
      return JSON.parse(fs.readFileSync(SAVED_MODELS_FILE, "utf-8"));
    }
  } catch {
  }
  return [];
}
function saveSavedModels(models) {
  ensureDir$1(APP_DATA_DIR);
  safeWriteFile(SAVED_MODELS_FILE, JSON.stringify(models, null, 2));
}
function registerConfigIpcHandlers() {
  electron.ipcMain.handle("get-config", async () => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    if (!fs.existsSync(configPath)) return null;
    try {
      return parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return null;
    }
  });
  electron.ipcMain.handle("get-env", async () => {
    const env = readHermesEnv("default");
    const result = {};
    for (const [key, val] of Object.entries(env)) {
      if (key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET")) {
        result[key] = val.slice(0, 4) + "****";
      } else {
        result[key] = val;
      }
    }
    return result;
  });
  electron.ipcMain.handle("get-hermes-home", async () => {
    return HERMES_HOME;
  });
  electron.ipcMain.handle("check-hermes-install", async () => {
    const result = {
      installed: false,
      configured: false,
      hasApiKey: false,
      version: null
    };
    const appConfig = loadAppConfig();
    const hermesBin = appConfig.hermes?.bin || DEFAULT_HERMES_BIN;
    try {
      const versionOut = child_process.execFileSync(hermesBin, ["--version"], {
        encoding: "utf-8",
        timeout: 5e3,
        env: Object.assign({}, process.env, {
          HOME: os.homedir(),
          HERMES_HOME
        })
      }).trim();
      result.installed = true;
      const vMatch = versionOut.match(/(\d+\.\d+\.\d+)/);
      if (vMatch) result.version = vMatch[1];
    } catch {
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
  electron.ipcMain.handle("get-model-config", async () => {
    const model = getModelFromProfile("default");
    const configPath = path.join(HERMES_HOME, "config.yaml");
    let provider = "";
    let baseUrl = "";
    try {
      if (fs.existsSync(configPath)) {
        const cfg = parse(fs.readFileSync(configPath, "utf-8"));
        const m = cfg.model;
        if (m) {
          provider = m.provider || "";
          baseUrl = m.base_url || "";
        }
      }
    } catch {
    }
    return { provider, model, baseUrl };
  });
  electron.ipcMain.handle("get-available-models", async () => {
    const { getApiPortForProfile: getApiPortForProfile2 } = await Promise.resolve().then(() => employees);
    const port = getApiPortForProfile2("default");
    if (!port) return { models: [] };
    return new Promise((resolve) => {
      const req = http.request(
        {
          hostname: DEFAULT_API_HOST,
          port,
          path: "/v1/models",
          method: "GET",
          timeout: 5e3
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => data += chunk);
          res.on("end", () => {
            try {
              const parsed = JSON.parse(data);
              resolve({ models: parsed && parsed.data || [] });
            } catch {
              resolve({ models: [] });
            }
          });
        }
      );
      req.on("error", () => resolve({ models: [] }));
      req.on("timeout", () => {
        req.destroy();
        resolve({ models: [] });
      });
      req.end();
    });
  });
  electron.ipcMain.handle("set-model", async (_, modelName) => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    try {
      let cfg = {};
      if (fs.existsSync(configPath)) {
        cfg = parse(fs.readFileSync(configPath, "utf-8"));
      }
      if (!cfg.model) cfg.model = {};
      cfg.model.default = modelName;
      ensureDir$1(HERMES_HOME);
      safeWriteFile(configPath, yamlStringify(cfg));
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });
  electron.ipcMain.handle("set-model-config", async (_, modelConfig) => {
    const configPath = path.join(HERMES_HOME, "config.yaml");
    try {
      let cfg = {};
      if (fs.existsSync(configPath)) {
        cfg = parse(fs.readFileSync(configPath, "utf-8"));
      }
      if (!cfg.model) cfg.model = {};
      const m = cfg.model;
      if (modelConfig.model) m.default = modelConfig.model;
      if (modelConfig.provider) m.provider = modelConfig.provider;
      if (modelConfig.baseUrl) m.base_url = modelConfig.baseUrl;
      ensureDir$1(HERMES_HOME);
      safeWriteFile(configPath, yamlStringify(cfg));
      return { success: true };
    } catch (e) {
      return { error: e.message };
    }
  });
  electron.ipcMain.handle("list-saved-models", async () => {
    return loadSavedModels();
  });
  electron.ipcMain.handle(
    "add-saved-model",
    async (_, name, provider, model, baseUrl, apiKey) => {
      const models = loadSavedModels();
      const existing = models.find(
        (m) => m.model === model && m.provider === provider
      );
      if (existing) return existing;
      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name,
        provider,
        model,
        baseUrl: baseUrl || "",
        apiKey: apiKey || "",
        createdAt: Date.now()
      };
      models.push(entry);
      saveSavedModels(models);
      return entry;
    }
  );
  electron.ipcMain.handle("remove-saved-model", async (_, id) => {
    const models = loadSavedModels();
    const filtered = models.filter((m) => m.id !== id);
    if (filtered.length === models.length) return false;
    saveSavedModels(filtered);
    return true;
  });
  electron.ipcMain.handle(
    "update-saved-model",
    async (_, id, name, provider, model, baseUrl, apiKey) => {
      const models = loadSavedModels();
      const entry = models.find((m) => m.id === id);
      if (!entry) return { error: "模型配置不存在" };
      const dup = models.find(
        (m) => m.id !== id && m.model === model && m.provider === provider
      );
      if (dup) return { error: "相同 provider+model 的配置已存在" };
      entry.name = name;
      entry.provider = provider;
      entry.model = model;
      entry.baseUrl = baseUrl || "";
      entry.apiKey = apiKey || "";
      saveSavedModels(models);
      return { success: true, entry };
    }
  );
  electron.ipcMain.handle(
    "apply-saved-model",
    async (_, id, profileName) => {
      const models = loadSavedModels();
      const entry = models.find((m) => m.id === id);
      if (!entry) return { error: "模型配置不存在" };
      const name = profileName || "default";
      const profilePath = getProfilePath(name);
      const configPath = path.join(profilePath, "config.yaml");
      try {
        let cfg = {};
        if (fs.existsSync(configPath)) {
          cfg = parse(fs.readFileSync(configPath, "utf-8"));
        }
        if (!cfg.model) cfg.model = {};
        const m = cfg.model;
        m.default = entry.model;
        m.provider = entry.provider;
        if (entry.baseUrl) m.base_url = entry.baseUrl;
        safeWriteFile(configPath, yamlStringify(cfg));
        let apiKey = entry.apiKey;
        if (!apiKey) {
          const appConfig = loadAppConfig();
          const defaults = appConfig.defaults || {};
          apiKey = defaults.api_key || "";
        }
        if (apiKey) {
          const envPath = path.join(profilePath, ".env");
          let envContent = "";
          if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, "utf-8");
          }
          const providerInfo = PROVIDER_KEY_MAP$2[entry.provider];
          const envKey = providerInfo?.envKey || "OPENAI_API_KEY";
          const keysToRemove = /* @__PURE__ */ new Set([envKey]);
          if (providerInfo) {
            keysToRemove.add("OPENAI_API_KEY");
            keysToRemove.add("HERMES_INFERENCE_PROVIDER");
          }
          const lines = envContent.split("\n").filter((l) => {
            const eqIdx = l.indexOf("=");
            if (eqIdx === -1) return true;
            const key = l.slice(0, eqIdx).trim();
            return !keysToRemove.has(key);
          });
          lines.push(`${envKey}=${apiKey}`);
          safeWriteFile(envPath, lines.join("\n") + "\n");
        }
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
    }
  );
  electron.ipcMain.handle("get-plugins", async () => {
    const pluginsDir = path.join(HERMES_HOME, "plugins");
    if (!fs.existsSync(pluginsDir)) return [];
    try {
      return fs.readdirSync(pluginsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => ({ name: d.name, path: path.join(pluginsDir, d.name) }));
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("get-plugin-info", async (_, pluginName) => {
    const pluginDir = path.join(HERMES_HOME, "plugins", pluginName);
    if (!fs.existsSync(pluginDir)) return { error: "插件不存在" };
    const metaFiles = [
      "metadata.json",
      "plugin.json",
      "package.json",
      "manifest.json"
    ];
    for (const f of metaFiles) {
      const fp = path.join(pluginDir, f);
      if (fs.existsSync(fp)) {
        try {
          return { name: pluginName, ...JSON.parse(fs.readFileSync(fp, "utf-8")) };
        } catch {
        }
      }
    }
    return { name: pluginName, error: "未找到元数据文件" };
  });
  electron.ipcMain.handle("get-theme", async () => {
    const prefs = loadPreferences();
    return prefs.theme || "dark";
  });
  electron.ipcMain.handle("set-theme", async (_, theme) => {
    const prefs = loadPreferences();
    prefs.theme = theme;
    savePreferences(prefs);
    return { success: true };
  });
  electron.ipcMain.handle("get-app-config", async () => {
    return loadAppConfig();
  });
  electron.ipcMain.handle(
    "set-app-config",
    async (_, config2) => {
      saveAppConfig(config2);
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "save-wallpaper-file",
    async (_, dataUrl) => {
      try {
        const match = dataUrl.match(/^data:image\/(\w+);base64,/);
        if (!match) return { error: "无效的图片数据" };
        const ext = match[1] === "jpeg" ? "jpg" : match[1];
        ensureDir$1(WALLPAPERS_DIR);
        const base64 = dataUrl.slice(match[0].length);
        const buffer = Buffer.from(base64, "base64");
        const filename = `wallpaper_${Date.now()}.${ext}`;
        const filePath = path.join(WALLPAPERS_DIR, filename);
        fs.writeFileSync(filePath, buffer);
        return { success: true, path: filePath };
      } catch (e) {
        return { error: e.message };
      }
    }
  );
  let _cachedVersion = null;
  electron.ipcMain.handle("get-hermes-version", async () => {
    if (_cachedVersion !== null) return _cachedVersion;
    return new Promise((resolve) => {
      const appConfig = loadAppConfig();
      const hermesCfg = appConfig.hermes;
      const hermesBin = hermesCfg?.bin || DEFAULT_HERMES_BIN;
      const env = Object.assign({}, process.env, {
        HOME: os.homedir(),
        HERMES_HOME
      });
      child_process.execFile(
        hermesBin,
        ["--version"],
        { env, timeout: 15e3 },
        (error, stdout) => {
          if (error) {
            resolve(null);
          } else {
            _cachedVersion = stdout.toString().trim();
            resolve(_cachedVersion);
          }
        }
      );
    });
  });
  electron.ipcMain.handle("refresh-hermes-version", async () => {
    _cachedVersion = null;
    const appConfig = loadAppConfig();
    const hermesCfg = appConfig.hermes;
    const hermesBin = hermesCfg?.bin || DEFAULT_HERMES_BIN;
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME
    });
    const versionText = await new Promise((resolve) => {
      child_process.execFile(hermesBin, ["--version"], { env, timeout: 15e3 }, (error, stdout) => {
        if (error) resolve(null);
        else resolve(stdout.toString().trim());
      });
    });
    let checkText = "";
    try {
      checkText = runHermesCli(["update", "--check"]);
    } catch {
    }
    let combined = versionText || "";
    if (checkText) {
      const behindMatch = checkText.match(/Update available:\s*(\d+)\s*commits?\s*behind\s*(\S+)/i);
      if (behindMatch) {
        combined += `
Update available: ${behindMatch[1]} commits behind ${behindMatch[2]}`;
      } else if (/Up to date|Already up to date/i.test(checkText)) {
        combined += "\nUp to date";
      }
    }
    _cachedVersion = combined || null;
    return _cachedVersion;
  });
  electron.ipcMain.handle("run-hermes-doctor", async () => {
    try {
      return runHermesCli(["doctor"], void 0, 6e4);
    } catch {
      return "诊断执行失败";
    }
  });
  electron.ipcMain.handle("run-hermes-update", async (event) => {
    const appConfig = loadAppConfig();
    const hermesCfg = appConfig.hermes;
    const hermesBin = hermesCfg?.bin || DEFAULT_HERMES_BIN;
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME,
      TERM: "dumb"
    });
    return new Promise((resolve) => {
      const proc = child_process.spawn(hermesBin, ["update"], { env, stdio: ["ignore", "pipe", "pipe"] });
      let log = "";
      let resolved = false;
      const stripAnsi = (text) => text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
      const emit = (text) => {
        log += text;
        event.sender.send("install-progress", {
          step: 1,
          totalSteps: 1,
          title: "更新 Hermes Agent",
          detail: text.trim().slice(0, 120),
          log
        });
        if (!resolved && /Update complete!|✓ Update complete!/.test(log)) {
          resolved = true;
          emit("\n更新完成！\n");
          _cachedVersion = null;
          resolve({ success: true });
          try {
            proc.kill();
          } catch {
          }
        }
      };
      emit("正在更新...\n");
      proc.stdout?.on("data", (data) => emit(stripAnsi(data.toString())));
      proc.stderr?.on("data", (data) => emit(stripAnsi(data.toString())));
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
        try {
          proc.kill();
        } catch {
        }
      }, 10 * 60 * 1e3);
    });
  });
}
const config = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  APP_DATA_DIR,
  CONFIG_FILE,
  DEFAULT_API_HOST,
  DEFAULT_API_PORT,
  DEFAULT_HERMES_BIN,
  HERMES_HOME,
  PREFERENCES_FILE,
  PROFILES_DIR,
  SAVED_MODELS_FILE,
  USERS_FILE,
  WALLPAPERS_DIR,
  WINDOW_STATE_FILE,
  ensureApiServerConfig,
  getCached,
  getModelFromProfile,
  getProfilePath,
  invalidateCache,
  isApiServerReady,
  loadAppConfig,
  loadPreferences,
  readEnvFile,
  readHermesEnv,
  registerConfigIpcHandlers,
  runHermesCli,
  saveAppConfig,
  savePreferences,
  setCache,
  validateProfileName
}, Symbol.toStringTag, { value: "Module" }));
function escapeSql(val) {
  if (val == null) return "";
  return String(val).replace(/'/g, "''").slice(0, 1e3);
}
function validateSessionId(sid) {
  if (!sid || typeof sid !== "string") return false;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sid)) return false;
  return true;
}
function queryStateDb(sql, params) {
  const dbPath = path.join(HERMES_HOME, "state.db");
  if (!fs.existsSync(dbPath)) return [];
  try {
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        sql = sql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    const result = child_process.execFileSync("sqlite3", ["-json", dbPath, sql], {
      encoding: "utf-8",
      timeout: 5e3
    });
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}
function queryProfileStateDb(profileName, sql, params) {
  if (!validateProfileName(profileName)) return [];
  const dbPath = path.join(
    HERMES_HOME,
    "profiles",
    profileName,
    "state.db"
  );
  if (!fs.existsSync(dbPath)) return queryStateDb(sql, params);
  try {
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        sql = sql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    const result = child_process.execFileSync("sqlite3", ["-json", dbPath, sql], {
      encoding: "utf-8",
      timeout: 5e3
    });
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}
function execStateDb(sql, params) {
  const dbPath = path.join(HERMES_HOME, "state.db");
  if (!fs.existsSync(dbPath)) return false;
  try {
    let finalSql = sql;
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        finalSql = finalSql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    child_process.execFileSync("sqlite3", [dbPath, finalSql], { encoding: "utf-8", timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
function execProfileStateDb(profileName, sql, params) {
  if (!validateProfileName(profileName)) return false;
  const dbPath = path.join(HERMES_HOME, "profiles", profileName, "state.db");
  if (!fs.existsSync(dbPath)) return execStateDb(sql, params);
  try {
    let finalSql = sql;
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        finalSql = finalSql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    child_process.execFileSync("sqlite3", [dbPath, finalSql], { encoding: "utf-8", timeout: 5e3 });
    return true;
  } catch {
    return false;
  }
}
function saveMessage(profileName, sessionId, role, content) {
  const now = Date.now() / 1e3;
  const sql = "INSERT INTO messages (session_id, role, content, timestamp) VALUES (?, ?, ?, ?)";
  if (profileName && profileName !== "default") {
    return execProfileStateDb(profileName, sql, [sessionId, role, content, now]);
  }
  return execStateDb(sql, [sessionId, role, content, now]);
}
function getSessionCount() {
  const stats = queryStateDb("SELECT COUNT(*) as cnt FROM sessions");
  return stats[0] && stats[0].cnt || 0;
}
function getEmployeeSessions(profileName, limit = 20) {
  if (!validateProfileName(profileName)) return [];
  const sessions = queryProfileStateDb(
    profileName,
    "SELECT id, source, model, started_at, ended_at, message_count, title FROM sessions ORDER BY started_at DESC LIMIT ?",
    [limit]
  );
  fillSessionTitles(sessions, (sql, params) => queryProfileStateDb(profileName, sql, params));
  return sessions;
}
function generateSessionTitle(message) {
  if (!message || !message.trim()) return "未命名会话";
  let text = message.trim();
  text = text.replace(/[#*_`~\[\]()]/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "未命名会话";
  if (text.length <= 50) return text;
  return text.slice(0, 47) + "...";
}
function fillSessionTitles(sessions, queryFn) {
  for (let i = 0; i < sessions.length; i++) {
    if (sessions[i].title && String(sessions[i].title).trim() !== "") continue;
    const sid = sessions[i].id;
    const userMsg = queryFn(
      "SELECT content FROM messages WHERE session_id = ? AND role = 'user' AND content IS NOT NULL AND content != '' ORDER BY timestamp ASC LIMIT 1",
      [sid]
    );
    if (userMsg.length > 0 && userMsg[0].content) {
      sessions[i].title = generateSessionTitle(String(userMsg[0].content));
      continue;
    }
    const assistantMsg = queryFn(
      "SELECT content FROM messages WHERE session_id = ? AND role = 'assistant' AND content IS NOT NULL AND content != '' ORDER BY timestamp ASC LIMIT 1",
      [sid]
    );
    if (assistantMsg.length > 0 && assistantMsg[0].content) {
      sessions[i].title = generateSessionTitle(String(assistantMsg[0].content));
      continue;
    }
    sessions[i].title = "未命名会话";
  }
}
function registerSessionIpcHandlers() {
  electron.ipcMain.handle(
    "get-sessions",
    async (_, limit, offset) => {
      const lim = Math.min(
        Math.max(parseInt(String(limit), 10) || 50, 1),
        200
      );
      const off = Math.max(parseInt(String(offset), 10) || 0, 0);
      const sessions = queryStateDb(
        "SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd, actual_cost_usd, title FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
        [lim, off]
      );
      fillSessionTitles(sessions, queryStateDb);
      return sessions;
    }
  );
  electron.ipcMain.handle(
    "get-session-messages",
    async (_, sessionId, profileName) => {
      if (!validateSessionId(sessionId)) return [];
      const sql = "SELECT id, session_id, role, content, tool_name, tool_calls, tool_call_id, timestamp, token_count, finish_reason FROM messages WHERE session_id = ? ORDER BY timestamp ASC";
      if (profileName) {
        return queryProfileStateDb(profileName, sql, [sessionId]);
      }
      return queryStateDb(sql, [sessionId]);
    }
  );
  electron.ipcMain.handle(
    "delete-session",
    async (_, sessionId, profileName) => {
      if (!validateSessionId(sessionId))
        return { success: false, error: "Invalid session ID" };
      try {
        if (profileName && validateProfileName(profileName)) {
          const dbPath = path.join(
            HERMES_HOME,
            "profiles",
            profileName,
            "state.db"
          );
          if (fs.existsSync(dbPath)) {
            queryProfileStateDb(
              profileName,
              "DELETE FROM messages WHERE session_id = ?",
              [sessionId]
            );
            queryProfileStateDb(
              profileName,
              "DELETE FROM sessions WHERE id = ?",
              [sessionId]
            );
            return { success: true };
          }
        }
        queryStateDb("DELETE FROM messages WHERE session_id = ?", [sessionId]);
        queryStateDb("DELETE FROM sessions WHERE id = ?", [sessionId]);
        return { success: true };
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  );
  electron.ipcMain.handle("search-sessions", async (_, query) => {
    if (!query) return [];
    const like = "%" + String(query).slice(0, 200) + "%";
    return queryStateDb(
      "SELECT id, source, model, started_at, ended_at, message_count, title FROM sessions WHERE title LIKE ? OR id IN (SELECT session_id FROM messages WHERE content LIKE ?) ORDER BY started_at DESC LIMIT 50",
      [like, like]
    );
  });
  electron.ipcMain.handle("get-usage-stats", async (_, days) => {
    const d = Math.min(
      Math.max(parseInt(String(days), 10) || 30, 1),
      365
    );
    const cutoff = Date.now() / 1e3 - d * 86400;
    const totals = queryStateDb(
      "SELECT COUNT(*) as total_sessions, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, SUM(cache_read_tokens) as total_cache_read, SUM(estimated_cost_usd) as total_estimated_cost, SUM(actual_cost_usd) as total_actual_cost FROM sessions WHERE started_at > ?",
      [cutoff]
    );
    const byModel = queryStateDb(
      "SELECT model, COUNT(*) as count, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens FROM sessions WHERE started_at > ? GROUP BY model ORDER BY count DESC",
      [cutoff]
    );
    const daily = queryStateDb(
      "SELECT date(started_at, 'unixepoch', 'localtime') as date, COUNT(*) as sessions, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, SUM(estimated_cost_usd) as estimated_cost_usd FROM sessions WHERE started_at > ? GROUP BY date ORDER BY date ASC",
      [cutoff]
    );
    return {
      totals: totals[0] || {},
      by_model: byModel,
      daily
    };
  });
  electron.ipcMain.handle("get-cron-jobs", async (_, profile) => {
    try {
      const effectiveProfile = profile || "default";
      const output = runHermesCli(["cron", "list", "--all"], effectiveProfile);
      if (output.includes("No scheduled jobs")) return [];
      const jobs = [];
      const blocks = output.split(/\n\s*\n/).filter((b) => b.trim());
      for (const block of blocks) {
        const idMatch = block.match(/^\s*(\w+)\s+\[(active|paused)\]/m);
        if (!idMatch) continue;
        const job = {
          id: idMatch[1],
          enabled: idMatch[2] === "active"
        };
        const nameMatch = block.match(/Name:\s*(.+)/);
        if (nameMatch) job.name = nameMatch[1].trim();
        const schedMatch = block.match(/Schedule:\s*(.+)/);
        if (schedMatch) {
          job.schedule = schedMatch[1].trim();
          job.schedule_display = schedMatch[1].trim();
        }
        const promptMatch = block.match(/Prompt:\s*(.+)/);
        if (promptMatch) job.prompt = promptMatch[1].trim();
        const nextMatch = block.match(/Next run:\s*(\S+)/);
        if (nextMatch) job.next_run_at = nextMatch[1].trim();
        const lastMatch = block.match(/Last run:\s*(\S+)/);
        if (lastMatch) job.last_run_at = lastMatch[1].trim();
        const deliverMatch = block.match(/Deliver:\s*(.+)/);
        if (deliverMatch) job.deliver = deliverMatch[1].trim();
        const repeatMatch = block.match(/Repeat:\s*(.+)/);
        if (repeatMatch) job.repeat = repeatMatch[1].trim();
        const warnMatch = block.match(/⚠\s*(.+)/);
        if (warnMatch) job.last_error = warnMatch[1].trim();
        const errMatch = block.match(/Last error:\s*(.+)/);
        if (errMatch) job.last_error = errMatch[1].trim();
        const skillsMatch = block.match(/Skills:\s*(.+)/);
        if (skillsMatch) job.skills = skillsMatch[1].trim();
        jobs.push(job);
      }
      return jobs;
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle(
    "create-cron-job",
    async (_, job) => {
      const args = ["cron", "create"];
      if (job.name) args.push("--name", String(job.name));
      if (job.deliver) args.push("--deliver", String(job.deliver));
      args.push(String(job.schedule || ""));
      args.push(String(job.prompt || ""));
      const profile = job.profile || "default";
      const output = runHermesCli(args, profile);
      return { success: !output.includes("Error") && !output.includes("error"), output };
    }
  );
  electron.ipcMain.handle("pause-cron-job", async (_, jobId, profile) => {
    return {
      success: !runHermesCli(
        ["cron", "pause", String(jobId)],
        profile || "default"
      ).includes("Error")
    };
  });
  electron.ipcMain.handle("resume-cron-job", async (_, jobId, profile) => {
    return {
      success: !runHermesCli(
        ["cron", "resume", String(jobId)],
        profile || "default"
      ).includes("Error")
    };
  });
  electron.ipcMain.handle("trigger-cron-job", async (_, jobId, profile) => {
    return {
      success: !runHermesCli(
        ["cron", "trigger", String(jobId)],
        profile || "default"
      ).includes("Error")
    };
  });
  electron.ipcMain.handle("delete-cron-job", async (_, jobId, profile) => {
    return {
      success: !runHermesCli(
        ["cron", "delete", String(jobId)],
        profile || "default"
      ).includes("Error")
    };
  });
  electron.ipcMain.handle(
    "get-cron-history",
    async (_, limit, offset) => {
      const lim = Math.min(
        Math.max(parseInt(String(limit), 10) || 50, 1),
        200
      );
      const off = Math.max(parseInt(String(offset), 10) || 0, 0);
      return queryStateDb(
        "SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, title FROM sessions WHERE source = 'cron' ORDER BY started_at DESC LIMIT ? OFFSET ?",
        [lim, off]
      );
    }
  );
  electron.ipcMain.handle("run-hermes-backup", async () => {
    try {
      const output = runHermesCli(["backup"], "default");
      return { success: !output.includes("Error"), output };
    } catch (e) {
      return { success: false, output: String(e) };
    }
  });
  electron.ipcMain.handle("run-hermes-import", async (_, filePath) => {
    try {
      const output = runHermesCli(["import", filePath, "--force"], "default");
      return { success: !output.includes("Error"), output };
    } catch (e) {
      return { success: false, output: String(e) };
    }
  });
}
const PROVIDER_KEY_MAP$1 = {
  deepseek: { envKey: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1" },
  qwen: { envKey: "DASHSCOPE_API_KEY", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  zhipu: { envKey: "GLM_API_KEY", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  moonshot: { envKey: "MOONSHOT_API_KEY", baseUrl: "https://api.moonshot.cn/v1" },
  yi: { envKey: "YI_API_KEY", baseUrl: "https://api.lingyiwanwu.com/v1" },
  minimax: { envKey: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.chat/v1" },
  spark: { envKey: "SPARK_API_KEY", baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  siliconflow: { envKey: "SILICONFLOW_API_KEY", baseUrl: "https://api.siliconflow.cn/v1" },
  ernie: { envKey: "QIANFAN_API_KEY", baseUrl: "https://qianfan.baidubce.com/v2" }
};
const _gatewayProcesses = {};
const _idleTimers = {};
function getEmployeeMetaPath(profileName) {
  return path.join(getProfilePath(profileName), "employee.yaml");
}
function readEmployeeMeta(profileName) {
  const metaPath = getEmployeeMetaPath(profileName);
  if (!fs.existsSync(metaPath)) return null;
  try {
    return parse(fs.readFileSync(metaPath, "utf-8"));
  } catch {
    return null;
  }
}
function writeEmployeeMeta(profileName, meta) {
  const profilePath = getProfilePath(profileName);
  ensureDir$1(profilePath);
  fs.writeFileSync(getEmployeeMetaPath(profileName), yamlStringify(meta), "utf-8");
}
function getApiPortForProfile(profileName) {
  const profilePath = getProfilePath(profileName);
  const configPath = path.join(profilePath, "config.yaml");
  try {
    if (fs.existsSync(configPath)) {
      const cfg = parse(fs.readFileSync(configPath, "utf-8"));
      const platforms = cfg.platforms;
      if (platforms?.api_server) {
        const apiServer = platforms.api_server;
        if (apiServer.extra) {
          const extra = apiServer.extra;
          if (extra.port) return extra.port;
        }
      }
      const apiServerDirect = cfg.api_server;
      if (apiServerDirect?.port) return apiServerDirect.port;
    }
  } catch {
  }
  const meta = readEmployeeMeta(profileName);
  if (meta && meta.gateway_port) return meta.gateway_port;
  return null;
}
function getActiveProfileName() {
  const activeFile = path.join(HERMES_HOME, "active_profile");
  try {
    if (fs.existsSync(activeFile)) {
      return fs.readFileSync(activeFile, "utf-8").trim() || "default";
    }
  } catch {
  }
  return "default";
}
function listEmployees() {
  const employees2 = [];
  const activeName = getActiveProfileName();
  const defaultConfigPath = path.join(HERMES_HOME, "config.yaml");
  let defaultModel = "";
  let defaultProvider = "";
  try {
    if (fs.existsSync(defaultConfigPath)) {
      const cfg = parse(fs.readFileSync(defaultConfigPath, "utf-8"));
      const m = cfg.model;
      defaultModel = m?.default || "";
      defaultProvider = m?.provider || "";
    }
  } catch {
  }
  const defaultMeta = readEmployeeMeta("default");
  employees2.push({
    name: "default",
    displayName: defaultMeta?.name || "默认员工",
    role: defaultMeta?.role || "通用助手",
    avatar: defaultMeta?.avatar || "🤖",
    color: defaultMeta?.color || "#4A90D9",
    tags: defaultMeta?.tags || [],
    petSlug: defaultMeta?.petSlug || "",
    model: defaultModel,
    provider: defaultProvider,
    isActive: activeName === "default",
    hasSoul: fs.existsSync(path.join(HERMES_HOME, "SOUL.md")),
    hasEnv: fs.existsSync(path.join(HERMES_HOME, ".env")),
    gateway_port: getApiPortForProfile("default") || DEFAULT_API_PORT,
    idle_timeout: defaultMeta?.idle_timeout || 30,
    created_at: defaultMeta?.created_at || ""
  });
  if (fs.existsSync(PROFILES_DIR)) {
    try {
      const dirs = fs.readdirSync(PROFILES_DIR);
      for (const dir of dirs) {
        if (dir.startsWith(".")) continue;
        const profilePath = path.join(PROFILES_DIR, dir);
        const stat = fs.statSync(profilePath);
        if (!stat.isDirectory()) continue;
        const configPath = path.join(profilePath, "config.yaml");
        let model = "";
        let provider = "";
        try {
          if (fs.existsSync(configPath)) {
            const cfg = parse(fs.readFileSync(configPath, "utf-8"));
            const m = cfg.model;
            model = m?.default || "";
            provider = m?.provider || "";
          }
        } catch {
        }
        const meta = readEmployeeMeta(dir);
        employees2.push({
          name: dir,
          displayName: meta?.name || dir,
          role: meta?.role || "员工",
          avatar: meta?.avatar || "🧑‍💼",
          color: meta?.color || "#6C5CE7",
          tags: meta?.tags || [],
          petSlug: meta?.petSlug || "",
          model,
          provider,
          isActive: activeName === dir,
          hasSoul: fs.existsSync(path.join(profilePath, "SOUL.md")),
          hasEnv: fs.existsSync(path.join(profilePath, ".env")),
          gateway_port: getApiPortForProfile(dir) || DEFAULT_API_PORT,
          idle_timeout: meta?.idle_timeout || 30,
          created_at: meta?.created_at || ""
        });
      }
    } catch {
    }
  }
  return employees2;
}
function allocatePort() {
  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes;
  const portRange = hermesCfg?.port_range;
  const rangeStart = portRange && portRange[0] || 8644;
  const rangeEnd = portRange && portRange[1] || 8743;
  const usedPorts = [];
  const employees2 = listEmployees();
  for (const emp of employees2) {
    const port = getApiPortForProfile(emp.name);
    if (port) usedPorts.push(port);
  }
  for (let port = rangeStart; port <= rangeEnd; port++) {
    if (!usedPorts.includes(port)) return port;
  }
  return null;
}
async function getEmployeeStatus(profileName) {
  if (!validateProfileName(profileName)) return "idle";
  const port = getApiPortForProfile(profileName);
  if (!port) return "idle";
  if (_gatewayProcesses[profileName] && !_gatewayProcesses[profileName].killed) {
    const ready = await isApiServerReady(port);
    return ready ? "online" : "starting";
  }
  const pidFile = path.join(getProfilePath(profileName), "gateway.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const raw = fs.readFileSync(pidFile, "utf-8").trim();
      const pid = raw.startsWith("{") ? JSON.parse(raw).pid : parseInt(raw, 10);
      if (typeof pid === "number" && !isNaN(pid)) {
        process.kill(pid, 0);
        const ready = await isApiServerReady(port);
        return ready ? "online" : "starting";
      }
    } catch {
    }
  }
  return "idle";
}
async function wakeUpEmployee(profileName, mainWindow2) {
  const currentStatus = await getEmployeeStatus(profileName);
  if (currentStatus === "online") return { success: true, status: "online" };
  if (currentStatus === "starting")
    return { success: true, status: "starting", message: "正在启动中..." };
  const port = getApiPortForProfile(profileName);
  if (!port) return { success: false, error: "未配置端口" };
  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes;
  const hermesBin = hermesCfg?.bin || DEFAULT_HERMES_BIN;
  const defaults = appConfig.defaults;
  const maxOnline = defaults?.max_online || 5;
  const onlineCount = Object.keys(_gatewayProcesses).filter(
    (k) => !_gatewayProcesses[k].killed
  ).length;
  if (onlineCount >= maxOnline) {
    return {
      success: false,
      error: "同时在线员工数已达上限 (" + maxOnline + ")，请先让其他员工休息"
    };
  }
  const env = Object.assign({}, process.env, {
    HOME: os.homedir(),
    HERMES_HOME,
    API_SERVER_ENABLED: "true"
  });
  const hermesEnv = readHermesEnv(profileName);
  console.log("[wakeUpEmployee] profile:", profileName, "hermesEnv keys:", Object.keys(hermesEnv));
  for (const [key, value] of Object.entries(hermesEnv)) {
    if (value) env[key] = value;
  }
  const globalEnv = readHermesEnv("default");
  for (const [key, value] of Object.entries(globalEnv)) {
    if (value && !env[key]) env[key] = value;
  }
  try {
    const configPath = path.join(getProfilePath(profileName), "config.yaml");
    if (fs.existsSync(configPath)) {
      const cfg = parse(fs.readFileSync(configPath, "utf-8"));
      const m = cfg.model;
      let provider = m?.provider || "";
      const providerInfo = PROVIDER_KEY_MAP$1[provider];
      const isCustomProvider = !providerInfo && provider !== "";
      console.log("[wakeUpEmployee] config provider:", provider, "isBuiltin:", !!providerInfo, "isCustom:", isCustomProvider);
      if (!providerInfo && provider !== "custom" && provider !== "") {
        const baseUrl = m?.base_url || "";
        for (const [pid, info] of Object.entries(PROVIDER_KEY_MAP$1)) {
          if (baseUrl && info.baseUrl === baseUrl) {
            provider = pid;
            console.log("[wakeUpEmployee] auto-corrected provider from", m?.provider, "to", pid);
            m.provider = pid;
            safeWriteFile(configPath, yamlStringify(cfg));
            break;
          }
        }
      }
      const resolvedProviderInfo = PROVIDER_KEY_MAP$1[provider];
      if (resolvedProviderInfo) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = m?.base_url || resolvedProviderInfo.baseUrl || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        if (env[resolvedProviderInfo.envKey]) {
          env.OPENAI_API_KEY = env[resolvedProviderInfo.envKey];
        }
        delete env.HERMES_INFERENCE_PROVIDER;
        const envPath = path.join(getProfilePath(profileName), ".env");
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, "utf-8");
          const lines = envContent.split("\n");
          let changed = false;
          const filtered = lines.filter((l) => {
            const eqIdx = l.indexOf("=");
            if (eqIdx === -1) return true;
            const key = l.slice(0, eqIdx).trim();
            if (key === "HERMES_INFERENCE_PROVIDER") {
              changed = true;
              return false;
            }
            return true;
          });
          const hasOpenaiKey = filtered.some((l) => {
            const eqIdx = l.indexOf("=");
            return eqIdx !== -1 && l.slice(0, eqIdx).trim() === "OPENAI_API_KEY";
          });
          if (!hasOpenaiKey && env[resolvedProviderInfo.envKey]) {
            filtered.push("OPENAI_API_KEY=" + env[resolvedProviderInfo.envKey]);
            changed = true;
          }
          if (changed) {
            safeWriteFile(envPath, filtered.join("\n"));
            console.log("[wakeUpEmployee] updated .env: added OPENAI_API_KEY, removed HERMES_INFERENCE_PROVIDER");
          }
        }
      } else if (provider === "custom" || isCustomProvider) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = m?.base_url || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        const keyFromEnv = hermesEnv.OPENAI_API_KEY || "";
        if (keyFromEnv) {
          env.OPENAI_API_KEY = keyFromEnv;
          env.CUSTOM_API_KEY = keyFromEnv;
        } else {
          for (const info of Object.values(PROVIDER_KEY_MAP$1)) {
            const v = env[info.envKey];
            if (v) {
              env.OPENAI_API_KEY = v;
              env.CUSTOM_API_KEY = v;
              break;
            }
          }
        }
        env.CUSTOM_API_BASE_URL = env.OPENAI_BASE_URL || "";
        env.HERMES_INFERENCE_PROVIDER = "custom";
        const envPath = path.join(getProfilePath(profileName), ".env");
        if (fs.existsSync(envPath) && env.OPENAI_API_KEY) {
          let envContent = fs.readFileSync(envPath, "utf-8");
          const lines = envContent.split("\n");
          const hasOpenaiKey = lines.some((l) => {
            const eqIdx = l.indexOf("=");
            return eqIdx !== -1 && l.slice(0, eqIdx).trim() === "OPENAI_API_KEY";
          });
          if (!hasOpenaiKey) {
            safeWriteFile(envPath, envContent.trimEnd() + "\nOPENAI_API_KEY=" + env.OPENAI_API_KEY + "\n");
            console.log("[wakeUpEmployee] added OPENAI_API_KEY to .env for custom provider");
          }
        }
      }
      console.log("[wakeUpEmployee] final env has DEEPSEEK_API_KEY:", !!env.DEEPSEEK_API_KEY, "OPENAI_API_KEY:", !!env.OPENAI_API_KEY, "HERMES_INFERENCE_PROVIDER:", env.HERMES_INFERENCE_PROVIDER);
    }
  } catch {
  }
  const args = profileName === "default" ? ["gateway", "run"] : ["gateway", "run", "-p", profileName];
  const proc = child_process.spawn(hermesBin, args, {
    env,
    cwd: getProfilePath(profileName),
    stdio: "ignore",
    detached: true
  });
  _gatewayProcesses[profileName] = proc;
  proc.unref();
  proc.on("close", () => {
    delete _gatewayProcesses[profileName];
    clearIdleTimer(profileName);
    if (mainWindow2 && !mainWindow2.isDestroyed()) {
      mainWindow2.webContents.send("employee-status-changed", {
        profileName,
        status: "idle"
      });
    }
  });
  const startupTimeout = (defaults?.startup_timeout || 30) * 1e3;
  const startTime = Date.now();
  while (Date.now() - startTime < startupTimeout) {
    await new Promise((r) => setTimeout(r, 1e3));
    const ready = await isApiServerReady(port);
    if (ready) {
      resetIdleTimer(profileName, mainWindow2);
      if (mainWindow2 && !mainWindow2.isDestroyed()) {
        mainWindow2.webContents.send("employee-status-changed", {
          profileName,
          status: "online"
        });
      }
      return { success: true, status: "online" };
    }
  }
  return { success: false, error: "Gateway 启动超时" };
}
function putEmployeeToSleep(profileName, mainWindow2) {
  clearIdleTimer(profileName);
  const hadManagedProcess = _gatewayProcesses[profileName] && !_gatewayProcesses[profileName].killed;
  if (hadManagedProcess) {
    _gatewayProcesses[profileName].kill("SIGTERM");
    delete _gatewayProcesses[profileName];
  }
  const pidFile = path.join(getProfilePath(profileName), "gateway.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const raw = fs.readFileSync(pidFile, "utf-8").trim();
      const pid = raw.startsWith("{") ? JSON.parse(raw).pid : parseInt(raw, 10);
      if (typeof pid === "number" && !isNaN(pid)) {
        process.kill(pid, "SIGTERM");
      }
      fs.unlinkSync(pidFile);
    } catch {
    }
  }
  if (!hadManagedProcess) {
    if (mainWindow2 && !mainWindow2.isDestroyed()) {
      mainWindow2.webContents.send("employee-status-changed", {
        profileName,
        status: "idle"
      });
    }
  }
  return { success: true };
}
function resetIdleTimer(profileName, mainWindow2) {
  const meta = readEmployeeMeta(profileName);
  const defaults = loadAppConfig().defaults;
  const timeout = meta?.idle_timeout || defaults?.idle_timeout || 30;
  if (timeout === 0) return;
  clearIdleTimer(profileName);
  _idleTimers[profileName] = setTimeout(() => {
    putEmployeeToSleep(profileName, mainWindow2);
    if (mainWindow2 && !mainWindow2.isDestroyed()) {
      mainWindow2.webContents.send("employee-idle-timeout", { profileName });
    }
  }, timeout * 60 * 1e3);
}
function clearIdleTimer(profileName) {
  if (_idleTimers[profileName]) {
    clearTimeout(_idleTimers[profileName]);
    delete _idleTimers[profileName];
  }
}
function registerEmployeeIpcHandlers(getMainWindow2) {
  electron.ipcMain.handle("skills:listInstalled", async (_, profile) => {
    const { listInstalledSkills } = await Promise.resolve().then(() => require("./skills-3TgKCsCX.js"));
    return listInstalledSkills(profile);
  });
  electron.ipcMain.handle("skills:listBundled", async (_, profile) => {
    const { listBundledSkills } = await Promise.resolve().then(() => require("./skills-3TgKCsCX.js"));
    return listBundledSkills(profile);
  });
  electron.ipcMain.handle("skills:getContent", async (_, skillPath) => {
    const { getSkillContent } = await Promise.resolve().then(() => require("./skills-3TgKCsCX.js"));
    return getSkillContent(skillPath);
  });
  electron.ipcMain.handle("skills:install", async (_, identifier, profile) => {
    const { installSkill } = await Promise.resolve().then(() => require("./skills-3TgKCsCX.js"));
    return installSkill(identifier, profile);
  });
  electron.ipcMain.handle("skills:uninstall", async (_, name, profile) => {
    const { uninstallSkill } = await Promise.resolve().then(() => require("./skills-3TgKCsCX.js"));
    return uninstallSkill(name, profile);
  });
  electron.ipcMain.handle("employee:list", async () => {
    const employees2 = listEmployees();
    const result = [];
    for (const emp of employees2) {
      const status = await getEmployeeStatus(emp.name);
      result.push({ ...emp, status });
    }
    return result;
  });
  electron.ipcMain.handle("employee:get", async (_, name) => {
    const employees2 = listEmployees();
    const emp = employees2.find((e) => e.name === name);
    if (!emp) return null;
    const status = await getEmployeeStatus(name);
    return { ...emp, status };
  });
  electron.ipcMain.handle(
    "employee:create",
    async (_, config2) => {
      const name = config2.name;
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
      const defaults = appConfig.defaults || {};
      const port = config2.gateway_port || allocatePort();
      if (!port) return { error: "没有可用端口" };
      const output = runHermesCli(["profile", "create", name], "default");
      if (output.includes("Error") || output.includes("error")) {
        if (!fs.existsSync(profilePath)) {
          ensureDir$1(profilePath);
        }
      }
      const model = config2.model || defaults.model || "";
      const provider = config2.provider || defaults.provider || "";
      const baseUrl = config2.base_url || defaults.base_url || "";
      const configYaml = yamlStringify({
        model: { default: model, provider, base_url: baseUrl },
        platforms: {
          api_server: {
            extra: { port, host: "127.0.0.1" }
          }
        },
        platform_toolsets: {
          cli: config2.tools || defaults.tools || [
            "browser",
            "terminal",
            "file",
            "memory",
            "web",
            "code"
          ],
          api_server: config2.tools || defaults.tools || [
            "browser",
            "terminal",
            "file",
            "memory",
            "web",
            "code"
          ]
        },
        agent: { max_turns: 60, reasoning_effort: "medium" },
        memory: { enabled: true, max_chars: 2200 },
        compression: { enabled: true, target_ratio: 0.2 }
      });
      ensureDir$1(profilePath);
      fs.writeFileSync(
        path.join(profilePath, "config.yaml"),
        configYaml,
        "utf-8"
      );
      if (config2.api_key || defaults.api_key) {
        const envContent = "OPENAI_API_KEY=" + (config2.api_key || defaults.api_key) + "\n";
        fs.writeFileSync(path.join(profilePath, ".env"), envContent, "utf-8");
      }
      if (config2.soul) {
        fs.writeFileSync(
          path.join(profilePath, "SOUL.md"),
          config2.soul,
          "utf-8"
        );
      }
      writeEmployeeMeta(name, {
        name: config2.displayName || name,
        role: config2.role || "员工",
        avatar: config2.avatar || "🧑‍💼",
        color: config2.color || "#6C5CE7",
        tags: config2.tags || [],
        petSlug: config2.petSlug || "",
        gateway_port: port,
        idle_timeout: config2.idle_timeout || defaults.idle_timeout || 30,
        created_at: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
      });
      if (config2.wakeUp) {
        setTimeout(
          () => wakeUpEmployee(name, getMainWindow2()),
          500
        );
      }
      const win = getMainWindow2();
      if (win && !win.isDestroyed()) {
        win.webContents.send("employee-list-changed", { action: "created", name });
      }
      return { success: true, name };
    }
  );
  electron.ipcMain.handle(
    "employee:update",
    async (_, name, changes) => {
      const meta = readEmployeeMeta(name) || {};
      if (changes.displayName !== void 0) meta.name = changes.displayName;
      if (changes.role !== void 0) meta.role = changes.role;
      if (changes.avatar !== void 0) meta.avatar = changes.avatar;
      if (changes.color !== void 0) meta.color = changes.color;
      if (changes.tags !== void 0) meta.tags = changes.tags;
      if (changes.idle_timeout !== void 0)
        meta.idle_timeout = changes.idle_timeout;
      writeEmployeeMeta(name, meta);
      return { success: true };
    }
  );
  electron.ipcMain.handle("employee:delete", async (_, name) => {
    if (name === "default") return { error: "不能删除默认员工" };
    await putEmployeeToSleep(name, getMainWindow2());
    const output = runHermesCli(
      ["profile", "delete", name, "--yes"],
      "default"
    );
    const success = !output.includes("Error");
    if (success) {
      const win = getMainWindow2();
      if (win && !win.isDestroyed()) {
        win.webContents.send("employee-list-changed", { action: "deleted", name });
      }
    }
    return { success };
  });
  electron.ipcMain.handle("employee:wake-up", async (_, name) => {
    return wakeUpEmployee(name, getMainWindow2());
  });
  electron.ipcMain.handle("employee:sleep", async (_, name) => {
    return putEmployeeToSleep(name, getMainWindow2());
  });
  electron.ipcMain.handle("employee:restart", async (_, name) => {
    putEmployeeToSleep(name, getMainWindow2());
    await new Promise((r) => setTimeout(r, 2e3));
    return wakeUpEmployee(name, getMainWindow2());
  });
  electron.ipcMain.handle("employee:status", async (_, name) => {
    return getEmployeeStatus(name);
  });
  electron.ipcMain.handle("employee:get-soul", async (_, name) => {
    if (!validateProfileName(name) && name !== "default") return "";
    const soulPath = path.join(getProfilePath(name), "SOUL.md");
    if (!fs.existsSync(soulPath)) return "";
    try {
      return fs.readFileSync(soulPath, "utf-8");
    } catch {
      return "";
    }
  });
  electron.ipcMain.handle(
    "employee:set-soul",
    async (_, name, content) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      const profilePath = getProfilePath(name);
      ensureDir$1(profilePath);
      safeWriteFile(path.join(profilePath, "SOUL.md"), content);
      return { success: true };
    }
  );
  electron.ipcMain.handle("employee:reset-soul", async (_, name) => {
    if (!validateProfileName(name) && name !== "default")
      return { error: "无效的员工名称" };
    const defaultSoul = "You are Hermes, a helpful AI assistant. You are friendly, knowledgeable, and always eager to help.\nYou communicate clearly and concisely. When asked to perform tasks, you think step-by-step and explain your reasoning.\nYou are honest about your limitations and ask for clarification when needed.\n";
    const profilePath = getProfilePath(name);
    ensureDir$1(profilePath);
    safeWriteFile(path.join(profilePath, "SOUL.md"), defaultSoul);
    return { success: true, soul: defaultSoul };
  });
  electron.ipcMain.handle("employee:get-config", async (_, name) => {
    if (!validateProfileName(name) && name !== "default") return null;
    const configPath = path.join(getProfilePath(name), "config.yaml");
    if (!fs.existsSync(configPath)) return null;
    try {
      return parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return null;
    }
  });
  electron.ipcMain.handle(
    "employee:set-config",
    async (_, name, configObj) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      const profilePath = getProfilePath(name);
      ensureDir$1(profilePath);
      const configPath = path.join(profilePath, "config.yaml");
      let existing = {};
      try {
        if (fs.existsSync(configPath)) {
          existing = parse(fs.readFileSync(configPath, "utf-8"));
        }
      } catch {
      }
      const merged = { ...existing, ...configObj };
      safeWriteFile(configPath, yamlStringify(merged));
      return { success: true };
    }
  );
  electron.ipcMain.handle("employee:get-env", async (_, name) => {
    const env = readHermesEnv(name);
    const result = {};
    for (const [key, val] of Object.entries(env)) {
      if (key.includes("KEY") || key.includes("TOKEN") || key.includes("SECRET")) {
        result[key] = val.slice(0, 4) + "****";
      } else {
        result[key] = val;
      }
    }
    return result;
  });
  electron.ipcMain.handle(
    "employee:set-env",
    async (_, name, envObj) => {
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
      ensureDir$1(profilePath);
      const existing = readHermesEnv(name);
      const merged = Object.assign({}, existing, envObj);
      let content = "";
      for (const [key, val] of Object.entries(merged)) {
        if (val) content += key + "=" + val + "\n";
      }
      fs.writeFileSync(path.join(profilePath, ".env"), content, "utf-8");
      return { success: true };
    }
  );
  electron.ipcMain.handle("employee:get-skills", async (_, name) => {
    if (!validateProfileName(name) && name !== "default") return [];
    const skillsDir = path.join(getProfilePath(name), "skills");
    if (!fs.existsSync(skillsDir)) return [];
    try {
      const skills = [];
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
  });
  electron.ipcMain.handle(
    "employee:install-skill",
    async (_, name, url) => {
      const output = runHermesCli(
        ["skills", "install", url, "-p", name],
        name
      );
      if (output.includes("Error") || output.includes("error")) {
        return { error: output };
      }
      return { success: true, output };
    }
  );
  electron.ipcMain.handle(
    "employee:remove-skill",
    async (_, name, skillName) => {
      const skillDir = path.join(getProfilePath(name), "skills", skillName);
      if (!fs.existsSync(skillDir)) {
        return { error: "技能 " + skillName + " 不存在" };
      }
      try {
        fs.rmSync(skillDir, { recursive: true, force: true });
        return { success: true };
      } catch (e) {
        return { error: e.message };
      }
    }
  );
  electron.ipcMain.handle("employee:get-tools", async (_, name) => {
    if (!validateProfileName(name) && name !== "default") return [];
    const configPath = path.join(getProfilePath(name), "config.yaml");
    if (!fs.existsSync(configPath)) return [];
    try {
      const cfg = parse(fs.readFileSync(configPath, "utf-8"));
      const pt = cfg.platform_toolsets;
      if (pt?.api_server && Array.isArray(pt.api_server)) {
        return pt.api_server;
      }
      if (pt?.cli && Array.isArray(pt.cli)) {
        return pt.cli;
      }
      const platforms = cfg.platforms;
      const cli = platforms?.cli;
      if (cli?.tools && Array.isArray(cli.tools)) {
        return cli.tools;
      }
      return [];
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle(
    "employee:set-tools",
    async (_, name, tools) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      const profilePath = getProfilePath(name);
      ensureDir$1(profilePath);
      const configPath = path.join(profilePath, "config.yaml");
      let cfg = {};
      try {
        if (fs.existsSync(configPath)) {
          cfg = parse(fs.readFileSync(configPath, "utf-8"));
        }
      } catch {
      }
      if (!cfg.platform_toolsets) cfg.platform_toolsets = {};
      cfg.platform_toolsets.cli = tools;
      cfg.platform_toolsets.api_server = tools;
      safeWriteFile(configPath, yamlStringify(cfg));
      return { success: true };
    }
  );
  electron.ipcMain.handle(
    "employee:toggle-tool",
    async (_, name, toolKey, enabled) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      const profilePath = getProfilePath(name);
      ensureDir$1(profilePath);
      const configPath = path.join(profilePath, "config.yaml");
      let cfg = {};
      try {
        if (fs.existsSync(configPath)) {
          cfg = parse(fs.readFileSync(configPath, "utf-8"));
        }
      } catch {
      }
      let currentTools = [];
      const pt = cfg.platform_toolsets;
      if (pt?.api_server && Array.isArray(pt.api_server)) {
        currentTools = pt.api_server.slice();
      } else if (pt?.cli && Array.isArray(pt.cli)) {
        currentTools = pt.cli.slice();
      } else {
        const platforms = cfg.platforms;
        const cli = platforms?.cli;
        if (cli?.tools && Array.isArray(cli.tools)) {
          currentTools = cli.tools.slice();
        }
      }
      if (enabled) {
        if (currentTools.indexOf(toolKey) < 0) currentTools.push(toolKey);
      } else {
        currentTools = currentTools.filter((t) => t !== toolKey);
      }
      if (!cfg.platform_toolsets) cfg.platform_toolsets = {};
      cfg.platform_toolsets.cli = currentTools;
      cfg.platform_toolsets.api_server = currentTools;
      safeWriteFile(configPath, yamlStringify(cfg));
      return { success: true, tools: currentTools };
    }
  );
  electron.ipcMain.handle("employee:get-memory", async (_, name) => {
    if (!validateProfileName(name) && name !== "default")
      return { memory: [], user: "", stats: {} };
    try {
      const result = {
        memory: [],
        user: "",
        stats: {}
      };
      const memPath = path.join(
        getProfilePath(name),
        "memories",
        "MEMORY.md"
      );
      if (fs.existsSync(memPath)) {
        const content = fs.readFileSync(memPath, "utf-8");
        const entries = content.split("\n§\n").filter((e) => e.trim().length > 0);
        result.memory = entries.map(
          (e, i) => ({ index: i, content: e.trim() })
        );
        result.memoryCharCount = content.length;
        result.memoryCharLimit = 2200;
      }
      const userPath = path.join(
        getProfilePath(name),
        "memories",
        "USER.md"
      );
      if (fs.existsSync(userPath)) {
        result.user = fs.readFileSync(userPath, "utf-8");
        result.userCharCount = result.user.length;
        result.userCharLimit = 1375;
      }
      result.stats = { totalSessions: getSessionCount() };
      return result;
    } catch {
      return { memory: [], user: "", stats: {} };
    }
  });
  electron.ipcMain.handle(
    "employee:add-memory",
    async (_, name, content) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      try {
        const memDir = path.join(getProfilePath(name), "memories");
        ensureDir$1(memDir);
        const memPath = path.join(memDir, "MEMORY.md");
        let existing = "";
        if (fs.existsSync(memPath))
          existing = fs.readFileSync(memPath, "utf-8");
        const newContent = existing.trim() ? existing.trimEnd() + "\n§\n" + content.trim() : content.trim();
        if (newContent.length > 2200)
          return {
            error: "超出记忆容量限制 (" + newContent.length + "/2200)"
          };
        safeWriteFile(memPath, newContent);
        return { success: true };
      } catch (e) {
        return { error: String(e) };
      }
    }
  );
  electron.ipcMain.handle(
    "employee:delete-memory",
    async (_, name, index) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      try {
        const memPath = path.join(
          getProfilePath(name),
          "memories",
          "MEMORY.md"
        );
        if (!fs.existsSync(memPath)) return { error: "记忆文件不存在" };
        const content = fs.readFileSync(memPath, "utf-8");
        const entries = content.split("\n§\n").filter((e) => e.trim().length > 0);
        const idx = parseInt(String(index), 10);
        if (idx < 0 || idx >= entries.length)
          return { error: "条目不存在" };
        entries.splice(idx, 1);
        safeWriteFile(memPath, entries.join("\n§\n"));
        return { success: true };
      } catch (e) {
        return { error: String(e) };
      }
    }
  );
  electron.ipcMain.handle(
    "employee:rename",
    async (_, oldName, newName) => {
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
        "default"
      );
      if (output.includes("Error") || output.includes("error")) {
        return { error: output };
      }
      const meta = readEmployeeMeta(newName);
      if (meta) {
        meta.name = meta.name === oldName ? newName : meta.name;
        writeEmployeeMeta(newName, meta);
      }
      return { success: true };
    }
  );
  electron.ipcMain.handle("employee:set-pet", async (_, name, petSlug) => {
    if (!validateProfileName(name)) return { error: "无效的员工名称" };
    const meta = readEmployeeMeta(name);
    if (!meta) return { error: "员工不存在" };
    meta.petSlug = petSlug;
    writeEmployeeMeta(name, meta);
    const win = getMainWindow2();
    if (win && !win.isDestroyed()) {
      win.webContents.send("employee-list-changed", { action: "updated", name });
    }
    return { success: true };
  });
  electron.ipcMain.handle("employee:export", async (_, name) => {
    if (!validateProfileName(name)) return { error: "无效的员工名称" };
    const output = runHermesCli(["profile", "export", name], "default");
    if (output.includes("Error") || output.includes("error")) {
      return { error: output };
    }
    return { success: true, output };
  });
  electron.ipcMain.handle("employee:get-sessions", async (_, name) => {
    if (!validateProfileName(name)) return [];
    return getEmployeeSessions(name, 20);
  });
}
const employees = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  _gatewayProcesses,
  _idleTimers,
  allocatePort,
  clearIdleTimer,
  getActiveProfileName,
  getApiPortForProfile,
  getEmployeeStatus,
  listEmployees,
  putEmployeeToSleep,
  readEmployeeMeta,
  registerEmployeeIpcHandlers,
  resetIdleTimer,
  wakeUpEmployee,
  writeEmployeeMeta
}, Symbol.toStringTag, { value: "Module" }));
const PROVIDER_KEY_MAP = {
  deepseek: { envKey: "DEEPSEEK_API_KEY", baseUrl: "https://api.deepseek.com/v1" },
  qwen: { envKey: "DASHSCOPE_API_KEY", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
  zhipu: { envKey: "GLM_API_KEY", baseUrl: "https://open.bigmodel.cn/api/paas/v4" },
  moonshot: { envKey: "MOONSHOT_API_KEY", baseUrl: "https://api.moonshot.cn/v1" },
  yi: { envKey: "YI_API_KEY", baseUrl: "https://api.lingyiwanwu.com/v1" },
  minimax: { envKey: "MINIMAX_API_KEY", baseUrl: "https://api.minimax.chat/v1" },
  spark: { envKey: "SPARK_API_KEY", baseUrl: "https://spark-api-open.xf-yun.com/v1" },
  siliconflow: { envKey: "SILICONFLOW_API_KEY", baseUrl: "https://api.siliconflow.cn/v1" },
  ernie: { envKey: "QIANFAN_API_KEY", baseUrl: "https://qianfan.baidubce.com/v2" }
};
const _currentChatReqs = {};
const _pendingApprovals = {};
function sendMessageViaApi(profileName, message, event, history, mainWindow2) {
  const port = getApiPortForProfile(profileName);
  if (!port) {
    event.sender.send("chat-error", { profileName, error: "员工未配置端口" });
    return;
  }
  const model = getModelFromProfile(profileName);
  const controller = new AbortController();
  _currentChatReqs[profileName] = controller;
  resetIdleTimer(profileName, mainWindow2);
  const messages = [];
  if (history && history.length > 0) {
    for (const msg of history) {
      messages.push({
        role: msg.role === "agent" ? "assistant" : msg.role,
        content: msg.content
      });
    }
  }
  messages.push({ role: "user", content: message });
  const body = JSON.stringify({
    model: model || "hermes-agent",
    messages,
    stream: true
  });
  let sessionId = "";
  let hasContent = false;
  let finished = false;
  let lastError = "";
  function finish(error) {
    if (finished) return;
    finished = true;
    delete _currentChatReqs[profileName];
    if (error) {
      event.sender.send("chat-error", { profileName, error });
    } else {
      event.sender.send("chat-done", {
        profileName,
        sessionId: sessionId || void 0
      });
      const emp = listEmployees().find((e) => e.name === profileName);
      const displayName = emp ? emp.displayName : profileName;
      showChatNotification(displayName, "聊天完成", mainWindow2);
    }
  }
  function processSseData(data) {
    if (data === "[DONE]") {
      if (hasContent) {
        finish();
      } else if (lastError) {
        finish(lastError);
      } else {
        probeRealError();
      }
      return true;
    }
    try {
      const parsed = JSON.parse(data);
      if (parsed.error) {
        lastError = parsed.error.message || JSON.stringify(parsed.error);
        return false;
      }
      const choice = parsed.choices && parsed.choices[0];
      const delta = choice && choice.delta;
      if (parsed.usage) {
        event.sender.send("chat-usage", {
          profileName,
          promptTokens: parsed.usage.prompt_tokens || 0,
          completionTokens: parsed.usage.completion_tokens || 0,
          totalTokens: parsed.usage.total_tokens || 0
        });
      }
      if (delta && delta.content) {
        hasContent = true;
        event.sender.send("chat-chunk", {
          profileName,
          chunk: delta.content
        });
      }
      if (delta && delta.reasoning_content) {
        event.sender.send("chat-thinking", {
          profileName,
          chunk: delta.reasoning_content
        });
      }
    } catch {
    }
    return false;
  }
  function probeRealError() {
    const probeBody = JSON.stringify({
      model: model || "hermes-agent",
      messages: [{ role: "user", content: message }],
      stream: false
    });
    const probeReq = http.request(
      {
        hostname: DEFAULT_API_HOST,
        port,
        path: "/v1/chat/completions",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        timeout: 3e4
      },
      (res) => {
        let raw = "";
        res.on("data", (d) => {
          raw += d.toString();
        });
        res.on("end", () => {
          try {
            const parsed = JSON.parse(raw);
            const content = parsed.choices && parsed.choices[0] && parsed.choices[0].message && parsed.choices[0].message.content;
            const errMsg = parsed.error && parsed.error.message;
            finish(
              content || errMsg || "未收到模型响应，请检查模型配置和 API Key"
            );
          } catch {
            finish("未收到模型响应，请检查模型配置和 API Key");
          }
        });
      }
    );
    probeReq.on("error", () => {
      finish("未收到模型响应，请检查模型配置和 API Key");
    });
    probeReq.write(probeBody);
    probeReq.end();
  }
  function processSseBlock(block) {
    let eventType = "";
    let dataLine = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("event: ")) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        dataLine = line.slice(6);
      }
    }
    if (!dataLine) return false;
    if (eventType === "hermes.tool.progress") {
      try {
        const payload = JSON.parse(dataLine);
        const label = payload.label || payload.tool || "";
        const emoji = payload.emoji || "";
        event.sender.send("chat-tool-progress", {
          profileName,
          tool: emoji ? emoji + " " + label : label,
          toolName: payload.tool || payload.name || label,
          args: payload.args || payload.arguments || null,
          result: payload.result || null,
          error: payload.error || null,
          status: payload.status || "running"
        });
      } catch {
      }
      return false;
    }
    if (eventType === "hermes.tool.start") {
      try {
        const payload = JSON.parse(dataLine);
        event.sender.send("chat-tool-start", {
          profileName,
          toolName: payload.tool || payload.name || "",
          args: payload.args || payload.arguments || null
        });
      } catch {
      }
      return false;
    }
    if (eventType === "hermes.tool.end") {
      try {
        const payload = JSON.parse(dataLine);
        event.sender.send("chat-tool-end", {
          profileName,
          toolName: payload.tool || payload.name || "",
          result: payload.result || null,
          error: payload.error || null
        });
      } catch {
      }
      return false;
    }
    if (eventType === "hermes.approval") {
      try {
        const payload = JSON.parse(dataLine);
        const approvalId = payload.id || payload.approval_id || Date.now().toString();
        _pendingApprovals[profileName + ":" + approvalId] = {
          profileName,
          approvalId,
          payload,
          ts: Date.now()
        };
        event.sender.send("chat-approval-request", {
          profileName,
          approvalId,
          tool: payload.tool || payload.name || "",
          command: payload.command || (payload.args ? JSON.stringify(payload.args) : ""),
          risk: payload.risk || "medium"
        });
      } catch {
      }
      return false;
    }
    return processSseData(dataLine);
  }
  const headers = {
    "Content-Type": "application/json"
  };
  const req = http.request(
    {
      hostname: DEFAULT_API_HOST,
      port,
      path: "/v1/chat/completions",
      method: "POST",
      headers,
      signal: controller.signal,
      timeout: 12e4
    },
    (res) => {
      const sid = res.headers["x-hermes-session-id"];
      if (sid && typeof sid === "string") {
        sessionId = sid;
        saveMessage(profileName, sessionId, "user", message);
      }
      if (res.statusCode !== 200) {
        let errBody = "";
        res.on("data", (d) => {
          errBody += d.toString();
        });
        res.on("end", () => {
          try {
            const err = JSON.parse(errBody);
            finish(
              err.error && err.error.message || "API 错误 " + res.statusCode
            );
          } catch {
            finish(
              "API 服务器返回 " + res.statusCode + ": " + errBody.slice(0, 200)
            );
          }
        });
        return;
      }
      let buffer = "";
      res.on("data", (chunk) => {
        buffer += chunk.toString();
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        for (const part of parts) {
          if (processSseBlock(part)) return;
        }
      });
      res.on("end", () => {
        if (buffer.trim()) {
          for (const part of buffer.split("\n\n")) {
            if (processSseBlock(part)) return;
          }
        }
        if (!hasContent && !lastError) {
          probeRealError();
          return;
        }
        finish(hasContent ? void 0 : lastError);
      });
      res.on("error", (err) => finish("流错误: " + err.message));
    }
  );
  req.on("error", (err) => {
    if (err.name === "AbortError") return;
    finish("API 请求失败: " + err.message);
  });
  req.on("timeout", () => {
    req.destroy();
    finish("API 请求超时");
  });
  req.write(body);
  req.end();
}
function sendMessageViaCli(profileName, message, event, mainWindow2) {
  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes;
  const hermesBin = hermesCfg?.bin || DEFAULT_HERMES_BIN;
  const args = [
    "chat",
    "-q",
    String(message).slice(0, 5e3),
    "-Q",
    "--source",
    "desktop"
  ];
  if (profileName !== "default") args.push("-p", profileName);
  const model = getModelFromProfile(profileName);
  if (model) args.push("-m", model);
  const env = Object.assign({}, process.env, {
    HOME: os.homedir(),
    HERMES_HOME,
    PYTHONUNBUFFERED: "1"
  });
  const hermesEnv = readHermesEnv(profileName);
  for (const [key, value] of Object.entries(hermesEnv)) {
    if (value && !env[key]) env[key] = value;
  }
  try {
    const configPath = path.join(getProfilePath(profileName), "config.yaml");
    if (fs.existsSync(configPath)) {
      const cfg = parse(fs.readFileSync(configPath, "utf-8"));
      const m = cfg.model;
      const provider = m?.provider || "";
      const providerInfo = PROVIDER_KEY_MAP[provider];
      const isCustomProvider = !providerInfo && provider !== "";
      if (providerInfo) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = m?.base_url || providerInfo.baseUrl || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        delete env.HERMES_INFERENCE_PROVIDER;
      } else if (provider === "custom" || isCustomProvider) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = m?.base_url || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        const keyFromEnv = hermesEnv.OPENAI_API_KEY || "";
        if (keyFromEnv) {
          env.OPENAI_API_KEY = keyFromEnv;
          env.CUSTOM_API_KEY = keyFromEnv;
        }
        env.CUSTOM_API_BASE_URL = env.OPENAI_BASE_URL || "";
        env.HERMES_INFERENCE_PROVIDER = "custom";
      }
    }
  } catch {
  }
  const proc = child_process.spawn(hermesBin, args, {
    env,
    stdio: ["ignore", "pipe", "pipe"]
  });
  let hasOutput = false;
  let capturedSessionId = "";
  let outputBuffer = "";
  const NOISE_PATTERNS = [
    /^[╭╰│╮╯─┌┐└┘┤├┬┴┼]/,
    /⚕\s*Hermes/
  ];
  function stripAnsi(text) {
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
  }
  proc.stdout.on("data", (raw) => {
    const text = stripAnsi(raw.toString());
    outputBuffer += text;
    const sidMatch = outputBuffer.match(/session_id:\s*(\S+)/);
    if (sidMatch) capturedSessionId = sidMatch[1];
    const cleaned = text.replace(/session_id:\s*\S+\n?/g, "");
    const lines = cleaned.split("\n");
    const result = [];
    for (const line of lines) {
      const t = line.trim();
      if (t && NOISE_PATTERNS.some((p) => p.test(t))) continue;
      result.push(line);
    }
    const output = result.join("\n");
    if (output) {
      hasOutput = true;
      event.sender.send("chat-chunk", { profileName, chunk: output });
    }
  });
  let stderrBuffer = "";
  proc.stderr.on("data", (data) => {
    const text = stripAnsi(data.toString());
    if (!text.trim() || text.includes("UserWarning") || text.includes("FutureWarning"))
      return;
    if (/❌|⚠️|Error|Traceback|error|failed|denied|unauthorized|invalid/i.test(
      text
    )) {
      hasOutput = true;
      event.sender.send("chat-chunk", { profileName, chunk: text });
    } else {
      stderrBuffer += text;
    }
  });
  proc.on("close", (code) => {
    if (code === 0 || hasOutput) {
      event.sender.send("chat-done", {
        profileName,
        sessionId: capturedSessionId || void 0
      });
      const emp = listEmployees().find((e) => e.name === profileName);
      showChatNotification(
        emp ? emp.displayName : profileName,
        "聊天完成",
        mainWindow2
      );
    } else {
      const detail = stderrBuffer.trim();
      event.sender.send("chat-error", {
        profileName,
        error: detail ? "Hermes 退出码 " + code + ": " + detail : "Hermes 退出码 " + code + "，请检查模型配置和 API Key"
      });
    }
  });
  proc.on("error", (err) => {
    event.sender.send("chat-error", { profileName, error: err.message });
  });
  return proc;
}
function registerChatIpcHandlers(getMainWindow2) {
  electron.ipcMain.handle(
    "send-message",
    async (event, profileName, message, history) => {
      if (!validateProfileName(profileName) && profileName !== "default") {
        event.sender.send("chat-error", {
          profileName,
          error: "无效的员工名称"
        });
        return;
      }
      let status = await getEmployeeStatus(profileName);
      if (status === "idle" || status === "error") {
        const wakeResult = await wakeUpEmployee(profileName, getMainWindow2());
        if (wakeResult.success && wakeResult.status === "online") {
          status = "online";
        }
      }
      if (status === "starting") {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1e3));
          status = await getEmployeeStatus(profileName);
          if (status === "online" || status === "idle") break;
        }
      }
      if (status === "online") {
        sendMessageViaApi(
          profileName,
          message,
          event,
          history,
          getMainWindow2()
        );
        return;
      }
      sendMessageViaCli(profileName, message, event, getMainWindow2());
    }
  );
  electron.ipcMain.handle("abort-chat", async (_, profileName) => {
    if (profileName && _currentChatReqs[profileName]) {
      _currentChatReqs[profileName].abort();
      delete _currentChatReqs[profileName];
    }
    return { success: true };
  });
  electron.ipcMain.handle(
    "send-approval",
    async (_, profileName, approvalId, approved) => {
      const key = profileName + ":" + approvalId;
      const pending = _pendingApprovals[key];
      if (!pending) return { error: "审批请求不存在或已过期" };
      delete _pendingApprovals[key];
      const port = getApiPortForProfile(profileName);
      if (!port) return { error: "员工未配置端口" };
      const safeApprovalId = String(approvalId).replace(
        /[^a-zA-Z0-9_-]/g,
        ""
      );
      return new Promise((resolve) => {
        const body = JSON.stringify({ approved, approval_id: approvalId });
        const req = http.request(
          {
            hostname: DEFAULT_API_HOST,
            port,
            path: "/v1/approval/" + safeApprovalId,
            method: "POST",
            headers: { "Content-Type": "application/json" },
            timeout: 1e4
          },
          (res) => {
            res.on("data", (chunk) => {
            });
            res.on("end", () => {
              resolve({ success: true, statusCode: res.statusCode });
            });
          }
        );
        req.on("error", (err) => {
          resolve({ error: err.message });
        });
        req.on("timeout", () => {
          req.destroy();
          resolve({ error: "审批请求超时" });
        });
        req.write(body);
        req.end();
      });
    }
  );
  electron.ipcMain.handle("health-check", async (_, profileName) => {
    if (!validateProfileName(profileName) && profileName !== "default")
      return { online: false };
    const port = getApiPortForProfile(profileName);
    if (!port) return { online: false };
    const { isApiServerReady: isApiServerReady2 } = await Promise.resolve().then(() => config);
    const ready = await isApiServerReady2(port);
    return { online: ready };
  });
}
const DEFAULT_USERNAME = "admin";
const DEFAULT_PASSWORD = "123456";
let currentUser = null;
function readUsers() {
  ensureDir$1(APP_DATA_DIR);
  if (!fs.existsSync(USERS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch {
    return [];
  }
}
function writeUsers(users) {
  ensureDir$1(APP_DATA_DIR);
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf-8");
}
function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 1e5, 64, "sha512").toString("hex");
}
function ensureDefaultUser() {
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
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    lastLogin: (/* @__PURE__ */ new Date()).toISOString()
  });
  writeUsers(users);
}
function createUserWithPassword(password) {
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
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      lastLogin: (/* @__PURE__ */ new Date()).toISOString()
    });
    writeUsers(users);
  }
}
function registerAuthIpcHandlers() {
  electron.ipcMain.handle("auth-login", async (_, password) => {
    ensureDefaultUser();
    if (!password) return { error: "请输入密码" };
    const users = readUsers();
    const user = users.find((u) => u.username === DEFAULT_USERNAME);
    if (!user) return { error: "用户不存在" };
    const hash = hashPassword(password, user.salt);
    if (hash !== user.passwordHash) return { error: "密码错误" };
    user.lastLogin = (/* @__PURE__ */ new Date()).toISOString();
    writeUsers(users);
    currentUser = user;
    return {
      success: true,
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName
      }
    };
  });
  electron.ipcMain.handle("auth-logout", async () => {
    currentUser = null;
    return { success: true };
  });
  electron.ipcMain.handle("auth-get-current", async () => {
    if (!currentUser) return null;
    return {
      id: currentUser.id,
      username: currentUser.username,
      displayName: currentUser.displayName
    };
  });
  electron.ipcMain.handle(
    "auth-change-password",
    async (_, oldPassword, newPassword) => {
      if (!currentUser) return { error: "请先登录" };
      const users = readUsers();
      const user = users.find((u) => u.id === currentUser.id);
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
    }
  );
  electron.ipcMain.handle(
    "auth-setup-password",
    async (_, password) => {
      if (!password || password.length < 4)
        return { error: "密码至少4个字符" };
      createUserWithPassword(password);
      const users = readUsers();
      const user = users.find((u) => u.username === DEFAULT_USERNAME);
      if (user) {
        user.lastLogin = (/* @__PURE__ */ new Date()).toISOString();
        writeUsers(users);
        currentUser = user;
        return {
          success: true,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.displayName
          }
        };
      }
      return { error: "创建用户失败" };
    }
  );
  electron.ipcMain.handle("check-initialized", async () => {
    const users = readUsers();
    return users.length > 0;
  });
}
const PETDEX_MANIFEST_URL = "https://petdex.crafter.run/api/manifest";
const PETS_DIR = path.join(APP_DATA_DIR, "pets");
const MANIFEST_CACHE_PATH = path.join(PETS_DIR, "manifest.json");
const MANIFEST_TTL = 24 * 60 * 60 * 1e3;
function ensurePetsDir() {
  ensureDir$1(PETS_DIR);
}
function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const doRequest = (reqUrl) => {
      https.get(reqUrl, { timeout: 15e3 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            resolve(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
          } catch (e) {
            reject(e);
          }
        });
      }).on("error", reject).on("timeout", function() {
        this.destroy();
        reject(new Error("timeout"));
      });
    };
    doRequest(url);
  });
}
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    ensureDir$1(path.dirname(dest));
    const file = fs.createWriteStream(dest);
    const doRequest = (reqUrl) => {
      https.get(reqUrl, { timeout: 3e4 }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          doRequest(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          file.close();
          fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => {
          file.close();
          resolve();
        });
      }).on("error", (e) => {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch {
        }
        reject(e);
      });
    };
    doRequest(url);
  });
}
function readCachedManifest() {
  try {
    if (!fs.existsSync(MANIFEST_CACHE_PATH)) return null;
    const stat = fs.statSync(MANIFEST_CACHE_PATH);
    if (Date.now() - stat.mtimeMs > MANIFEST_TTL) return null;
    const raw = fs.readFileSync(MANIFEST_CACHE_PATH, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function getManifest() {
  const cached = readCachedManifest();
  if (cached) {
    return cached;
  }
  try {
    const data = await fetchJson(PETDEX_MANIFEST_URL);
    const pets = data.pets || (Array.isArray(data) ? data : []);
    ensurePetsDir();
    fs.writeFileSync(MANIFEST_CACHE_PATH, JSON.stringify(pets, null, 2), "utf-8");
    return pets;
  } catch (e) {
    if (cached) return cached;
    throw e;
  }
}
function petDir(slug) {
  return path.join(PETS_DIR, slug);
}
function petSpritesheetPath(slug) {
  return path.join(petDir(slug), "spritesheet.webp");
}
async function ensureSpritesheet(slug, url) {
  const local = petSpritesheetPath(slug);
  if (fs.existsSync(local)) return local;
  ensurePetsDir();
  await downloadFile(url, local);
  return local;
}
function registerPetsIpc() {
  electron.ipcMain.handle("pets:list", async () => {
    try {
      const manifest = await getManifest();
      return manifest.map((p) => ({
        slug: p.slug,
        name: p.displayName || p.name || p.slug,
        spritesheetUrl: p.spritesheetUrl || p.spritesheet || "",
        tags: p.tags,
        vibes: p.vibes,
        kind: p.kind,
        frameWidth: p.frameWidth,
        frameHeight: p.frameHeight,
        states: p.states
      }));
    } catch {
      return [];
    }
  });
  electron.ipcMain.handle("pets:get-spritesheet", async (_, slug) => {
    try {
      let local = petSpritesheetPath(slug);
      if (!fs.existsSync(local)) {
        const manifest = await getManifest();
        const entry = manifest.find((p) => p.slug === slug);
        const spriteUrl = entry?.spritesheetUrl || entry?.spritesheet;
        if (!spriteUrl) return null;
        local = await ensureSpritesheet(slug, spriteUrl);
      }
      const buf = fs.readFileSync(local);
      const base64 = buf.toString("base64");
      return `data:image/webp;base64,${base64}`;
    } catch {
      return null;
    }
  });
  electron.ipcMain.handle("pets:refresh-manifest", async () => {
    try {
      if (fs.existsSync(MANIFEST_CACHE_PATH)) {
        fs.unlinkSync(MANIFEST_CACHE_PATH);
      }
      const manifest = await getManifest();
      return manifest.map((p) => ({
        slug: p.slug,
        name: p.displayName || p.name || p.slug,
        spritesheetUrl: p.spritesheetUrl || p.spritesheet || "",
        tags: p.tags,
        vibes: p.vibes,
        kind: p.kind,
        frameWidth: p.frameWidth,
        frameHeight: p.frameHeight,
        states: p.states
      }));
    } catch {
      return [];
    }
  });
}
let _getMainWindow = null;
function initUpdater(getMainWindow2) {
  _getMainWindow = getMainWindow2;
  electronUpdater.autoUpdater.autoDownload = false;
  electronUpdater.autoUpdater.autoInstallOnAppQuit = true;
  electronUpdater.autoUpdater.on("checking-for-update", () => {
    sendToRenderer("update-status", { status: "checking" });
  });
  electronUpdater.autoUpdater.on("update-available", (info) => {
    sendToRenderer("update-status", {
      status: "available",
      version: info.version,
      releaseNotes: info.releaseNotes,
      fileSize: info.files?.[0]?.size
    });
  });
  electronUpdater.autoUpdater.on("update-not-available", () => {
    sendToRenderer("update-status", { status: "not-available" });
  });
  electronUpdater.autoUpdater.on("download-progress", (progress) => {
    sendToRenderer("update-status", {
      status: "downloading",
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond
    });
  });
  electronUpdater.autoUpdater.on("update-downloaded", () => {
    sendToRenderer("update-status", { status: "downloaded" });
  });
  electronUpdater.autoUpdater.on("error", (err) => {
    sendToRenderer("update-status", { status: "error", error: err.message });
  });
  electron.ipcMain.handle("check-app-update", async () => {
    try {
      await electronUpdater.autoUpdater.checkForUpdates();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  electron.ipcMain.handle("download-app-update", async () => {
    try {
      await electronUpdater.autoUpdater.downloadUpdate();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });
  electron.ipcMain.handle("install-app-update", () => {
    setImmediate(() => electronUpdater.autoUpdater.quitAndInstall());
  });
  electron.ipcMain.handle("get-app-version", () => {
    return electron.app.getVersion();
  });
}
function sendToRenderer(channel, data) {
  if (!_getMainWindow) return;
  const win = _getMainWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, data);
  }
}
const HERMES_REPO = path.join(HERMES_HOME, "hermes-agent");
const HERMES_VENV = path.join(HERMES_REPO, "venv");
const HERMES_PYTHON = process.platform === "win32" ? path.join(HERMES_VENV, "Scripts", "python.exe") : path.join(HERMES_VENV, "bin", "python");
const HERMES_SCRIPT = path.join(HERMES_REPO, "hermes");
const HERMES_ENV_FILE = path.join(HERMES_HOME, ".env");
const HERMES_REPO_URL = "https://gitee.com/YanPro/ly-hermes-agent";
const STAGES = [
  "检查前置依赖",
  "克隆仓库",
  "创建虚拟环境",
  "安装依赖",
  "完成安装"
];
function getEnhancedPath() {
  const home = os.homedir();
  const extraPaths = [];
  if (process.platform === "darwin") {
    extraPaths.push(
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      path.join(home, ".local", "bin"),
      path.join(home, "homebrew", "bin"),
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      path.join(home, ".cargo", "bin")
    );
  } else if (process.platform === "linux") {
    extraPaths.push(
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      path.join(home, ".local", "bin"),
      path.join(home, ".cargo", "bin")
    );
  } else {
    extraPaths.push(
      path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Programs", "Python", "Python312"),
      path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Programs", "Python", "Python311"),
      path.join(process.env.LOCALAPPDATA || path.join(home, "AppData", "Local"), "Programs", "Python", "Python310"),
      path.join(home, "AppData", "Local", "Microsoft", "WindowsApps"),
      path.join(home, ".cargo", "bin")
    );
  }
  const currentPath = process.env.PATH || "";
  const existing = new Set(currentPath.split(path.delimiter));
  const merged = currentPath.split(path.delimiter);
  for (const p of extraPaths) {
    if (!existing.has(p)) {
      merged.push(p);
      existing.add(p);
    }
  }
  return merged.join(path.delimiter);
}
function checkInstallStatus() {
  const filesExist = fs.existsSync(HERMES_PYTHON) && fs.existsSync(HERMES_SCRIPT);
  let installed = false;
  if (filesExist) {
    try {
      const env = Object.assign({}, process.env, {
        HOME: os.homedir(),
        HERMES_HOME,
        PATH: getEnhancedPath()
      });
      const versionOut = child_process.execFileSync(
        HERMES_PYTHON,
        [HERMES_SCRIPT, "--version"],
        { encoding: "utf-8", timeout: 1e4, env }
      ).trim();
      installed = /\d+\.\d+/.test(versionOut);
    } catch {
      installed = false;
    }
  }
  const configured = fs.existsSync(HERMES_ENV_FILE);
  let hasApiKey = false;
  if (configured) {
    try {
      const envContent = fs.readFileSync(HERMES_ENV_FILE, "utf-8");
      hasApiKey = /API_KEY\s*=\s*\S+/.test(envContent);
    } catch {
      hasApiKey = false;
    }
  }
  return { installed, configured, hasApiKey };
}
let _verifyCache = null;
const VERIFY_CACHE_TTL = 5 * 60 * 1e3;
async function verifyInstall() {
  if (_verifyCache && Date.now() - _verifyCache.ts < VERIFY_CACHE_TTL) {
    return _verifyCache.result;
  }
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME,
      PATH: getEnhancedPath()
    });
    child_process.execFile(
      HERMES_PYTHON,
      [HERMES_SCRIPT, "--version"],
      { env, timeout: 15e3 },
      (error, stdout) => {
        const ok = !error && /\d+\.\d+/.test(stdout || "");
        _verifyCache = { result: ok, ts: Date.now() };
        resolve(ok);
      }
    );
  });
}
function findSystemPython() {
  const candidates = [];
  if (process.platform === "win32") {
    candidates.push("python", "python3", "py");
  } else {
    candidates.push("python3", "python");
  }
  for (const cmd of candidates) {
    try {
      const out = child_process.execFileSync(cmd, ["--version"], {
        encoding: "utf-8",
        timeout: 5e3,
        env: Object.assign({}, process.env, { PATH: getEnhancedPath() })
      }).trim();
      const m = out.match(/Python\s+(\d+)\.(\d+)/);
      if (m) {
        const major = parseInt(m[1], 10);
        const minor = parseInt(m[2], 10);
        if (major === 3 && minor >= 11) return cmd;
      }
    } catch {
    }
  }
  return null;
}
function findSystemGit() {
  try {
    child_process.execFileSync("git", ["--version"], {
      encoding: "utf-8",
      timeout: 5e3,
      env: Object.assign({}, process.env, { PATH: getEnhancedPath() })
    });
    return "git";
  } catch {
    return null;
  }
}
function runStep(cmd, args, cwd, env, timeoutMs) {
  return new Promise((resolve) => {
    const proc = child_process.spawn(cmd, args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    proc.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    proc.stderr?.on("data", (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      try {
        proc.kill();
      } catch {
      }
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
async function runInstall(onProgress) {
  const totalSteps = STAGES.length;
  let log = "";
  const emit = (step, detail) => {
    log += detail + "\n";
    onProgress?.({
      step,
      totalSteps,
      title: STAGES[step - 1] || "",
      detail: detail.slice(0, 200),
      log
    });
  };
  const fail = (resolve, msg) => {
    emit(totalSteps, msg);
    resolve({ success: false, error: msg });
  };
  const installEnv = Object.assign({}, process.env, {
    HOME: os.homedir(),
    HERMES_HOME,
    PATH: getEnhancedPath()
  });
  return new Promise((resolve) => {
    emit(1, "正在检查系统环境...");
    const sysPython = findSystemPython();
    if (!sysPython) {
      const msg = process.platform === "win32" ? "未找到 Python 3.11+，请到 https://www.python.org/downloads/ 下载安装" : "未找到 Python 3.11+，请先安装 Python（brew install python / apt install python3）";
      fail(resolve, msg);
      return;
    }
    const sysGit = findSystemGit();
    if (!sysGit) {
      const msg = process.platform === "win32" ? "未找到 Git，请到 https://git-scm.com/download/win 下载安装" : "未找到 Git，请先安装 Git";
      fail(resolve, msg);
      return;
    }
    emit(1, `Python 已就绪，Git 已就绪，开始安装 Hermes Agent...`);
    ensureDir(path.dirname(HERMES_REPO));
    (async () => {
      emit(2, `正在从 Gitee 克隆仓库到 ${HERMES_REPO} ...`);
      const cloneExist = fs.existsSync(path.join(HERMES_REPO, ".git"));
      if (cloneExist) {
        const pullR = await runStep(sysGit, ["pull", "--ff-only", "origin", "main"], HERMES_REPO, installEnv, 12e4);
        if (!pullR.success) {
          emit(2, `仓库已存在但更新失败，将重新克隆...`);
          try {
            if (process.platform === "win32") {
              child_process.execFileSync("cmd", ["/c", "rd", "/s", "/q", HERMES_REPO], { timeout: 1e4, env: installEnv });
            } else {
              child_process.execFileSync("rm", ["-rf", HERMES_REPO], { timeout: 1e4, env: installEnv });
            }
          } catch {
          }
        } else {
          emit(2, `仓库已更新到最新版本`);
        }
      }
      if (!fs.existsSync(path.join(HERMES_REPO, ".git"))) {
        const cloneR = await runStep(sysGit, ["clone", HERMES_REPO_URL, HERMES_REPO], path.dirname(HERMES_REPO), installEnv, 3e5);
        if (!cloneR.success) {
          fail(resolve, `仓库克隆失败：${cloneR.stderr.slice(-300) || "网络错误，请检查是否能访问 gitee.com"}`);
          return;
        }
        emit(2, `仓库克隆成功`);
      }
      emit(3, `正在创建 Python 虚拟环境...`);
      if (fs.existsSync(HERMES_VENV)) {
        emit(3, `虚拟环境已存在，将重新创建...`);
        try {
          if (process.platform === "win32") {
            child_process.execFileSync("cmd", ["/c", "rd", "/s", "/q", HERMES_VENV], { timeout: 1e4, env: installEnv });
          } else {
            child_process.execFileSync("rm", ["-rf", HERMES_VENV], { timeout: 1e4, env: installEnv });
          }
        } catch {
        }
      }
      const venvR = await runStep(sysPython, ["-m", "venv", HERMES_VENV], path.dirname(HERMES_REPO), installEnv, 12e4);
      if (!venvR.success) {
        fail(resolve, `虚拟环境创建失败：${venvR.stderr.slice(-300)}`);
        return;
      }
      emit(3, `虚拟环境创建成功`);
      emit(4, `正在安装 Python 依赖（首次可能需要几分钟）...`);
      const hasPip = await runStep(HERMES_PYTHON, ["-m", "pip", "--version"], HERMES_REPO, installEnv, 1e4);
      if (!hasPip.success) {
        emit(4, `pip 未随虚拟环境安装，正在通过 ensurepip 安装...`);
        const ensureR = await runStep(HERMES_PYTHON, ["-m", "ensurepip", "--upgrade"], HERMES_REPO, installEnv, 6e4);
        if (!ensureR.success) {
          fail(resolve, `pip 安装失败：${ensureR.stderr.slice(-300)}。请确保系统 Python 安装了 ensurepip 模块。`);
          return;
        }
      }
      const pipArgs = ["-m", "pip", "install", "--upgrade", "pip"];
      await runStep(HERMES_PYTHON, pipArgs, HERMES_REPO, installEnv, 12e4);
      const installArgs = ["-m", "pip", "install", "-e", "."];
      const installR = await runStep(HERMES_PYTHON, installArgs, HERMES_REPO, installEnv, 6e5);
      if (!installR.success) {
        const stderrTail = installR.stderr.slice(-500);
        if (stderrTail.includes("No matching distribution found") || stderrTail.includes("Could not find")) {
          emit(4, `pip install -e . 失败，尝试使用国内 PyPI 镜像...`);
          const mirrorArgs = ["-m", "pip", "install", "-e", ".", "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"];
          const mirrorR = await runStep(HERMES_PYTHON, mirrorArgs, HERMES_REPO, installEnv, 6e5);
          if (!mirrorR.success) {
            fail(resolve, `依赖安装失败：${mirrorR.stderr.slice(-500)}`);
            return;
          }
          emit(4, `依赖安装成功（清华镜像）`);
        } else {
          fail(resolve, `依赖安装失败：${stderrTail}`);
          return;
        }
      } else {
        emit(4, `依赖安装成功`);
      }
      _verifyCache = null;
      emit(totalSteps, "Hermes Agent 安装完成！");
      resolve({ success: true });
    })().catch((e) => {
      fail(resolve, `安装异常：${e.message}`);
    });
  });
}
async function getHermesVersion() {
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      HOME: os.homedir(),
      HERMES_HOME,
      PATH: getEnhancedPath()
    });
    child_process.execFile(
      HERMES_PYTHON,
      [HERMES_SCRIPT, "--version"],
      { env, timeout: 15e3 },
      (error, stdout) => {
        if (error) {
          resolve(null);
        } else {
          resolve(stdout.toString().trim());
        }
      }
    );
  });
}
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
process.on("uncaughtException", (err) => {
  console.error("[MAIN UNCAUGHT]", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[MAIN UNHANDLED REJECTION]", reason);
});
let mainWindow = null;
let tray = null;
let _isQuitting = false;
const gotTheLock = electron.app.requestSingleInstanceLock();
if (!gotTheLock) {
  electron.app.quit();
} else {
  electron.app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
function getMainWindow() {
  return mainWindow;
}
function loadWindowState() {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(WINDOW_STATE_FILE, "utf-8"));
    }
  } catch {
  }
  return null;
}
function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  try {
    const bounds = mainWindow.getBounds();
    const isMaximized = mainWindow.isMaximized();
    ensureDir$1(APP_DATA_DIR);
    fs.writeFileSync(
      WINDOW_STATE_FILE,
      JSON.stringify({ ...bounds, isMaximized }),
      "utf-8"
    );
  } catch {
  }
}
function createWindow() {
  const isMac = process.platform === "darwin";
  const savedState = loadWindowState();
  const windowOptions = {
    width: savedState?.width || 1400,
    height: savedState?.height || 900,
    minWidth: 1e3,
    minHeight: 600,
    title: "落云.Hermes",
    ...isMac ? {
      titleBarStyle: "hiddenInset",
      vibrancy: "under-window"
    } : {
      frame: false,
      autoHideMenuBar: true
    },
    backgroundColor: "#000000",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
      allowRunningInsecureContent: false
    }
  };
  if (savedState && savedState.x !== void 0 && savedState.y !== void 0) {
    windowOptions.x = savedState.x;
    windowOptions.y = savedState.y;
  }
  mainWindow = new electron.BrowserWindow(windowOptions);
  if (savedState && savedState.isMaximized) {
    mainWindow.maximize();
  }
  const rendererUrl = process.env["ELECTRON_RENDERER_URL"];
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl);
  } else {
    mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
  }
  if (process.env["HERMES_DEVTOOLS"]) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith("file://")) return;
    event.preventDefault();
  });
  mainWindow.webContents.on(
    "render-process-gone",
    (_event, details) => {
      console.error(
        "[CRASH] Renderer process gone:",
        details.reason,
        details.exitCode
      );
      setTimeout(() => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.reload();
        }
      }, 3e3);
    }
  );
  mainWindow.on("close", (e) => {
    if (!_isQuitting) {
      e.preventDefault();
      mainWindow.hide();
      return;
    }
    saveWindowState();
  });
  mainWindow.on("resize", () => saveWindowState());
  mainWindow.on("move", () => saveWindowState());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function createTray() {
  const icon = createTrayIcon();
  tray = new electron.Tray(icon);
  tray.setToolTip("落云.Hermes");
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "显示窗口",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      }
    },
    {
      label: "新对话",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
          mainWindow.webContents.send("new-conversation");
        }
      }
    },
    { type: "separator" },
    {
      label: "退出",
      click: () => {
        _isQuitting = true;
        electron.app.quit();
      }
    }
  ]);
  tray.setContextMenu(contextMenu);
  tray.on("click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}
electron.app.whenReady().then(() => {
  electron.Menu.setApplicationMenu(null);
  electron.protocol.handle("wallpaper", (request) => {
    const filePath = decodeURIComponent(request.url.replace("wallpaper://", ""));
    return electron.net.fetch(`file://${filePath}`);
  });
  ensureApiServerConfig();
  electron.ipcMain.handle("check-install", () => checkInstallStatus());
  electron.ipcMain.handle("verify-install", async () => {
    const ok = await verifyInstall();
    if (ok) {
      const version = await getHermesVersion();
      return { installed: true, version: version || void 0 };
    }
    return { installed: false, error: "验证失败" };
  });
  electron.ipcMain.handle("start-install", async () => {
    return await runInstall((progress) => {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("install-progress", progress);
      }
    });
  });
  electron.ipcMain.handle("window-minimize", () => {
    const win = getMainWindow();
    if (win) win.minimize();
  });
  electron.ipcMain.handle("window-maximize", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize();
      } else {
        win.maximize();
      }
    }
  });
  electron.ipcMain.handle("window-close", () => {
    const win = getMainWindow();
    if (win) win.close();
  });
  electron.ipcMain.handle("window-is-maximized", () => {
    const win = getMainWindow();
    return win ? win.isMaximized() : false;
  });
  registerAuthIpcHandlers();
  registerConfigIpcHandlers();
  registerEmployeeIpcHandlers(getMainWindow);
  registerChatIpcHandlers(getMainWindow);
  registerSessionIpcHandlers();
  registerPetsIpc();
  initUpdater(getMainWindow);
  createWindow();
  createTray();
  if (electron.app.isPackaged) {
    setTimeout(() => electronUpdater.autoUpdater.checkForUpdates().catch(() => {
    }), 5e3);
  }
});
electron.app.on("before-quit", () => {
  _isQuitting = true;
  Object.keys(_gatewayProcesses).forEach((k) => {
    if (_gatewayProcesses[k] && !_gatewayProcesses[k].killed) {
      _gatewayProcesses[k].kill("SIGTERM");
    }
  });
  Object.keys(_idleTimers).forEach(clearIdleTimer);
});
electron.app.on("window-all-closed", () => {
});
electron.app.on("activate", () => {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
});
setInterval(() => {
  const now = Date.now();
  for (const key of Object.keys(_pendingApprovals)) {
    if (now - _pendingApprovals[key].ts > 3e5) {
      delete _pendingApprovals[key];
    }
  }
}, 6e4);
exports.HERMES_HOME = HERMES_HOME;
exports.getProfilePath = getProfilePath;
exports.loadAppConfig = loadAppConfig;
exports.runHermesCli = runHermesCli;
