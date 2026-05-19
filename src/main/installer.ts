import { spawn, execFile, execFileSync } from "child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
  createWriteStream,
  readdirSync,
  renameSync,
  rmSync,
} from "fs";
import { app } from "electron";
import { get } from "https";
import { get as httpGet } from "http";
import { join, delimiter, dirname, basename } from "path";
import { homedir } from "os";

import { HERMES_HOME } from "./config";

const HERMES_REPO = join(HERMES_HOME, "hermes-agent");
const HERMES_VENV = join(HERMES_REPO, "venv");
const HERMES_PYTHON =
  process.platform === "win32"
    ? join(HERMES_VENV, "Scripts", "python.exe")
    : join(HERMES_VENV, "bin", "python");
const HERMES_SCRIPT = join(HERMES_REPO, "hermes");
const HERMES_ENV_FILE = join(HERMES_HOME, ".env");

const HERMES_REPO_URL = "https://gitee.com/YanPro/ly-hermes-agent";
const HERMES_REPO_ZIP_URL = `${HERMES_REPO_URL}/repository/archive/main.zip`;

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
  "检查前置依赖",
  "准备 Agent",
  "创建虚拟环境",
  "安装依赖",
  "完成安装",
];

function getRuntimePlatformDir(): string {
  const arch = process.arch === "arm64" ? "arm64" : "x64";
  if (process.platform === "win32") return `win-${arch}`;
  if (process.platform === "darwin") return `darwin-${arch}`;
  return `linux-${arch}`;
}

function getBundledRuntimeRoots(): string[] {
  const platformDir = getRuntimePlatformDir();
  const appPath = app?.getAppPath?.() || process.cwd();
  const roots = [
    join(process.resourcesPath || "", "runtime", "python", platformDir),
    join(appPath, "runtime", "python", platformDir),
    join(appPath, "..", "runtime", "python", platformDir),
    join(process.cwd(), "build", "runtime", "python", platformDir),
  ];
  return roots.filter(Boolean);
}

function getPythonExecutable(root: string): string {
  if (process.platform === "win32") return join(root, "python.exe");
  return join(root, "bin", "python3");
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

function findBundledPython(): string | null {
  for (const root of getBundledRuntimeRoots()) {
    const python = getPythonExecutable(root);
    if (!existsSync(python)) continue;
    const version = getPythonVersion(python);
    if (version.ok) return python;
  }
  return null;
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
  return findBundledPython() || findSystemPython();
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

  emit(2, "仓库压缩包下载完成，正在解压...");
  ensureDir(extractDir);
  const unzip = await runStep(pythonCmd, ["-m", "zipfile", "-e", zipPath, extractDir], tmpRoot, env, 120000);
  if (!unzip.success) {
    return { success: false, error: `仓库解压失败：${unzip.stderr.slice(-300)}` };
  }

  const entries = readdirSync(extractDir, { withFileTypes: true }).filter(e => e.isDirectory());
  const repoRoot = entries.length === 1 ? join(extractDir, entries[0].name) : extractDir;
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
  }) as Record<string, string>;

  return new Promise((resolve) => {
    emit(1, "正在检查系统环境...");

    const pythonCmd = findPython();
    if (!pythonCmd) {
      const msg = `未找到可用 Python 3.11+。正式安装包请内置运行时到 runtime/python/${getRuntimePlatformDir()}；开发环境可临时安装系统 Python。`;
      fail(resolve, msg);
      return;
    }

    const sysGit = findSystemGit();
    emit(1, `${pythonCmd === findBundledPython() ? "内置" : "系统"} Python 已就绪，${sysGit ? "Git 已就绪" : "将使用压缩包安装"}，开始安装 Hermes Agent...`);

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

      emit(3, `正在创建 Python 虚拟环境...`);
      if (existsSync(HERMES_VENV)) {
        emit(3, `虚拟环境已存在，将重新创建...`);
        try {
          if (process.platform === "win32") {
            execFileSync("cmd", ["/c", "rd", "/s", "/q", HERMES_VENV], { timeout: 10000, env: installEnv });
          } else {
            execFileSync("rm", ["-rf", HERMES_VENV], { timeout: 10000, env: installEnv });
          }
        } catch { /* ignore */ }
      }
      const venvR = await runStep(pythonCmd, ["-m", "venv", HERMES_VENV], dirname(HERMES_REPO), installEnv, 120000);
      if (!venvR.success) {
        fail(resolve, `虚拟环境创建失败：${venvR.stderr.slice(-300)}`);
        return;
      }
      emit(3, `虚拟环境创建成功`);

      emit(4, `正在安装 Python 依赖（首次可能需要几分钟）...`);
      const hasPip = await runStep(HERMES_PYTHON, ["-m", "pip", "--version"], HERMES_REPO, installEnv, 10000);
      if (!hasPip.success) {
        emit(4, `pip 未随虚拟环境安装，正在通过 ensurepip 安装...`);
        const ensureR = await runStep(HERMES_PYTHON, ["-m", "ensurepip", "--upgrade"], HERMES_REPO, installEnv, 60000);
        if (!ensureR.success) {
          fail(resolve, `pip 安装失败：${ensureR.stderr.slice(-300)}。请确保系统 Python 安装了 ensurepip 模块。`);
          return;
        }
      }
      const pipArgs = ["-m", "pip", "install", "--upgrade", "pip"];
      await runStep(HERMES_PYTHON, pipArgs, HERMES_REPO, installEnv, 120000);

      const installArgs = ["-m", "pip", "install", "-e", "."];
      const installR = await runStep(HERMES_PYTHON, installArgs, HERMES_REPO, installEnv, 600000);
      if (!installR.success) {
        const stderrTail = installR.stderr.slice(-500);
        emit(4, `pip install -e . 失败，尝试使用国内 PyPI 镜像...`);
        const mirrorArgs = [
          "-m",
          "pip",
          "install",
          "-e",
          ".",
          "-i",
          "https://pypi.tuna.tsinghua.edu.cn/simple",
          "--trusted-host",
          "pypi.tuna.tsinghua.edu.cn",
        ];
        const mirrorR = await runStep(HERMES_PYTHON, mirrorArgs, HERMES_REPO, installEnv, 600000);
        if (!mirrorR.success) {
          fail(resolve, `依赖安装失败：${mirrorR.stderr.slice(-500) || stderrTail}`);
          return;
        }
        emit(4, `依赖安装成功（清华镜像）`);
      } else {
        emit(4, `依赖安装成功`);
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
