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
const HERMES_REPO_ZIP_URL = "http://www.luoyungu.com/main.zip";
const CHINA_PIP_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple";
const CHINA_PIP_TRUSTED_HOST = "pypi.tuna.tsinghua.edu.cn";
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
  "准备 Agent",
  "创建虚拟环境",
  "安装依赖",
  "完成安装",
];

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
    extraPaths.push(
      join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Programs", "Python", "Python312"),
      join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Programs", "Python", "Python311"),
      join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Programs", "Python", "Python310"),
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
    candidates.push("python", "python3", "py");
  } else {
    candidates.push("python3", "python");
  }
  for (const cmd of candidates) {
    const version = getPythonVersion(cmd);
    if (version.ok) return cmd;
  }
  return null;
}

function findPython(): string | null {
  return findSystemPython();
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
  try {
    execFileSync("git", ["--version"], {
      encoding: "utf-8",
      timeout: 5000,
      env: Object.assign({}, process.env, { PATH: getEnhancedPath() }),
    });
    return "git";
  } catch {
    return null;
  }
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
  ];
  if (useChinaMirror) {
    args.push("-i", CHINA_PIP_INDEX_URL, "--trusted-host", CHINA_PIP_TRUSTED_HOST);
  }
  return args;
}

function ensureDesktopManagedHermesFiles(): void {
  ensureDir(HERMES_HOME);
  if (!existsSync(HERMES_ENV_FILE)) {
    writeFileSync(
      HERMES_ENV_FILE,
      [
        "# Managed by Hermes Desktop.",
        "# Add provider API keys here or configure them in the desktop app.",
        "",
      ].join("\n"),
      "utf-8",
    );
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
    const source = join(repoSkillsDir, skill);
    const target = join(targetSkillsDir, skill);
    if (!existsSync(join(source, "SKILL.md")) || existsSync(target)) continue;
    ensureDir(dirname(target));
    cpSync(source, target, { recursive: true });
  }
}

function runStep(
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
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
}

function downloadFile(url: string, dest: string, timeoutMs: number): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    const client = url.startsWith("http://") ? httpGet : get;
    const req = client(url, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
        downloadFile(res.headers.location, dest, timeoutMs).then(resolve);
        return;
      }
      if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }
      const file = createWriteStream(dest);
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve({ success: true });
      });
      file.on("error", (err) => resolve({ success: false, error: err.message }));
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ success: false, error: "下载超时" });
    });
    req.on("error", (err) => resolve({ success: false, error: err.message }));
  });
}

async function downloadRepoZip(pythonCmd: string, env: Record<string, string>, emit: (step: number, detail: string) => void): Promise<{ success: boolean; error?: string }> {
  ensureDir(dirname(HERMES_REPO));
  const tmpRoot = join(HERMES_HOME, ".install-tmp");
  const zipPath = join(tmpRoot, "hermes-agent.zip");
  const extractDir = join(tmpRoot, "repo");
  removeDir(tmpRoot);
  ensureDir(tmpRoot);

  emit(2, "未检测到 Git，正在下载 Hermes Agent 压缩包...");
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

  emit(2, "仓库压缩包下载完成，正在解压...");
  ensureDir(extractDir);
  const unzip = await runStep(pythonCmd, ["-m", "zipfile", "-e", zipPath, extractDir], tmpRoot, env, 120000);
  if (!unzip.success) {
    return { success: false, error: `仓库解压失败：${unzip.stderr.slice(-300)}` };
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

  removeDir(HERMES_REPO);
  renameSync(repoRoot, HERMES_REPO);
  removeDir(tmpRoot);
  emit(2, `仓库准备完成（${basename(HERMES_REPO)}）`);
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

    const pythonCmd = findPython();
    if (!pythonCmd) {
      const msg = getPythonMissingMessage();
      fail(resolve, msg);
      return;
    }

    const sysGit = findSystemGit();
    emit(1, `系统 Python 已就绪，${sysGit ? "Git 已就绪" : "将使用压缩包安装"}，开始安装 Hermes Agent...`);

    ensureDir(dirname(HERMES_REPO));

    (async () => {
      const cloneExist = existsSync(join(HERMES_REPO, ".git"));
      if (cloneExist && sysGit) {
        emit(2, `正在更新已有 Hermes Agent 仓库...`);
        const pullR = await runStep(sysGit, ["pull", "--ff-only", HERMES_REPO_URL, "main"], HERMES_REPO, installEnv, 120000);
        if (!pullR.success) {
          emit(2, `仓库已存在但更新失败，将重新克隆...`);
          removeDir(HERMES_REPO);
        } else {
          emit(2, `仓库已更新到最新版本`);
        }
      } else if (existsSync(HERMES_REPO) && !cloneExist) {
        emit(2, `检测到已有 Agent 目录，将重新准备...`);
        removeDir(HERMES_REPO);
      }

      if (!existsSync(join(HERMES_REPO, ".git"))) {
        if (sysGit) {
          emit(2, `正在从 Gitee 克隆仓库到 ${HERMES_REPO} ...`);
          const cloneR = await runStep(sysGit, ["clone", HERMES_REPO_URL, HERMES_REPO], dirname(HERMES_REPO), installEnv, 300000);
          if (!cloneR.success) {
            emit(2, `Git 克隆失败，尝试压缩包安装...`);
            const zipR = await downloadRepoZip(pythonCmd, installEnv, emit);
            if (!zipR.success) {
              fail(resolve, zipR.error || `仓库准备失败：${cloneR.stderr.slice(-300)}`);
              return;
            }
          } else {
            emit(2, `仓库克隆成功`);
          }
        } else {
          const zipR = await downloadRepoZip(pythonCmd, installEnv, emit);
          if (!zipR.success) {
            fail(resolve, zipR.error || "仓库准备失败");
            return;
          }
        }
      }

      emit(3, `正在检查 Python 虚拟环境...`);
      let venvReady = false;
      if (existsSync(HERMES_VENV)) {
        const existingPip = await runStep(HERMES_PYTHON, ["-m", "pip", "--version"], HERMES_REPO, installEnv, 10000);
        if (existingPip.success) {
          venvReady = true;
          emit(3, `检测到可用虚拟环境，将复用本地依赖缓存`);
        } else {
          emit(3, `虚拟环境不可用，将重新创建...`);
          removeDir(HERMES_VENV);
        }
      }
      if (!venvReady) {
        const venvR = await runStep(pythonCmd, ["-m", "venv", HERMES_VENV], dirname(HERMES_REPO), installEnv, 120000);
        if (!venvR.success) {
          fail(resolve, `虚拟环境创建失败：${venvR.stderr.slice(-300)}`);
          return;
        }
        emit(3, `虚拟环境创建成功`);
      }

      emit(4, `正在安装 Python 依赖（优先使用国内 PyPI 镜像与本地缓存）...`);
      const hasPip = await runStep(HERMES_PYTHON, ["-m", "pip", "--version"], HERMES_REPO, installEnv, 10000);
      if (!hasPip.success) {
        emit(4, `pip 未随虚拟环境安装，正在通过 ensurepip 安装...`);
        const ensureR = await runStep(HERMES_PYTHON, ["-m", "ensurepip", "--upgrade"], HERMES_REPO, installEnv, 60000);
        if (!ensureR.success) {
          fail(resolve, `pip 安装失败：${ensureR.stderr.slice(-300)}。请确保系统 Python 安装了 ensurepip 模块。`);
          return;
        }
      }

      const installR = await runStep(HERMES_PYTHON, getPipInstallArgs(true), HERMES_REPO, installEnv, 600000);
      if (!installR.success) {
        const stderrTail = installR.stderr.slice(-500);
        emit(4, `国内 PyPI 镜像安装失败，尝试官方 PyPI...`);
        const officialR = await runStep(HERMES_PYTHON, getPipInstallArgs(false), HERMES_REPO, installEnv, 600000);
        if (!officialR.success) {
          fail(resolve, `依赖安装失败：${officialR.stderr.slice(-500) || stderrTail}`);
          return;
        }
        emit(4, `依赖安装成功（官方 PyPI）`);
      } else {
        emit(4, `依赖安装成功（清华镜像）`);
      }

      ensureDesktopManagedHermesFiles();
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
          resolve(stdout.toString().trim());
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
