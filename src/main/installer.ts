import { spawn, execFile, execFileSync } from "child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  writeFileSync,
  cpSync,
  createWriteStream,
  readdirSync,
  renameSync,
  rmSync,
} from "fs";
import { get } from "https";
import { get as httpGet } from "http";
import { join, delimiter, dirname, basename } from "path";
import { homedir } from "os";
import { TextDecoder } from "util";

import { HERMES_HOME } from "./config";
import * as yaml from "./lib/yaml-simple";
import { yamlStringify } from "./utils";

const HERMES_REPO = join(HERMES_HOME, "hermes-agent");
const HERMES_VENV = join(HERMES_REPO, "venv");
const HERMES_PYTHON =
  process.platform === "win32"
    ? join(HERMES_VENV, "Scripts", "python.exe")
    : join(HERMES_VENV, "bin", "python");
const HERMES_SCRIPT = join(HERMES_REPO, "hermes");
const HERMES_ENV_FILE = join(HERMES_HOME, ".env");
const HERMES_CONFIG_FILE = join(HERMES_HOME, "config.yaml");
const HERMES_PIP_CACHE = join(HERMES_HOME, ".pip-cache");

const HERMES_REPO_URL = "https://gitee.com/YanPro/ly-hermes-agent";
const HERMES_REPO_ZIP_URL = "http://120.26.42.178:88/main.zip";
const HERMES_SOURCE_FILE = join(HERMES_REPO, ".hermes-desktop-source.json");
const CHINA_PIP_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple";
const CHINA_PIP_TRUSTED_HOST = "pypi.tuna.tsinghua.edu.cn";
const DESKTOP_REQUIRED_PY_PACKAGES = [
  "aiohttp==3.13.3",
  "websockets==15.0.1",
];
const DESKTOP_REQUIRED_PY_MODULES = [
  { module: "aiohttp", package: "aiohttp==3.13.3" },
  { module: "websockets", package: "websockets==15.0.1" },
];
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
const DEFAULT_DESKTOP_SKILLS = [
  "software-development/plan",
  "software-development/systematic-debugging",
  "software-development/writing-plans",
  "research/llm-wiki",
  "creative/creative-ideation",
  "productivity/ocr-and-documents",
];

export interface InstallStatus {
  installed: boolean;
  configured: boolean;
  hasApiKey: boolean;
}

export interface InstallProgress {
  step: number;
  totalSteps: number;
  title: string;
  detail: string;
  log: string;
}

const STAGES = [
  "检查 Python",
  "检查 Git",
  "准备 Agent",
  "创建虚拟环境",
  "安装依赖",
  "完成安装",
];

function decodeProcessOutput(buffer: Buffer): string {
  if (buffer.length === 0) return "";
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  if (process.platform !== "win32" || !utf8.includes("\uFFFD")) return utf8;
  try {
    return new TextDecoder("gb18030", { fatal: false }).decode(buffer);
  } catch {
    return utf8;
  }
}

function cleanInstallOutput(text: string): string {
  return stripAnsi(text)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function tailInstallOutput(text: string, maxLength: number): string {
  const cleaned = cleanInstallOutput(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.slice(-maxLength);
}

function getPythonVersion(cmd: string): { ok: boolean; version?: string } {
  try {
    const out = execFileSync(cmd, ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      env: Object.assign({}, process.env, { PATH: getEnhancedPath() }),
    }).trim();
    const m = out.match(/Python\s+(\d+)\.(\d+)(?:\.(\d+))?/);
    if (!m) return { ok: false };
    const major = parseInt(m[1], 10);
    const minor = parseInt(m[2], 10);
    return { ok: major === 3 && minor >= 11, version: m[0] };
  } catch {
    return { ok: false };
  }
}

export function getEnhancedPath(): string {
  const home = homedir();
  const extraPaths: string[] = [];
  if (process.platform === "darwin") {
    extraPaths.push(
      "/usr/local/bin",
      "/opt/homebrew/bin",
      "/opt/homebrew/sbin",
      join(home, ".local", "bin"),
      join(home, "homebrew", "bin"),
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      join(home, ".cargo", "bin"),
    );
  } else if (process.platform === "linux") {
    extraPaths.push(
      "/usr/local/bin",
      "/usr/bin",
      "/bin",
      "/usr/sbin",
      "/sbin",
      join(home, ".local", "bin"),
      join(home, ".cargo", "bin"),
    );
  } else {
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    extraPaths.push(
      join(localAppData, "Programs", "Python", "Python312"),
      join(localAppData, "Programs", "Python", "Python311"),
      join(localAppData, "Programs", "Python", "Python310"),
      join(programFiles, "Git", "cmd"),
      join(programFiles, "Git", "bin"),
      join(programFilesX86, "Git", "cmd"),
      join(programFilesX86, "Git", "bin"),
      join(localAppData, "Programs", "Git", "cmd"),
      join(localAppData, "Programs", "Git", "bin"),
      join(home, "AppData", "Local", "Microsoft", "WindowsApps"),
      join(home, ".cargo", "bin"),
    );
  }
  const currentPath = process.env.PATH || "";
  const existing = new Set(currentPath.split(delimiter));
  const merged = currentPath.split(delimiter);
  for (const p of extraPaths) {
    if (!existing.has(p)) {
      merged.push(p);
      existing.add(p);
    }
  }
  return merged.join(delimiter);
}

export function checkInstallStatus(): InstallStatus {
  const filesExist =
    existsSync(HERMES_PYTHON) && existsSync(HERMES_SCRIPT);
  let installed = false;
  if (filesExist) {
    try {
      const env = Object.assign({}, process.env, {
        HOME: homedir(),
        HERMES_HOME,
        PATH: getEnhancedPath(),
      });
      const versionOut = execFileSync(
        HERMES_PYTHON,
        [HERMES_SCRIPT, "--version"],
        { encoding: "utf-8", timeout: 10000, env },
      ).trim();
      installed = /\d+\.\d+/.test(versionOut);
      if (installed) {
        ensureDesktopManagedHermesFiles();
      }
    } catch {
      installed = false;
    }
  }
  const configured = existsSync(HERMES_ENV_FILE);
  let hasApiKey = false;
  if (configured) {
    try {
      const envContent = readFileSync(HERMES_ENV_FILE, "utf-8");
      hasApiKey = /API_KEY\s*=\s*\S+/.test(envContent);
    } catch {
      hasApiKey = false;
    }
  }
  return { installed, configured, hasApiKey };
}

let _verifyCache: { result: boolean; ts: number } | null = null;
const VERIFY_CACHE_TTL = 5 * 60 * 1000;

export async function verifyInstall(): Promise<boolean> {
  if (_verifyCache && Date.now() - _verifyCache.ts < VERIFY_CACHE_TTL) {
    return _verifyCache.result;
  }
  return new Promise((resolve) => {
    const env = Object.assign({}, process.env, {
      HOME: homedir(),
      HERMES_HOME,
      PATH: getEnhancedPath(),
    });
    execFile(
      HERMES_PYTHON,
      [HERMES_SCRIPT, "--version"],
      { env, timeout: 15000, windowsHide: true },
      (error, stdout) => {
        const ok = !error && /\d+\.\d+/.test(stdout || "");
        _verifyCache = { result: ok, ts: Date.now() };
        resolve(ok);
      },
    );
  });
}

function findSystemPython(): string | null {
  const candidates: string[] = [];
  if (process.platform === "win32") {
    const home = homedir();
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    candidates.push(
      "python",
      "python3",
      "py",
      join(localAppData, "Programs", "Python", "Python312", "python.exe"),
      join(localAppData, "Programs", "Python", "Python311", "python.exe"),
      join(localAppData, "Microsoft", "WindowsApps", "python.exe"),
      join(localAppData, "Microsoft", "WindowsApps", "python3.exe"),
    );
  } else {
    candidates.push("python3", "python");
  }
  for (const cmd of candidates) {
    const version = getPythonVersion(cmd);
    if (version.ok) return cmd;
  }
  return null;
}

async function ensureSystemPython(
  env: Record<string, string>,
  emit: (step: number, detail: string) => void,
): Promise<{ python: string | null; installed: boolean; warning?: string }> {
  const existing = findSystemPython();
  if (existing) return { python: existing, installed: false };

  if (process.platform !== "win32") {
    return {
      python: null,
      installed: false,
      warning: getPythonMissingMessage(),
    };
  }

  const winget = findWinget();
  if (!winget) {
    return {
      python: null,
      installed: false,
      warning: `${getPythonMissingMessage()} 未检测到 winget，无法自动安装 Python。`,
    };
  }

  emit(1, "未检测到 Python 3.11+，正在通过 Windows winget 安装 Python 3.12...");
  const installR = await runStep(
    winget,
    [
      "install",
      "--id",
      "Python.Python.3.12",
      "-e",
      "--source",
      "winget",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    HERMES_HOME,
    env,
    600000,
  );

  const python = findSystemPython();
  if (python) return { python, installed: true };

  return {
    python: null,
    installed: false,
    warning: `Python 自动安装未完成。${getPythonMissingMessage()} winget 输出：${tailInstallOutput(installR.stderr || installR.stdout, 500)}`,
  };
}

function getPythonMissingMessage(): string {
  const base = "未检测到系统 Python 3.11+。请先安装 Python 3.11 或 3.12，并确认已加入 PATH，然后回到这里重试安装 Hermes Agent。";
  if (process.platform === "win32") {
    return `${base} Windows 安装时请勾选 “Add python.exe to PATH”；如使用国内网络，可选择可信的 Python 国内镜像或软件管家安装。`;
  }
  if (process.platform === "darwin") {
    return `${base} macOS 可使用 python.org 安装包或 Homebrew 安装。`;
  }
  return `${base} Linux 可使用系统包管理器安装 python3、python3-venv 和 python3-pip。`;
}

function findSystemGit(): string | null {
  const candidates = ["git"];
  if (process.platform === "win32") {
    const home = homedir();
    const programFiles = process.env.ProgramFiles || "C:\\Program Files";
    const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const localAppData = process.env.LOCALAPPDATA || join(home, "AppData", "Local");
    candidates.push(
      join(programFiles, "Git", "cmd", "git.exe"),
      join(programFiles, "Git", "bin", "git.exe"),
      join(programFilesX86, "Git", "cmd", "git.exe"),
      join(programFilesX86, "Git", "bin", "git.exe"),
      join(localAppData, "Programs", "Git", "cmd", "git.exe"),
      join(localAppData, "Programs", "Git", "bin", "git.exe"),
    );
  }
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
        env: Object.assign({}, process.env, { PATH: getEnhancedPath() }),
      });
      return candidate;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

function findWinget(): string | null {
  if (process.platform !== "win32") return null;
  const home = homedir();
  const candidates = [
    "winget",
    join(home, "AppData", "Local", "Microsoft", "WindowsApps", "winget.exe"),
  ];
  for (const candidate of candidates) {
    try {
      execFileSync(candidate, ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
        env: Object.assign({}, process.env, { PATH: getEnhancedPath() }),
      });
      return candidate;
    } catch {
      /* try next candidate */
    }
  }
  return null;
}

async function ensureSystemGit(
  env: Record<string, string>,
  emit: (step: number, detail: string) => void,
): Promise<{ git: string | null; installed: boolean; warning?: string }> {
  const existing = findSystemGit();
  if (existing) return { git: existing, installed: false };

  if (process.platform !== "win32") {
    return {
      git: null,
      installed: false,
      warning: "未检测到 Git；当前系统暂不支持自动安装，将使用压缩包方式准备 Agent。",
    };
  }

  const winget = findWinget();
  if (!winget) {
    return {
      git: null,
      installed: false,
      warning: "未检测到 Git，也未检测到 winget；将使用压缩包方式准备 Agent。建议安装 Git for Windows 以获得更稳定的更新能力。",
    };
  }

  emit(2, "未检测到 Git，正在通过 Windows winget 安装 Git for Windows...");
  const installR = await runStep(
    winget,
    [
      "install",
      "--id",
      "Git.Git",
      "-e",
      "--source",
      "winget",
      "--silent",
      "--accept-package-agreements",
      "--accept-source-agreements",
    ],
    HERMES_HOME,
    env,
    600000,
  );
  const git = findSystemGit();
  if (git) return { git, installed: true };

  return {
    git: null,
    installed: false,
    warning: `Git 自动安装未完成，将使用压缩包方式准备 Agent。winget 输出：${tailInstallOutput(installR.stderr || installR.stdout, 400)}`,
  };
}

function getPipInstallArgs(useChinaMirror: boolean): string[] {
  const args = [
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
    "-e",
    ".",
    ...DESKTOP_REQUIRED_PY_PACKAGES,
  ];
  if (useChinaMirror) {
    args.push("-i", CHINA_PIP_INDEX_URL, "--trusted-host", CHINA_PIP_TRUSTED_HOST);
  }
  return args;
}

function getPipPackageInstallArgs(packages: string[], useChinaMirror: boolean): string[] {
  const args = [
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
    ...packages,
  ];
  if (useChinaMirror) {
    args.push("-i", CHINA_PIP_INDEX_URL, "--trusted-host", CHINA_PIP_TRUSTED_HOST);
  }
  return args;
}

function ensureDesktopManagedHermesFiles(): string[] {
  const warnings: string[] = [];
  ensureDir(HERMES_HOME);
  if (!existsSync(HERMES_ENV_FILE)) {
    writeFileSync(
      HERMES_ENV_FILE,
      [
        "# Managed by Hermes Desktop.",
        "# Add provider API keys here or configure them in the desktop app.",
        "GATEWAY_ALLOW_ALL_USERS=true",
        "",
      ].join("\n"),
      "utf-8",
    );
  } else {
    const envContent = readFileSync(HERMES_ENV_FILE, "utf-8");
    if (!/^GATEWAY_ALLOW_ALL_USERS=/m.test(envContent)) {
      writeFileSync(
        HERMES_ENV_FILE,
        envContent.trimEnd() + "\nGATEWAY_ALLOW_ALL_USERS=true\n",
        "utf-8",
      );
    }
  }

  let cfg: Record<string, unknown> = {};
  try {
    if (existsSync(HERMES_CONFIG_FILE)) {
      cfg = yaml.parse(readFileSync(HERMES_CONFIG_FILE, "utf-8"));
    }
  } catch {
    cfg = {};
  }
  if (!cfg.model || typeof cfg.model !== "object") {
    cfg.model = {};
  }
  const modelCfg = cfg.model as Record<string, unknown>;
  if (!modelCfg.default) modelCfg.default = "deepseek-v4-flash";
  if (!modelCfg.provider) modelCfg.provider = "deepseek";
  if (!modelCfg.base_url) modelCfg.base_url = "https://api.deepseek.com/v1";

  if (!cfg.platform_toolsets || typeof cfg.platform_toolsets !== "object") {
    cfg.platform_toolsets = {};
  }
  if (!cfg.platforms || typeof cfg.platforms !== "object") {
    cfg.platforms = {};
  }
  const platforms = cfg.platforms as Record<string, unknown>;
  if (!platforms.api_server || typeof platforms.api_server !== "object") {
    platforms.api_server = {};
  }
  const apiServer = platforms.api_server as Record<string, unknown>;
  if (!apiServer.extra || typeof apiServer.extra !== "object") {
    apiServer.extra = {};
  }
  const apiExtra = apiServer.extra as Record<string, unknown>;
  if (!apiExtra.port) apiExtra.port = 8644;
  if (!apiExtra.host) apiExtra.host = "127.0.0.1";

  const toolsets = cfg.platform_toolsets as Record<string, unknown>;
  if (!Array.isArray(toolsets.cli) || toolsets.cli.length === 0) {
    toolsets.cli = DEFAULT_DESKTOP_TOOLS;
  }
  if (!Array.isArray(toolsets.api_server) || toolsets.api_server.length === 0) {
    toolsets.api_server = DEFAULT_DESKTOP_TOOLS;
  }
  writeFileSync(HERMES_CONFIG_FILE, yamlStringify(cfg), "utf-8");

  const repoSkillsDir = join(HERMES_REPO, "skills");
  const targetSkillsDir = join(HERMES_HOME, "skills");
  for (const skill of DEFAULT_DESKTOP_SKILLS) {
    try {
      const source = join(repoSkillsDir, skill);
      const target = join(targetSkillsDir, skill);
      if (!existsSync(join(source, "SKILL.md")) || existsSync(target)) continue;
      ensureDir(dirname(target));
      cpSync(source, target, { recursive: true, errorOnExist: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`默认技能 ${skill} 复制失败，已跳过：${cleanInstallOutput(message) || "权限受限"}`);
    }
  }
  return warnings;
}

async function getMissingDesktopRuntimePackages(env: Record<string, string>): Promise<string[]> {
  if (!existsSync(HERMES_PYTHON)) return DESKTOP_REQUIRED_PY_MODULES.map((item) => item.package);
  const script = [
    "import importlib.util",
    "mods = " + JSON.stringify(DESKTOP_REQUIRED_PY_MODULES.map((item) => item.module)),
    "print(','.join(m for m in mods if importlib.util.find_spec(m) is None))",
  ].join("\n");
  const check = await runStep(HERMES_PYTHON, ["-c", script], HERMES_REPO, env, 15000);
  if (!check.success) return DESKTOP_REQUIRED_PY_MODULES.map((item) => item.package);
  const missingModules = new Set(check.stdout.trim().split(",").filter(Boolean));
  return DESKTOP_REQUIRED_PY_MODULES
    .filter((item) => missingModules.has(item.module))
    .map((item) => item.package);
}

export async function ensureDesktopRuntimeDependencies(): Promise<{ success: boolean; error?: string }> {
  const env = Object.assign({}, process.env, {
    HOME: homedir(),
    HERMES_HOME,
    PATH: getEnhancedPath(),
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_DEFAULT_TIMEOUT: "60",
    PIP_NO_INPUT: "1",
    PIP_CACHE_DIR: HERMES_PIP_CACHE,
  }) as Record<string, string>;
  const missingPackages = await getMissingDesktopRuntimePackages(env);
  if (missingPackages.length === 0) return { success: true };

  const mirrorR = await runStep(
    HERMES_PYTHON,
    getPipPackageInstallArgs(missingPackages, true),
    HERMES_REPO,
    env,
    300000,
  );
  if (mirrorR.success) return { success: true };

  const officialR = await runStep(
    HERMES_PYTHON,
    getPipPackageInstallArgs(missingPackages, false),
    HERMES_REPO,
    env,
    300000,
  );
  if (officialR.success) return { success: true };

  return {
    success: false,
    error: `桌面端运行依赖安装失败：${tailInstallOutput(officialR.stderr, 500) || tailInstallOutput(mirrorR.stderr, 500)}`,
  };
}

function runStep(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<{ success: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const stepEnv = Object.assign({}, env, {
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
      PIP_NO_COLOR: "1",
    });
    const proc = spawn(cmd, args, {
      cwd,
      env: stepEnv,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const readOutput = (): { stdout: string; stderr: string } => ({
      stdout: decodeProcessOutput(Buffer.concat(stdoutChunks)),
      stderr: decodeProcessOutput(Buffer.concat(stderrChunks)),
    });
    proc.stdout?.on("data", (d: Buffer) => { stdoutChunks.push(d); });
    proc.stderr?.on("data", (d: Buffer) => { stderrChunks.push(d); });
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      const { stdout, stderr } = readOutput();
      resolve({ success: false, stdout, stderr: stderr + "\n(超时)" });
    }, timeoutMs);
    proc.on("close", (code) => {
      clearTimeout(timer);
      const { stdout, stderr } = readOutput();
      resolve({ success: code === 0, stdout, stderr });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      const { stdout } = readOutput();
      resolve({ success: false, stdout, stderr: err.message });
    });
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function removeDir(target: string): void {
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
}

async function stopPid(pid: number): Promise<void> {
  if (!pid || Number.isNaN(pid)) return;
  if (process.platform === "win32") {
    await runStep("taskkill", ["/PID", String(pid), "/T", "/F"], HERMES_HOME, process.env as Record<string, string>, 15000);
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* process already gone */
  }
}

async function stopHermesRuntimeProcesses(): Promise<void> {
  const pidFiles = [join(HERMES_HOME, "gateway.pid")];
  const profilesDir = join(HERMES_HOME, "profiles");
  if (existsSync(profilesDir)) {
    try {
      for (const entry of readdirSync(profilesDir, { withFileTypes: true })) {
        if (entry.isDirectory()) pidFiles.push(join(profilesDir, entry.name, "gateway.pid"));
      }
    } catch {
      /* ignore */
    }
  }

  for (const pidFile of pidFiles) {
    if (!existsSync(pidFile)) continue;
    try {
      const raw = readFileSync(pidFile, "utf-8").trim();
      const pid = raw.startsWith("{") ? JSON.parse(raw).pid : parseInt(raw, 10);
      if (typeof pid === "number") await stopPid(pid);
      rmSync(pidFile, { force: true });
    } catch {
      /* ignore stale pid file */
    }
  }

  if (process.platform === "win32") {
    const repoNeedle = HERMES_REPO.replace(/\\/g, "\\\\").replace(/'/g, "''");
    const ps = [
      "$needle = '" + repoNeedle + "';",
      "Get-CimInstance Win32_Process |",
      "Where-Object { $_.CommandLine -and $_.CommandLine.Contains($needle) } |",
      "ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }",
    ].join(" ");
    await runStep("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], HERMES_HOME, process.env as Record<string, string>, 20000);
  }

  await wait(1000);
}

async function removeDirWithRetries(target: string): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      removeDir(target);
      return !existsSync(target);
    } catch {
      await wait(500 + attempt * 500);
    }
  }
  return !existsSync(target);
}

async function moveAsideDirWithRetries(target: string): Promise<boolean> {
  if (!existsSync(target)) return true;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const backup = `${target}.old-${Date.now()}-${attempt}`;
    try {
      renameSync(target, backup);
      return true;
    } catch {
      await wait(500 + attempt * 500);
    }
  }
  return false;
}

function downloadFile(url: string, dest: string, timeoutMs: number): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const client = url.startsWith("http://") ? httpGet : get;
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
      const file = createWriteStream(dest);
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

async function getGiteeMainSha(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = get("https://gitee.com/api/v5/repos/YanPro/ly-hermes-agent/branches/main", { timeout: 10000 }, (res) => {
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
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function writeDesktopSourceMarker(commit: string | null, method: "git" | "zip"): void {
  try {
    writeFileSync(
      HERMES_SOURCE_FILE,
      JSON.stringify({
        repo: HERMES_REPO_URL,
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

async function downloadRepoZip(pythonCmd: string, env: Record<string, string>, emit: (step: number, detail: string) => void): Promise<{ success: boolean; error?: string }> {
  ensureDir(dirname(HERMES_REPO));
  const tmpRoot = join(HERMES_HOME, ".install-tmp");
  const zipPath = join(tmpRoot, "hermes-agent.zip");
  const extractDir = join(tmpRoot, "repo");
  removeDir(tmpRoot);
  ensureDir(tmpRoot);

  emit(3, "未检测到 Git，正在下载 Hermes Agent 压缩包...");
  const download = await downloadFile(HERMES_REPO_ZIP_URL, zipPath, 300000);
  if (!download.success) {
    return { success: false, error: `仓库下载失败：${download.error || "网络错误，请检查是否能访问 gitee.com"}` };
  }

  // 验证下载的文件是否真的是 zip（检查 magic bytes PK\x03\x04）
  try {
    const header = readFileSync(zipPath).slice(0, 4);
    if (header[0] !== 0x50 || header[1] !== 0x4b) {
      return { success: false, error: "下载的文件不是有效的 ZIP，请检查网络或尝试安装 Git" };
    }
  } catch {
    return { success: false, error: "ZIP 文件校验失败" };
  }

  emit(3, "仓库压缩包下载完成，正在解压...");
  ensureDir(extractDir);
  const unzip = await runStep(pythonCmd, ["-m", "zipfile", "-e", zipPath, extractDir], tmpRoot, env, 120000);
  if (!unzip.success) {
    return { success: false, error: `仓库解压失败：${tailInstallOutput(unzip.stderr, 300)}` };
  }

  // 找到解压后的实际仓库目录（可能是单级子目录或多级如 YanPro-ly-hermes-agent-xxx）
  const entries = readdirSync(extractDir, { withFileTypes: true }).filter(e => e.isDirectory());
  let repoRoot: string;
  if (entries.length === 1) {
    repoRoot = join(extractDir, entries[0].name);
  } else if (entries.length === 0) {
    repoRoot = extractDir;
  } else {
    // Gitee API 解压后可能是 YanPro-ly-hermes-agent-<commit> 格式
    const match = entries.find(e => /ly-hermes-agent/i.test(e.name));
    repoRoot = match ? join(extractDir, match.name) : extractDir;
  }

  // 验证仓库目录是否有效（至少包含 hermes 脚本或 pyproject.toml）
  if (!existsSync(join(repoRoot, "hermes")) && !existsSync(join(repoRoot, "pyproject.toml"))) {
    return { success: false, error: "解压后的目录结构不符合预期，可能是下载了错误的文件" };
  }

  if (!(await removeDirWithRetries(HERMES_REPO))) {
    return { success: false, error: "旧 Agent 目录正在被占用，请关闭正在运行的 Hermes 后重试" };
  }
  renameSync(repoRoot, HERMES_REPO);
  writeDesktopSourceMarker(await getGiteeMainSha(), "zip");
  removeDir(tmpRoot);
  emit(3, `仓库准备完成（${basename(HERMES_REPO)}）`);
  return { success: true };
}

export async function runInstall(
  onProgress?: (progress: InstallProgress) => void,
): Promise<{ success: boolean; error?: string }> {
  const totalSteps = STAGES.length;
  let log = "";

  const emit = (step: number, detail: string): void => {
    log += detail + "\n";
    onProgress?.({
      step,
      totalSteps,
      title: STAGES[step - 1] || "",
      detail: detail.slice(0, 200),
      log,
    });
  };

  const fail = (resolve: (v: { success: boolean; error?: string }) => void, msg: string): void => {
    emit(totalSteps, msg);
    resolve({ success: false, error: msg });
  };

  const installEnv = Object.assign({}, process.env, {
    HOME: homedir(),
    HERMES_HOME,
    PATH: getEnhancedPath(),
    PIP_DISABLE_PIP_VERSION_CHECK: "1",
    PIP_DEFAULT_TIMEOUT: "60",
    PIP_NO_INPUT: "1",
    PIP_CACHE_DIR: HERMES_PIP_CACHE,
  }) as Record<string, string>;

  return new Promise((resolve) => {
    emit(1, "正在检查系统环境...");

    ensureDir(dirname(HERMES_REPO));
    ensureDir(HERMES_HOME);

    (async () => {
      const pythonCheck = await ensureSystemPython(installEnv, emit);
      const pythonCmd = pythonCheck.python;
      if (!pythonCmd) {
        fail(resolve, pythonCheck.warning || getPythonMissingMessage());
        return;
      }
      emit(1, pythonCheck.installed ? "Python 3.12 安装完成，正在检查 Git..." : "系统 Python 已就绪，正在检查 Git...");

      const gitCheck = await ensureSystemGit(installEnv, emit);
      const sysGit = gitCheck.git;
      if (sysGit) {
        emit(2, gitCheck.installed ? "Git 安装完成，开始准备 Hermes Agent..." : "Git 已就绪，开始准备 Hermes Agent...");
      } else {
        emit(2, gitCheck.warning || "未检测到 Git，将使用压缩包方式准备 Agent。");
      }

      emit(3, "正在停止旧的 Hermes 运行进程...");
      await stopHermesRuntimeProcesses();

      const cloneExist = existsSync(join(HERMES_REPO, ".git"));
      if (cloneExist && sysGit) {
        emit(3, `正在更新已有 Hermes Agent 仓库...`);
        const pullR = await runStep(sysGit, ["pull", "--ff-only", HERMES_REPO_URL, "main"], HERMES_REPO, installEnv, 120000);
        if (!pullR.success) {
          emit(3, `仓库已存在但更新失败，将重新克隆...`);
          if (!(await removeDirWithRetries(HERMES_REPO))) {
            fail(resolve, "旧 Agent 目录正在被占用，请关闭正在运行的 Hermes 后重试");
            return;
          }
        } else {
          emit(3, `仓库已更新到最新版本`);
          writeDesktopSourceMarker(await getGiteeMainSha(), "git");
        }
      } else if (existsSync(HERMES_REPO) && !cloneExist) {
        emit(3, `检测到已有 Agent 目录，将重新准备...`);
        if (!(await removeDirWithRetries(HERMES_REPO))) {
          fail(resolve, "旧 Agent 目录正在被占用，请关闭正在运行的 Hermes 后重试");
          return;
        }
      }

      if (!existsSync(join(HERMES_REPO, ".git"))) {
        if (sysGit) {
          emit(3, `正在从 Gitee 克隆仓库到 ${HERMES_REPO} ...`);
          const cloneR = await runStep(sysGit, ["clone", HERMES_REPO_URL, HERMES_REPO], dirname(HERMES_REPO), installEnv, 300000);
          if (!cloneR.success) {
            emit(3, `Git 克隆失败，尝试压缩包安装...`);
            const zipR = await downloadRepoZip(pythonCmd, installEnv, emit);
            if (!zipR.success) {
              fail(resolve, zipR.error || `仓库准备失败：${tailInstallOutput(cloneR.stderr, 300)}`);
              return;
            }
          } else {
            emit(3, `仓库克隆成功`);
            writeDesktopSourceMarker(await getGiteeMainSha(), "git");
          }
        } else {
          const zipR = await downloadRepoZip(pythonCmd, installEnv, emit);
          if (!zipR.success) {
            fail(resolve, zipR.error || "仓库准备失败");
            return;
          }
        }
      }

      if (existsSync(HERMES_VENV)) {
        emit(4, `正在替换旧 Python 虚拟环境...`);
        if (!(await moveAsideDirWithRetries(HERMES_VENV))) {
          await stopHermesRuntimeProcesses();
          if (!(await moveAsideDirWithRetries(HERMES_VENV))) {
            fail(resolve, "旧虚拟环境仍被 Windows 占用，请关闭 Hermes 相关进程后重试");
            return;
          }
        }
      } else {
        emit(4, `正在创建 Python 虚拟环境...`);
      }
      const venvR = await runStep(pythonCmd, ["-m", "venv", HERMES_VENV], dirname(HERMES_REPO), installEnv, 120000);
      if (!venvR.success) {
        fail(resolve, `虚拟环境创建失败：${tailInstallOutput(venvR.stderr, 300)}`);
        return;
      }
      emit(4, `虚拟环境创建成功`);

      const hasPip = await runStep(HERMES_PYTHON, ["-m", "pip", "--version"], HERMES_REPO, installEnv, 10000);
      if (!hasPip.success) {
        emit(5, `pip 未随虚拟环境安装，正在通过 ensurepip 安装...`);
        const ensureR = await runStep(HERMES_PYTHON, ["-m", "ensurepip", "--upgrade"], HERMES_REPO, installEnv, 60000);
        if (!ensureR.success) {
          fail(resolve, `pip 安装失败：${tailInstallOutput(ensureR.stderr, 300)}。请确保系统 Python 安装了 ensurepip 模块。`);
          return;
        }
      }

      emit(5, `正在安装 Python 依赖（优先使用国内 PyPI 镜像与本地缓存）...`);
      const installR = await runStep(HERMES_PYTHON, getPipInstallArgs(true), HERMES_REPO, installEnv, 600000);
      if (!installR.success) {
        const stderrTail = tailInstallOutput(installR.stderr || installR.stdout, 500);
        emit(5, `国内 PyPI 镜像安装失败，尝试官方 PyPI...`);
        const officialR = await runStep(HERMES_PYTHON, getPipInstallArgs(false), HERMES_REPO, installEnv, 600000);
        if (!officialR.success) {
          fail(resolve, `依赖安装失败：${tailInstallOutput(officialR.stderr || officialR.stdout, 500) || stderrTail || "请检查网络、Python/pip 与代理设置后重试"}`);
          return;
        }
        emit(5, `依赖安装成功（官方 PyPI）`);
      } else {
        emit(5, `依赖安装成功（清华镜像）`);
      }

      const skillWarnings = ensureDesktopManagedHermesFiles();
      for (const warning of skillWarnings.slice(0, 3)) {
        emit(totalSteps, warning);
      }
      if (skillWarnings.length > 3) {
        emit(totalSteps, `还有 ${skillWarnings.length - 3} 个默认技能复制失败，安装完成后可在技能库中重新安装。`);
      }
      _verifyCache = null;
      emit(totalSteps, "Hermes Agent 安装完成！");

      resolve({ success: true });
    })().catch((e: Error) => {
      fail(resolve, `安装异常：${e.message}`);
    });
  });
}

export async function getHermesVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      if (existsSync(join(HERMES_REPO, ".git"))) {
        execFileSync("git", ["remote", "set-url", "origin", HERMES_REPO_URL], {
          cwd: HERMES_REPO,
          timeout: 10000,
        });
      }
      rmSync(join(HERMES_HOME, ".update_check"), { force: true });
    } catch {
      /* ignore */
    }
    const env = Object.assign({}, process.env, {
      HOME: homedir(),
      HERMES_HOME,
      PATH: getEnhancedPath(),
    });
    execFile(
      HERMES_PYTHON,
      [HERMES_SCRIPT, "--version"],
      { env, timeout: 15000, windowsHide: true },
      (error, stdout) => {
        if (error) {
          resolve(null);
        } else {
          resolve(
            stdout
              .toString()
              .split(/\r?\n/)
              .filter((line) => !/^\s*(Update available:|Up to date\b|✓\s*Already up to date|⚕\s*Update available)/i.test(line))
              .join("\n")
              .trim(),
          );
        }
      },
    );
  });
}

export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
