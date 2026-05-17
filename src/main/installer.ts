import { spawn, execFile, execFileSync } from "child_process";
import {
  existsSync,
  readFileSync,
  mkdirSync,
} from "fs";
import { join, delimiter, dirname } from "path";
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
  "克隆仓库",
  "创建虚拟环境",
  "安装依赖",
  "完成安装",
];

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
      { env, timeout: 15000 },
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
    try {
      const out = execFileSync(cmd, ["--version"], {
        encoding: "utf-8",
        timeout: 5000,
        env: Object.assign({}, process.env, { PATH: getEnhancedPath() }),
      }).trim();
      const m = out.match(/Python\s+(\d+)\.(\d+)/);
      if (m) {
        const major = parseInt(m[1], 10);
        const minor = parseInt(m[2], 10);
        if (major === 3 && minor >= 11) return cmd;
      }
    } catch {
      /* try next */
    }
  }
  return null;
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
  }) as Record<string, string>;

  return new Promise((resolve) => {
    emit(1, "正在检查系统环境...");

    const sysPython = findSystemPython();
    if (!sysPython) {
      const msg = process.platform === "win32"
        ? "未找到 Python 3.11+，请到 https://www.python.org/downloads/ 下载安装"
        : "未找到 Python 3.11+，请先安装 Python（brew install python / apt install python3）";
      fail(resolve, msg);
      return;
    }

    const sysGit = findSystemGit();
    if (!sysGit) {
      const msg = process.platform === "win32"
        ? "未找到 Git，请到 https://git-scm.com/download/win 下载安装"
        : "未找到 Git，请先安装 Git";
      fail(resolve, msg);
      return;
    }

    emit(1, `Python 已就绪，Git 已就绪，开始安装 Hermes Agent...`);

    ensureDir(dirname(HERMES_REPO));

    (async () => {
      emit(2, `正在从 Gitee 克隆仓库到 ${HERMES_REPO} ...`);

      const cloneExist = existsSync(join(HERMES_REPO, ".git"));
      if (cloneExist) {
        const pullR = await runStep(sysGit, ["pull", "--ff-only", "origin", "main"], HERMES_REPO, installEnv, 120000);
        if (!pullR.success) {
          emit(2, `仓库已存在但更新失败，将重新克隆...`);
          try {
            if (process.platform === "win32") {
              execFileSync("cmd", ["/c", "rd", "/s", "/q", HERMES_REPO], { timeout: 10000, env: installEnv });
            } else {
              execFileSync("rm", ["-rf", HERMES_REPO], { timeout: 10000, env: installEnv });
            }
          } catch { /* ignore */ }
        } else {
          emit(2, `仓库已更新到最新版本`);
        }
      }

      if (!existsSync(join(HERMES_REPO, ".git"))) {
        const cloneR = await runStep(sysGit, ["clone", HERMES_REPO_URL, HERMES_REPO], dirname(HERMES_REPO), installEnv, 300000);
        if (!cloneR.success) {
          fail(resolve, `仓库克隆失败：${cloneR.stderr.slice(-300) || "网络错误，请检查是否能访问 gitee.com"}`);
          return;
        }
        emit(2, `仓库克隆成功`);
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
      const venvR = await runStep(sysPython, ["-m", "venv", HERMES_VENV], dirname(HERMES_REPO), installEnv, 120000);
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
        if (stderrTail.includes("No matching distribution found") || stderrTail.includes("Could not find")) {
          emit(4, `pip install -e . 失败，尝试使用国内 PyPI 镜像...`);
          const mirrorArgs = ["-m", "pip", "install", "-e", ".", "-i", "https://pypi.tuna.tsinghua.edu.cn/simple"];
          const mirrorR = await runStep(HERMES_PYTHON, mirrorArgs, HERMES_REPO, installEnv, 600000);
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
      { env, timeout: 15000 },
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
