import {
  cpSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "fs";
import { execFileSync } from "child_process";
import { get as httpGet } from "http";
import { get as httpsGet } from "https";
import { dirname, join } from "path";
import { homedir } from "os";
import { HERMES_HOME } from "./config";

const HERMES_REPO = join(HERMES_HOME, "hermes-agent");
const HERMES_REPO_ZIP_URL = "http://120.26.42.178:88/main.zip";
const BUNDLED_SKILLS_CACHE_DIR = join(HERMES_HOME, ".bundled-skills-cache", "skills");

export const DEFAULT_DESKTOP_SKILLS = [
  "software-development/plan",
  "software-development/systematic-debugging",
  "software-development/writing-plans",
  "research/llm-wiki",
  "creative/creative-ideation",
  "productivity/ocr-and-documents",
];

function ensureDir(dir: string): void {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function removeDir(target: string): void {
  if (!existsSync(target)) return;
  rmSync(target, { recursive: true, force: true });
}

function hasBundledSkillsLayout(skillsDir: string): boolean {
  if (!existsSync(skillsDir)) return false;
  return DEFAULT_DESKTOP_SKILLS.some((skill) =>
    existsSync(join(skillsDir, skill, "SKILL.md")),
  );
}

export function findPipInstalledSkillsDir(pythonPath: string): string | null {
  if (!existsSync(pythonPath)) return null;
  const script = [
    "import pathlib, site",
    "roots = []",
    "for base in site.getsitepackages():",
    "    p = pathlib.Path(base)",
    "    roots.extend(p.glob('hermes_agent/skills'))",
    "    roots.extend(p.glob('hermes-agent/skills'))",
    "    roots.extend(p.glob('hermes/skills'))",
    "for root in roots:",
    "    if root.is_dir() and any(root.rglob('SKILL.md')):",
    "        print(root.resolve())",
    "        break",
  ].join("\n");
  try {
    const stdout = execFileSync(pythonPath, ["-c", script], {
      encoding: "utf-8",
      timeout: 15000,
      env: {
        ...process.env,
        HOME: homedir(),
        HERMES_HOME,
      },
    }).trim();
    const firstLine = stdout.split(/\r?\n/).find((line) => line.trim());
    return firstLine && existsSync(firstLine) ? firstLine : null;
  } catch {
    return null;
  }
}

export function resolveHermesBundledSkillsDir(pythonPath?: string): string | null {
  const candidates = [
    join(HERMES_REPO, "skills"),
    BUNDLED_SKILLS_CACHE_DIR,
    join(HERMES_HOME, "hermes-office", "skills"),
  ];
  for (const dir of candidates) {
    if (hasBundledSkillsLayout(dir)) return dir;
  }
  if (pythonPath) {
    const pipDir = findPipInstalledSkillsDir(pythonPath);
    if (pipDir && hasBundledSkillsLayout(pipDir)) return pipDir;
  }
  return null;
}

function downloadFile(url: string, dest: string, timeoutMs: number): Promise<{ success: boolean; error?: string }> {
  return new Promise((resolve) => {
    ensureDir(dirname(dest));
    const file = createWriteStream(dest);
    const getter = url.startsWith("https:") ? httpsGet : httpGet;
    const req = getter(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        removeDir(dest);
        downloadFile(res.headers.location, dest, timeoutMs).then(resolve);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        removeDir(dest);
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
        return;
      }
      res.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve({ success: true });
      });
    });
    req.on("timeout", () => {
      req.destroy();
      file.close();
      resolve({ success: false, error: "下载超时" });
    });
    req.on("error", (err) => resolve({ success: false, error: err.message }));
  });
}

function findRepoRoot(extractDir: string): string | null {
  const entries = readdirSync(extractDir, { withFileTypes: true }).filter((entry) => entry.isDirectory());
  let repoRoot: string;
  if (entries.length === 1) {
    repoRoot = join(extractDir, entries[0].name);
  } else if (entries.length === 0) {
    repoRoot = extractDir;
  } else {
    const match = entries.find((entry) => /ly-hermes-agent/i.test(entry.name));
    repoRoot = match ? join(extractDir, match.name) : extractDir;
  }
  if (!existsSync(join(repoRoot, "skills"))) return null;
  return repoRoot;
}

export async function ensureHermesBundledSkillsSource(
  pythonCmd: string,
  emit?: (detail: string) => void,
): Promise<string | null> {
  const existing = resolveHermesBundledSkillsDir(pythonCmd);
  if (existing) return existing;

  emit?.("正在下载默认技能包（Gitee 备用源）...");
  const tmpRoot = join(HERMES_HOME, ".skills-cache-tmp");
  const zipPath = join(tmpRoot, "hermes-agent.zip");
  const extractDir = join(tmpRoot, "repo");
  removeDir(tmpRoot);
  ensureDir(tmpRoot);

  const download = await downloadFile(HERMES_REPO_ZIP_URL, zipPath, 300000);
  if (!download.success) {
    emit?.(`默认技能包下载失败：${download.error || "网络错误"}`);
    removeDir(tmpRoot);
    return null;
  }

  try {
    const header = readFileSync(zipPath).slice(0, 4);
    if (header[0] !== 0x50 || header[1] !== 0x4b) {
      emit?.("默认技能包 ZIP 校验失败");
      removeDir(tmpRoot);
      return null;
    }
  } catch {
    removeDir(tmpRoot);
    return null;
  }

  ensureDir(extractDir);
  try {
    execFileSync(pythonCmd, ["-m", "zipfile", "-e", zipPath, extractDir], {
      timeout: 120000,
      stdio: "pipe",
    });
  } catch {
    emit?.("默认技能包解压失败");
    removeDir(tmpRoot);
    return null;
  }

  const repoRoot = findRepoRoot(extractDir);
  if (!repoRoot) {
    emit?.("默认技能包目录结构不符合预期");
    removeDir(tmpRoot);
    return null;
  }

  removeDir(BUNDLED_SKILLS_CACHE_DIR);
  ensureDir(dirname(BUNDLED_SKILLS_CACHE_DIR));
  cpSync(join(repoRoot, "skills"), BUNDLED_SKILLS_CACHE_DIR, { recursive: true });
  removeDir(tmpRoot);
  emit?.("默认技能包已缓存");
  return hasBundledSkillsLayout(BUNDLED_SKILLS_CACHE_DIR) ? BUNDLED_SKILLS_CACHE_DIR : null;
}

export function copyDefaultDesktopSkills(
  sourceSkillsDir: string,
  targetSkillsDir: string,
): string[] {
  const warnings: string[] = [];
  ensureDir(targetSkillsDir);
  for (const skill of DEFAULT_DESKTOP_SKILLS) {
    try {
      const source = join(sourceSkillsDir, skill);
      const target = join(targetSkillsDir, skill);
      if (!existsSync(join(source, "SKILL.md"))) {
        warnings.push(`默认技能 ${skill} 在技能源中不存在，已跳过`);
        continue;
      }
      if (existsSync(join(target, "SKILL.md"))) continue;
      ensureDir(dirname(target));
      cpSync(source, target, { recursive: true, errorOnExist: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`默认技能 ${skill} 复制失败，已跳过：${message || "权限受限"}`);
    }
  }
  return warnings;
}

export function defaultDesktopSkillsInstalled(): boolean {
  const targetSkillsDir = join(HERMES_HOME, "skills");
  return DEFAULT_DESKTOP_SKILLS.every((skill) =>
    existsSync(join(targetSkillsDir, skill, "SKILL.md")),
  );
}

export async function installDefaultDesktopSkills(
  pythonCmd: string,
  emit?: (detail: string) => void,
): Promise<string[]> {
  if (defaultDesktopSkillsInstalled()) return [];

  const sourceDir =
    resolveHermesBundledSkillsDir(pythonCmd) ||
    (await ensureHermesBundledSkillsSource(pythonCmd, emit));
  if (!sourceDir) {
    return ["未能找到 Hermes 默认技能源，请在技能库中手动安装"];
  }
  return copyDefaultDesktopSkills(sourceDir, join(HERMES_HOME, "skills"));
}
