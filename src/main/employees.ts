import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, type ChildProcess } from "child_process";
import * as yaml from "./lib/yaml-simple";
import {
  HERMES_HOME,
  PROFILES_DIR,
  DEFAULT_API_PORT,
  loadAppConfig,
  RUNTIME_DEFAULTS,
  getProfilePath,
  readHermesEnv,
  runHermesCli,
  isApiServerReady,
  validateProfileName,
  DEFAULT_HERMES_BIN,
} from "./config";
import { ensureDir, safeWriteFile, yamlStringify } from "./utils";
import { getSessionCount, getEmployeeSessions } from "./sessions";
import type { BrowserWindow } from "electron";
import {
  loadDbEmployeeMeta,
  loadDbMemory,
  saveDbEmployeeMeta,
  saveDbMemory,
  exportEmployeeDesktopData,
} from "./db";

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

export const _gatewayProcesses: Record<string, ChildProcess> = {};
export const _idleTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export interface EmployeeInfo {
  name: string;
  displayName: string;
  role: string;
  avatar: string;
  color: string;
  tags: string[];
  petSlug: string;
  model: string;
  provider: string;
  isActive: boolean;
  hasSoul: boolean;
  hasEnv: boolean;
  gateway_port: number;
  idle_timeout: number;
  created_at: string;
  status?: string;
}

export function readEmployeeMeta(
  profileName: string,
): Record<string, unknown> | null {
  return loadDbEmployeeMeta(profileName);
}

export function writeEmployeeMeta(
  profileName: string,
  meta: Record<string, unknown>,
): void {
  saveDbEmployeeMeta(profileName, meta);
}

export function getApiPortForProfile(profileName: string): number | null {
  const profilePath = getProfilePath(profileName);
  const configPath = path.join(profilePath, "config.yaml");
  try {
    if (fs.existsSync(configPath)) {
      const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      const platforms = cfg.platforms as Record<string, unknown> | undefined;
      if (platforms?.api_server) {
        const apiServer = platforms.api_server as Record<string, unknown>;
        if (apiServer.extra) {
          const extra = apiServer.extra as Record<string, unknown>;
          if (extra.port) return extra.port as number;
        }
      }
      const apiServerDirect = cfg.api_server as
        | Record<string, unknown>
        | undefined;
      if (apiServerDirect?.port) return apiServerDirect.port as number;
    }
  } catch {
    /* fall through */
  }
  const meta = readEmployeeMeta(profileName);
  if (meta && meta.gateway_port) return meta.gateway_port as number;
  if (profileName === "default") return DEFAULT_API_PORT;
  return null;
}

export function getActiveProfileName(): string {
  const activeFile = path.join(HERMES_HOME, "active_profile");
  try {
    if (fs.existsSync(activeFile)) {
      return fs.readFileSync(activeFile, "utf-8").trim() || "default";
    }
  } catch {
    /* fall through */
  }
  return "default";
}

export function listEmployees(): EmployeeInfo[] {
  const employees: EmployeeInfo[] = [];
  const activeName = getActiveProfileName();

  const defaultConfigPath = path.join(HERMES_HOME, "config.yaml");
  let defaultModel = "";
  let defaultProvider = "";
  try {
    if (fs.existsSync(defaultConfigPath)) {
      const cfg = yaml.parse(fs.readFileSync(defaultConfigPath, "utf-8"));
      const m = cfg.model as Record<string, unknown> | undefined;
      defaultModel = (m?.default as string) || "";
      defaultProvider = (m?.provider as string) || "";
    }
  } catch {
    /* fall through */
  }

  const defaultMeta = readEmployeeMeta("default");
  employees.push({
    name: "default",
    displayName: (defaultMeta?.name as string) || "默认员工",
    role: (defaultMeta?.role as string) || "通用助手",
    avatar: (defaultMeta?.avatar as string) || "🤖",
    color: (defaultMeta?.color as string) || "#4A90D9",
    tags: (defaultMeta?.tags as string[]) || [],
    petSlug: (defaultMeta?.petSlug as string) || "",
    model: defaultModel,
    provider: defaultProvider,
    isActive: activeName === "default",
    hasSoul: fs.existsSync(path.join(HERMES_HOME, "SOUL.md")),
    hasEnv: fs.existsSync(path.join(HERMES_HOME, ".env")),
    gateway_port: getApiPortForProfile("default") || DEFAULT_API_PORT,
    idle_timeout: (defaultMeta?.idle_timeout as number) || 30,
    created_at: (defaultMeta?.created_at as string) || "",
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
            const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
            const m = cfg.model as Record<string, unknown> | undefined;
            model = (m?.default as string) || "";
            provider = (m?.provider as string) || "";
          }
        } catch {
          /* fall through */
        }

        const meta = readEmployeeMeta(dir);
        employees.push({
          name: dir,
          displayName: (meta?.name as string) || dir,
          role: (meta?.role as string) || "员工",
          avatar: (meta?.avatar as string) || "🧑‍💼",
          color: (meta?.color as string) || "#6C5CE7",
          tags: (meta?.tags as string[]) || [],
          petSlug: (meta?.petSlug as string) || "",
          model: model,
          provider: provider,
          isActive: activeName === dir,
          hasSoul: fs.existsSync(path.join(profilePath, "SOUL.md")),
          hasEnv: fs.existsSync(path.join(profilePath, ".env")),
          gateway_port: getApiPortForProfile(dir) || DEFAULT_API_PORT,
          idle_timeout: (meta?.idle_timeout as number) || 30,
          created_at: (meta?.created_at as string) || "",
        });
      }
    } catch {
      /* fall through */
    }
  }

  return employees;
}

export function allocatePort(): number | null {
  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
  const portRange = hermesCfg?.port_range as number[] | undefined;
  const rangeStart = (portRange && portRange[0]) || 8644;
  const rangeEnd = (portRange && portRange[1]) || 8743;
  const usedPorts: number[] = [];
  const employees = listEmployees();
  for (const emp of employees) {
    const port = getApiPortForProfile(emp.name);
    if (port) usedPorts.push(port);
  }
  for (let port = rangeStart; port <= rangeEnd; port++) {
    if (!usedPorts.includes(port)) return port;
  }
  return null;
}

export async function getEmployeeStatus(
  profileName: string,
): Promise<string> {
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
      const pid = raw.startsWith("{")
        ? JSON.parse(raw).pid
        : parseInt(raw, 10);
      if (typeof pid === "number" && !isNaN(pid)) {
        process.kill(pid, 0);
        const ready = await isApiServerReady(port);
        return ready ? "online" : "starting";
      }
    } catch {
      /* process not running */
    }
  }

  return "idle";
}

export async function wakeUpEmployee(
  profileName: string,
  mainWindow: BrowserWindow | null,
): Promise<{ success: boolean; status?: string; message?: string; error?: string }> {
  const currentStatus = await getEmployeeStatus(profileName);
  if (currentStatus === "online") return { success: true, status: "online" };
  if (currentStatus === "starting")
    return { success: true, status: "starting", message: "正在启动中..." };

  const port = getApiPortForProfile(profileName);
  if (!port) return { success: false, error: "未配置端口" };

  const appConfig = loadAppConfig();
  const hermesCfg = appConfig.hermes as Record<string, unknown> | undefined;
  const hermesBin = (hermesCfg?.bin as string) || DEFAULT_HERMES_BIN;
  const defaults = appConfig.defaults as Record<string, unknown> | undefined;
  const maxOnline = (defaults?.max_online as number) || 5;
  const onlineCount = Object.keys(_gatewayProcesses).filter(
    (k) => !_gatewayProcesses[k].killed,
  ).length;
  if (onlineCount >= maxOnline) {
    return {
      success: false,
      error:
        "同时在线员工数已达上限 (" +
        maxOnline +
        ")，请先让其他员工休息",
    };
  }

  const env = Object.assign({}, process.env, {
    HOME: os.homedir(),
    HERMES_HOME: HERMES_HOME,
    API_SERVER_ENABLED: "true",
  });

  const hermesEnv = readHermesEnv(profileName);
  for (const [key, value] of Object.entries(hermesEnv)) {
    if (value) env[key] = value;
  }

  // ensure global .env is also loaded as fallback
  const globalEnv = readHermesEnv("default");
  for (const [key, value] of Object.entries(globalEnv)) {
    if (value && !env[key]) env[key] = value;
  }

  try {
    const configPath = path.join(getProfilePath(profileName), "config.yaml");
    if (fs.existsSync(configPath)) {
      const cfg = yaml.parse(fs.readFileSync(configPath, "utf-8"));
      const m = cfg.model as Record<string, unknown> | undefined;
      let provider = (m?.provider as string) || "";
      const providerInfo = PROVIDER_KEY_MAP[provider];
      const isCustomProvider = !providerInfo && provider !== "";

      if (!providerInfo && provider !== "custom" && provider !== "") {
        const baseUrl = (m?.base_url as string) || "";
        for (const [pid, info] of Object.entries(PROVIDER_KEY_MAP)) {
          if (baseUrl && info.baseUrl === baseUrl) {
            provider = pid;
            m!.provider = pid;
            safeWriteFile(configPath, yamlStringify(cfg));
            break;
          }
        }
      }

      const resolvedProviderInfo = PROVIDER_KEY_MAP[provider];

      if (resolvedProviderInfo) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = (m?.base_url as string) || resolvedProviderInfo.baseUrl || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        if (env[resolvedProviderInfo.envKey]) {
          env.OPENAI_API_KEY = env[resolvedProviderInfo.envKey] as string;
        }
        delete env.HERMES_INFERENCE_PROVIDER;
        const envPath = path.join(getProfilePath(profileName), ".env");
        if (fs.existsSync(envPath)) {
          let envContent = fs.readFileSync(envPath, "utf-8");
          const lines = envContent.split("\n");
          let changed = false;
          const filtered = lines.filter((l: string) => {
            const eqIdx = l.indexOf("=");
            if (eqIdx === -1) return true;
            const key = l.slice(0, eqIdx).trim();
            if (key === "HERMES_INFERENCE_PROVIDER") { changed = true; return false; }
            return true;
          });
          const hasOpenaiKey = filtered.some((l: string) => {
            const eqIdx = l.indexOf("=");
            return eqIdx !== -1 && l.slice(0, eqIdx).trim() === "OPENAI_API_KEY";
          });
          if (!hasOpenaiKey && env[resolvedProviderInfo.envKey]) {
            filtered.push("OPENAI_API_KEY=" + (env[resolvedProviderInfo.envKey] as string));
            changed = true;
          }
          if (changed) {
            safeWriteFile(envPath, filtered.join("\n"));
          }
        }
      } else if (provider === "custom" || isCustomProvider) {
        if (!env.OPENAI_BASE_URL && !env.CUSTOM_API_BASE_URL) {
          const baseUrl = (m?.base_url as string) || "";
          if (baseUrl) env.OPENAI_BASE_URL = baseUrl;
        }
        const keyFromEnv = hermesEnv.OPENAI_API_KEY || "";
        if (keyFromEnv) {
          env.OPENAI_API_KEY = keyFromEnv;
          env.CUSTOM_API_KEY = keyFromEnv;
        } else {
          for (const info of Object.values(PROVIDER_KEY_MAP)) {
            const v = env[info.envKey] as string | undefined;
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
          const hasOpenaiKey = lines.some((l: string) => {
            const eqIdx = l.indexOf("=");
            return eqIdx !== -1 && l.slice(0, eqIdx).trim() === "OPENAI_API_KEY";
          });
          if (!hasOpenaiKey) {
            safeWriteFile(envPath, envContent.trimEnd() + "\nOPENAI_API_KEY=" + env.OPENAI_API_KEY + "\n");
          }
        }
      }
    }
  } catch {
    /* fall through */
  }

  const args =
    profileName === "default"
      ? ["gateway", "run"]
      : ["gateway", "run", "-p", profileName];
  const proc = spawn(hermesBin, args, {
    env,
    cwd: getProfilePath(profileName),
    stdio: "ignore",
    detached: true,
    windowsHide: true,
  });
  _gatewayProcesses[profileName] = proc;
  proc.unref();

  proc.on("close", () => {
    delete _gatewayProcesses[profileName];
    clearIdleTimer(profileName);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("employee-status-changed", {
        profileName,
        status: "idle",
      });
    }
  });

  const startupTimeout =
    ((defaults?.startup_timeout as number) || 30) * 1000;
  const startTime = Date.now();
  while (Date.now() - startTime < startupTimeout) {
    await new Promise((r) => setTimeout(r, 1000));
    const ready = await isApiServerReady(port);
    if (ready) {
      resetIdleTimer(profileName, mainWindow);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("employee-status-changed", {
          profileName,
          status: "online",
        });
      }
      return { success: true, status: "online" };
    }
  }

  return { success: false, error: "Gateway 启动超时" };
}

export function putEmployeeToSleep(
  profileName: string,
  mainWindow: BrowserWindow | null,
): { success: boolean } {
  clearIdleTimer(profileName);

  const hadManagedProcess =
    _gatewayProcesses[profileName] && !_gatewayProcesses[profileName].killed;

  if (hadManagedProcess) {
    _gatewayProcesses[profileName].kill("SIGTERM");
    delete _gatewayProcesses[profileName];
  }

  const pidFile = path.join(getProfilePath(profileName), "gateway.pid");
  if (fs.existsSync(pidFile)) {
    try {
      const raw = fs.readFileSync(pidFile, "utf-8").trim();
      const pid = raw.startsWith("{")
        ? JSON.parse(raw).pid
        : parseInt(raw, 10);
      if (typeof pid === "number" && !isNaN(pid)) {
        process.kill(pid, "SIGTERM");
      }
      fs.unlinkSync(pidFile);
    } catch {
      /* fall through */
    }
  }

  if (!hadManagedProcess) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("employee-status-changed", {
        profileName,
        status: "idle",
      });
    }
  }

  return { success: true };
}

export function resetIdleTimer(
  profileName: string,
  mainWindow: BrowserWindow | null,
): void {
  const meta = readEmployeeMeta(profileName);
  const defaults = loadAppConfig().defaults as Record<string, unknown> | undefined;
  const timeout =
    (meta?.idle_timeout as number) ||
    (defaults?.idle_timeout as number) ||
    30;
  if (timeout === 0) return;

  clearIdleTimer(profileName);
  _idleTimers[profileName] = setTimeout(() => {
    putEmployeeToSleep(profileName, mainWindow);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("employee-idle-timeout", { profileName });
    }
  }, timeout * 60 * 1000);
}

export function clearIdleTimer(profileName: string): void {
  if (_idleTimers[profileName]) {
    clearTimeout(_idleTimers[profileName]);
    delete _idleTimers[profileName];
  }
}

export function registerEmployeeIpcHandlers(
  getMainWindow: () => BrowserWindow | null,
): void {
  // Skills handlers
  ipcMain.handle("skills:listInstalled", async (_, profile?: string) => {
    const { listInstalledSkills } = await import("./skills");
    return listInstalledSkills(profile);
  });

  ipcMain.handle("skills:listBundled", async (_, profile?: string) => {
    const { listBundledSkills } = await import("./skills");
    return listBundledSkills(profile);
  });

  ipcMain.handle("skills:getContent", async (_, skillPath: string) => {
    const { getSkillContent } = await import("./skills");
    return getSkillContent(skillPath);
  });

  ipcMain.handle("skills:install", async (_, identifier: string, profile?: string) => {
    const { installSkill } = await import("./skills");
    return installSkill(identifier, profile);
  });

  ipcMain.handle("skills:uninstall", async (_, name: string, profile?: string) => {
    const { uninstallSkill } = await import("./skills");
    return uninstallSkill(name, profile);
  });

  ipcMain.handle("skills:getConfig", async (_, profile?: string) => {
    const { getSkillConfig } = await import("./skills");
    return getSkillConfig(profile);
  });

  ipcMain.handle("skills:setEnabled", async (_, skillId: string, enabled: boolean, profile?: string) => {
    const { setSkillEnabled } = await import("./skills");
    return setSkillEnabled(skillId, enabled, profile);
  });

  ipcMain.handle("skills:recordUsage", async (_, skillId: string, success: boolean, profile?: string) => {
    const { recordSkillUsage } = await import("./skills");
    return recordSkillUsage(skillId, success, profile);
  });

  ipcMain.handle("employee:list", async () => {
    const employees = listEmployees();
    const result: EmployeeInfo[] = [];
    for (const emp of employees) {
      const status = await getEmployeeStatus(emp.name);
      result.push({ ...emp, status });
    }
    return result;
  });

  ipcMain.handle("employee:get", async (_, name: string) => {
    const employees = listEmployees();
    const emp = employees.find((e) => e.name === name);
    if (!emp) return null;
    const status = await getEmployeeStatus(name);
    return { ...emp, status };
  });

  ipcMain.handle(
    "employee:create",
    async (_, config: Record<string, unknown>) => {
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
        (config.provider as string) ||
        (defaults.provider as string) ||
        "";
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
        model: { default: model, provider: provider, base_url: baseUrl },
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

      if (config.api_key || defaults.api_key) {
        const envContent =
          "OPENAI_API_KEY=" +
          ((config.api_key as string) || (defaults.api_key as string)) +
          "\n";
        fs.writeFileSync(path.join(profilePath, ".env"), envContent, "utf-8");
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
      if (win && !win.isDestroyed()) {
        win.webContents.send("employee-list-changed", { action: "created", name });
      }

      return { success: true, name };
    },
  );

  ipcMain.handle(
    "employee:update",
    async (_, name: string, changes: Record<string, unknown>) => {
      const meta = readEmployeeMeta(name) || {};
      if (changes.displayName !== undefined) meta.name = changes.displayName;
      if (changes.role !== undefined) meta.role = changes.role;
      if (changes.avatar !== undefined) meta.avatar = changes.avatar;
      if (changes.color !== undefined) meta.color = changes.color;
      if (changes.tags !== undefined) meta.tags = changes.tags;
      if (changes.idle_timeout !== undefined)
        meta.idle_timeout = changes.idle_timeout;
      writeEmployeeMeta(name, meta);
      return { success: true };
    },
  );

  ipcMain.handle("employee:delete", async (_, name: string) => {
    if (name === "default") return { error: "不能删除默认员工" };
    await putEmployeeToSleep(name, getMainWindow());
    const output = runHermesCli(
      ["profile", "delete", name, "--yes"],
      "default",
    );
    const success = !output.includes("Error");
    if (success) {
      const win = getMainWindow();
      if (win && !win.isDestroyed()) {
        win.webContents.send("employee-list-changed", { action: "deleted", name });
      }
    }
    return { success };
  });

  ipcMain.handle("employee:wake-up", async (_, name: string) => {
    return wakeUpEmployee(name, getMainWindow());
  });

  ipcMain.handle("employee:sleep", async (_, name: string) => {
    return putEmployeeToSleep(name, getMainWindow());
  });

  ipcMain.handle("employee:restart", async (_, name: string) => {
    putEmployeeToSleep(name, getMainWindow());
    await new Promise((r) => setTimeout(r, 2000));
    return wakeUpEmployee(name, getMainWindow());
  });

  ipcMain.handle("restart-all-engines", async () => {
    const onlineNames = Object.keys(_gatewayProcesses).filter(
      (k) => _gatewayProcesses[k] && !_gatewayProcesses[k].killed,
    );
    if (onlineNames.length === 0) {
      return { success: true, restarted: 0 };
    }
    for (const name of onlineNames) {
      putEmployeeToSleep(name, getMainWindow());
    }
    await new Promise((r) => setTimeout(r, 2000));
    let restarted = 0;
    for (const name of onlineNames) {
      const result = await wakeUpEmployee(name, getMainWindow());
      if (result.success) restarted++;
    }
    return { success: true, restarted, total: onlineNames.length };
  });

  ipcMain.handle("employee:status", async (_, name: string) => {
    return getEmployeeStatus(name);
  });

  ipcMain.handle("employee:get-soul", async (_, name: string) => {
    if (!validateProfileName(name) && name !== "default") return "";
    const soulPath = path.join(getProfilePath(name), "SOUL.md");
    if (!fs.existsSync(soulPath)) return "";
    try {
      return fs.readFileSync(soulPath, "utf-8");
    } catch {
      return "";
    }
  });

  ipcMain.handle(
    "employee:set-soul",
    async (_, name: string, content: string) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      const profilePath = getProfilePath(name);
      ensureDir(profilePath);
      safeWriteFile(path.join(profilePath, "SOUL.md"), content);
      return { success: true };
    },
  );

  ipcMain.handle("employee:reset-soul", async (_, name: string) => {
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
  });

  ipcMain.handle("employee:get-config", async (_, name: string) => {
    if (!validateProfileName(name) && name !== "default") return null;
    const configPath = path.join(getProfilePath(name), "config.yaml");
    if (!fs.existsSync(configPath)) return null;
    try {
      return yaml.parse(fs.readFileSync(configPath, "utf-8"));
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    "employee:set-config",
    async (_, name: string, configObj: Record<string, unknown>) => {
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
    },
  );

  ipcMain.handle("employee:get-env", async (_, name: string) => {
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
  });

  ipcMain.handle(
    "employee:set-env",
    async (_, name: string, envObj: Record<string, string>) => {
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
    },
  );

  ipcMain.handle("employee:get-skills", async (_, name: string) => {
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
  });

  ipcMain.handle(
    "employee:install-skill",
    async (_, name: string, url: string) => {
      const output = runHermesCli(
        ["skills", "install", url, "-p", name],
        name,
      );
      if (output.includes("Error") || output.includes("error")) {
        return { error: output };
      }
      return { success: true, output: output };
    },
  );

  ipcMain.handle(
    "employee:remove-skill",
    async (_, name: string, skillName: string) => {
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
    },
  );

  ipcMain.handle("employee:get-tools", async (_, name: string) => {
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
  });

  ipcMain.handle(
    "employee:set-tools",
    async (_, name: string, tools: string[]) => {
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
    },
  );

  ipcMain.handle(
    "employee:toggle-tool",
    async (_, name: string, toolKey: string, enabled: boolean) => {
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
    },
  );

  ipcMain.handle("employee:get-memory", async (_, name: string) => {
    if (!validateProfileName(name) && name !== "default")
      return { memory: [], user: "", stats: {} };
    try {
      const result: Record<string, unknown> = {
        memory: [],
        user: "",
        stats: {},
      };
      const content = loadDbMemory(name, "memory");
      if (content) {
        const entries = content
          .split("\n§\n")
          .filter((e: string) => e.trim().length > 0);
        result.memory = entries.map(
          (e: string, i: number) => ({ index: i, content: e.trim() }),
        );
        result.memoryCharCount = content.length;
        result.memoryCharLimit = 2200;
      }
      const user = loadDbMemory(name, "user");
      if (user) {
        result.user = user;
        result.userCharCount = (result.user as string).length;
        result.userCharLimit = 1375;
      }
      result.stats = { totalSessions: getSessionCount() };
      return result;
    } catch {
      return { memory: [], user: "", stats: {} };
    }
  });

  ipcMain.handle(
    "employee:add-memory",
    async (_, name: string, content: string) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      try {
        const existing = loadDbMemory(name, "memory");
        const newContent = existing.trim()
          ? existing.trimEnd() + "\n§\n" + content.trim()
          : content.trim();
        if (newContent.length > 2200)
          return {
            error: "超出记忆容量限制 (" + newContent.length + "/2200)",
          };
        saveDbMemory(name, "memory", newContent);
        return { success: true };
      } catch (e: unknown) {
        return { error: String(e) };
      }
    },
  );

  ipcMain.handle(
    "employee:delete-memory",
    async (_, name: string, index: number) => {
      if (!validateProfileName(name) && name !== "default")
        return { error: "无效的员工名称" };
      try {
        const content = loadDbMemory(name, "memory");
        if (!content) return { error: "记忆不存在" };
        const entries = content
          .split("\n§\n")
          .filter((e: string) => e.trim().length > 0);
        const idx = parseInt(String(index), 10);
        if (idx < 0 || idx >= entries.length)
          return { error: "条目不存在" };
        entries.splice(idx, 1);
        saveDbMemory(name, "memory", entries.join("\n§\n"));
        return { success: true };
      } catch (e: unknown) {
        return { error: String(e) };
      }
    },
  );

  ipcMain.handle(
    "employee:rename",
    async (_, oldName: string, newName: string) => {
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
      return { success: true };
    },
  );

  ipcMain.handle("employee:set-pet", async (_, name: string, petSlug: string) => {
    if (!validateProfileName(name)) return { error: "无效的员工名称" };
    const meta = readEmployeeMeta(name);
    if (!meta) return { error: "员工不存在" };
    meta.petSlug = petSlug;
    writeEmployeeMeta(name, meta);
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send("employee-list-changed", { action: "updated", name });
    }
    return { success: true };
  });

  ipcMain.handle("employee:export", async (_, name: string) => {
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
  });

  ipcMain.handle("employee:get-sessions", async (_, name: string) => {
    if (!validateProfileName(name)) return [];
    return getEmployeeSessions(name, 20);
  });
}
