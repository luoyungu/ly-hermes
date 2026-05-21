import { existsSync, readdirSync, readFileSync, statSync, rmSync } from "fs";
import { join } from "path";
import { HERMES_HOME, loadAppConfig, getProfilePath, runHermesCli } from "./config";
import * as yaml from "./lib/yaml-simple";
import { safeWriteFile, yamlStringify } from "./utils";
import { loadDbSkillConfig, saveDbSkillConfig } from "./db";

export interface InstalledSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  path: string;
  type: "prompt" | "tool" | "workflow";
  enabled: boolean;
  source: "official" | "custom";
  version?: string;
  requiredTools?: string[];
  stats?: SkillUsageStats;
}

export interface BundledSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
  type: "prompt" | "tool" | "workflow";
  version?: string;
  requiredTools?: string[];
}

export interface SkillUsageStats {
  uses: number;
  successes: number;
  failures: number;
  xp: number;
  lastUsedAt: number | null;
}

interface SkillConfig {
  enabled: Record<string, boolean>;
  stats: Record<string, SkillUsageStats>;
  updatedAt?: number;
}

interface SkillMeta {
  name: string;
  description: string;
  type: "prompt" | "tool" | "workflow";
  version?: string;
  requiredTools?: string[];
}

const DEFAULT_SKILL_STATS: SkillUsageStats = {
  uses: 0,
  successes: 0,
  failures: 0,
  xp: 0,
  lastUsedAt: null,
};

function loadSkillConfig(profile?: string): SkillConfig {
  const config = loadDbSkillConfig(profile);
  return {
    enabled: config.enabled,
    stats: config.stats as Record<string, SkillUsageStats>,
    updatedAt: config.updatedAt,
  };
}

function saveSkillConfig(profile: string | undefined, config: SkillConfig): void {
  saveDbSkillConfig(profile, config);
}

function getProfileConfigPath(profile?: string): string {
  return join(getProfilePath(profile || "default"), "config.yaml");
}

function readDisabledSkillNames(profile?: string): Set<string> {
  const configPath = getProfileConfigPath(profile);
  if (!existsSync(configPath)) return new Set();
  try {
    const cfg = yaml.parse(readFileSync(configPath, "utf-8"));
    const skillsCfg = cfg.skills as Record<string, unknown> | undefined;
    const disabled = skillsCfg?.disabled;
    if (Array.isArray(disabled)) {
      return new Set(disabled.map((v) => String(v).trim()).filter(Boolean));
    }
    if (typeof disabled === "string" && disabled.trim()) {
      return new Set([disabled.trim()]);
    }
  } catch {
    /* fall through */
  }
  return new Set();
}

function saveDisabledSkillNames(profile: string | undefined, disabledNames: Set<string>): void {
  const configPath = getProfileConfigPath(profile);
  let cfg: Record<string, unknown> = {};
  try {
    if (existsSync(configPath)) {
      cfg = yaml.parse(readFileSync(configPath, "utf-8"));
    }
  } catch {
    cfg = {};
  }
  if (!cfg.skills || typeof cfg.skills !== "object") {
    cfg.skills = {};
  }
  (cfg.skills as Record<string, unknown>).disabled = Array.from(disabledNames).sort();
  safeWriteFile(configPath, yamlStringify(cfg));
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "skill";
}

function getSkillId(category: string, name: string): string {
  return `${slugify(category || "general")}/${slugify(name)}`;
}

function parseListValue(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed
      .slice(1, -1)
      .split(",")
      .map((v) => v.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
  }
  return trimmed
    .split(",")
    .map((v) => v.trim().replace(/^["']|["']$/g, ""))
    .filter(Boolean);
}

function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
  type?: "prompt" | "tool" | "workflow";
  version?: string;
  requiredTools?: string[];
} {
  const result: {
    name: string;
    description: string;
    type?: "prompt" | "tool" | "workflow";
    version?: string;
    requiredTools?: string[];
  } = { name: "", description: "" };

  if (!content.startsWith("---")) {
    const headingMatch = content.match(/^#\s+(.+)/m);
    if (headingMatch) result.name = headingMatch[1].trim();
    const paraMatch = content.match(/^(?!#)(?!---).+/m);
    if (paraMatch) result.description = paraMatch[0].trim().slice(0, 120);
    return result;
  }

  const endIdx = content.indexOf("---", 3);
  if (endIdx === -1) return result;

  const frontmatter = content.slice(3, endIdx);

  const nameMatch = frontmatter.match(/^\s*name:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (nameMatch) result.name = nameMatch[1].trim();

  const descMatch = frontmatter.match(
    /^\s*description:\s*["']?([^"'\n]+)["']?\s*$/m,
  );
  if (descMatch) result.description = descMatch[1].trim();

  const typeMatch = frontmatter.match(/^\s*type:\s*["']?([^"'\n]+)["']?\s*$/m);
  const typeValue = typeMatch ? typeMatch[1].trim() : "";
  if (typeValue === "tool" || typeValue === "workflow" || typeValue === "prompt") {
    result.type = typeValue;
  }

  const versionMatch = frontmatter.match(/^\s*version:\s*["']?([^"'\n]+)["']?\s*$/m);
  if (versionMatch) result.version = versionMatch[1].trim();

  const toolsMatch = frontmatter.match(/^\s*(requiredTools|required_tools):\s*(.+)\s*$/m);
  if (toolsMatch) result.requiredTools = parseListValue(toolsMatch[2]);

  return result;
}

function safeStat(p: string): { isDir: boolean; isFile: boolean } {
  try {
    const s = statSync(p);
    return { isDir: s.isDirectory(), isFile: s.isFile() };
  } catch {
    return { isDir: false, isFile: false };
  }
}

function readSkillMeta(entryPath: string, entryName: string): {
  name: string;
  description: string;
  type: "prompt" | "tool" | "workflow";
  version?: string;
  requiredTools?: string[];
} {
  const skillFile = join(entryPath, "SKILL.md");
  if (!existsSync(skillFile)) return { name: entryName, description: "", type: "prompt" };
  try {
    const content = readFileSync(skillFile, "utf-8").slice(0, 4000);
    const meta = parseSkillFrontmatter(content);
    return {
      name: meta.name || entryName,
      description: meta.description || "",
      type: meta.type || "prompt",
      version: meta.version,
      requiredTools: meta.requiredTools,
    };
  } catch {
    return { name: entryName, description: "", type: "prompt" };
  }
}

function buildInstalledSkill(
  meta: SkillMeta,
  category: string,
  path: string,
  profile?: string,
): InstalledSkill {
  const id = getSkillId(category, meta.name);
  const config = loadSkillConfig(profile);
  const disabledNames = readDisabledSkillNames(profile);
  const enabled = config.enabled[id] !== false && !disabledNames.has(meta.name);
  return {
    id,
    name: meta.name,
    category,
    description: meta.description,
    path,
    type: meta.type,
    enabled,
    source: "official",
    version: meta.version,
    requiredTools: meta.requiredTools,
    stats: config.stats[id] || { ...DEFAULT_SKILL_STATS },
  };
}

function scanSkillsDir(skillsDir: string, profile?: string): InstalledSkill[] {
  const skills: InstalledSkill[] = [];
  if (!existsSync(skillsDir)) return skills;

  let topEntries: string[];
  try {
    topEntries = readdirSync(skillsDir);
  } catch (err) {
    console.error("[skills] Failed to read skills dir:", skillsDir, err);
    return skills;
  }

  for (const topEntry of topEntries) {
    if (topEntry.startsWith(".")) continue;
    const topPath = join(skillsDir, topEntry);
    const topStat = safeStat(topPath);
    if (!topStat.isDir) continue;

    const skillFile = join(topPath, "SKILL.md");
    if (existsSync(skillFile)) {
      const meta = readSkillMeta(topPath, topEntry);
      skills.push(buildInstalledSkill(meta, "general", topPath, profile));
      continue;
    }

    let subEntries: string[];
    try {
      subEntries = readdirSync(topPath);
    } catch {
      continue;
    }

    for (const subEntry of subEntries) {
      if (subEntry.startsWith(".")) continue;
      if (subEntry === "DESCRIPTION.md") continue;
      const subPath = join(topPath, subEntry);
      const subStat = safeStat(subPath);
      if (!subStat.isDir) continue;

      const subSkillFile = join(subPath, "SKILL.md");
      if (!existsSync(subSkillFile)) continue;

      const meta = readSkillMeta(subPath, subEntry);
      skills.push(buildInstalledSkill(meta, topEntry, subPath, profile));
    }
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export function listInstalledSkills(profile?: string): InstalledSkill[] {
  const profilePath = getProfilePath(profile || "default");
  const skillsDir = join(profilePath, "skills");
  return scanSkillsDir(skillsDir, profile);
}

export function getSkillContent(skillPath: string): string {
  const skillFile = join(skillPath, "SKILL.md");
  if (!existsSync(skillFile)) return "";
  try {
    return readFileSync(skillFile, "utf-8");
  } catch {
    return "";
  }
}

function findHermesRepoDir(): string {
  const appConfig = loadAppConfig();
  const hermesConfig = appConfig.hermes as Record<string, unknown> || {};
  if (hermesConfig.repo && typeof hermesConfig.repo === "string") {
    return hermesConfig.repo;
  }

  const candidates = [
    join(HERMES_HOME, "hermes-agent"),
    join(HERMES_HOME, "hermes-office"),
  ];
  for (const c of candidates) {
    if (existsSync(join(c, "skills"))) return c;
  }

  return HERMES_HOME;
}

export function listBundledSkills(profile?: string): BundledSkill[] {
  const repoDir = findHermesRepoDir();
  const bundledDir = join(repoDir, "skills");

  if (!existsSync(bundledDir)) {
    return [];
  }

  const installedSkills = listInstalledSkills(profile);
  const installedNames = new Set(installedSkills.map(s => s.name.toLowerCase()));

  const skills: BundledSkill[] = [];

  let topEntries: string[];
  try {
    topEntries = readdirSync(bundledDir);
  } catch (err) {
    console.error("[skills] Failed to read bundled dir:", bundledDir, err);
    return skills;
  }

  for (const topEntry of topEntries) {
    if (topEntry.startsWith(".")) continue;
    const topPath = join(bundledDir, topEntry);
    const topStat = safeStat(topPath);
    if (!topStat.isDir) continue;

    const skillFile = join(topPath, "SKILL.md");
    if (existsSync(skillFile)) {
      const meta = readSkillMeta(topPath, topEntry);
      const skillName = meta.name;
      const category = "general";
      skills.push({
        id: getSkillId(category, skillName),
        name: skillName,
        description: meta.description,
        category,
        source: "bundled",
        installed: installedNames.has(skillName.toLowerCase()),
        type: meta.type,
        version: meta.version,
        requiredTools: meta.requiredTools,
      });
      continue;
    }

    let subEntries: string[];
    try {
      subEntries = readdirSync(topPath);
    } catch {
      continue;
    }

    for (const subEntry of subEntries) {
      if (subEntry.startsWith(".")) continue;
      if (subEntry === "DESCRIPTION.md") continue;
      const subPath = join(topPath, subEntry);
      const subStat = safeStat(subPath);
      if (!subStat.isDir) continue;

      const subSkillFile = join(subPath, "SKILL.md");
      if (!existsSync(subSkillFile)) continue;

      const meta = readSkillMeta(subPath, subEntry);
      const skillName = meta.name;
      skills.push({
        id: getSkillId(topEntry, skillName),
        name: skillName,
        description: meta.description,
        category: topEntry,
        source: "bundled",
        installed: installedNames.has(skillName.toLowerCase()),
        type: meta.type,
        version: meta.version,
        requiredTools: meta.requiredTools,
      });
    }
  }

  const optionalDir = join(repoDir, "optional-skills");
  if (existsSync(optionalDir)) {
    let optEntries: string[];
    try {
      optEntries = readdirSync(optionalDir);
    } catch {
      optEntries = [];
    }

    for (const optEntry of optEntries) {
      if (optEntry.startsWith(".")) continue;
      const optPath = join(optionalDir, optEntry);
      const optStat = safeStat(optPath);
      if (!optStat.isDir) continue;

      const skillFile = join(optPath, "SKILL.md");
      if (existsSync(skillFile)) {
        const meta = readSkillMeta(optPath, optEntry);
        const skillName = meta.name;
        const category = "optional";
        skills.push({
          id: getSkillId(category, skillName),
          name: skillName,
          description: meta.description,
          category,
          source: "optional",
          installed: installedNames.has(skillName.toLowerCase()),
          type: meta.type,
          version: meta.version,
          requiredTools: meta.requiredTools,
        });
        continue;
      }

      let subEntries: string[];
      try {
        subEntries = readdirSync(optPath);
      } catch {
        continue;
      }

      for (const subEntry of subEntries) {
        if (subEntry.startsWith(".")) continue;
        if (subEntry === "DESCRIPTION.md") continue;
        const subPath = join(optPath, subEntry);
        const subStat = safeStat(subPath);
        if (!subStat.isDir) continue;

        const subSkillFile = join(subPath, "SKILL.md");
        if (!existsSync(subSkillFile)) continue;

        const meta = readSkillMeta(subPath, subEntry);
        const skillName = meta.name;
        const category = `optional/${optEntry}`;
        skills.push({
          id: getSkillId(category, skillName),
          name: skillName,
          description: meta.description,
          category,
          source: "optional",
          installed: installedNames.has(skillName.toLowerCase()),
          type: meta.type,
          version: meta.version,
          requiredTools: meta.requiredTools,
        });
      }
    }
  }

  return skills.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
  );
}

export function installSkill(
  identifier: string,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    const args = ["skills", "install", identifier, "--yes"];
    const output = runHermesCli(args, profile || "default");
    if (output.includes("Error") || output.includes("error")) {
      return { success: false, error: output };
    }
    const installed = listInstalledSkills(profile);
    const installedSkill = installed.find((s) => s.name.toLowerCase() === identifier.toLowerCase());
    if (installedSkill) {
      setSkillEnabled(installedSkill.id, true, profile);
    }
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export function getSkillConfig(profile?: string): SkillConfig {
  return loadSkillConfig(profile);
}

export function setSkillEnabled(
  skillId: string,
  enabled: boolean,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    if (!skillId || typeof skillId !== "string") {
      return { success: false, error: "无效的技能 ID" };
    }
    const skill = listInstalledSkills(profile).find((item) => item.id === skillId);
    if (!skill) {
      return { success: false, error: "技能不存在或未安装" };
    }
    const config = loadSkillConfig(profile);
    config.enabled[skillId] = enabled;
    saveSkillConfig(profile, config);
    const disabledNames = readDisabledSkillNames(profile);
    if (enabled) {
      disabledNames.delete(skill.name);
    } else {
      disabledNames.add(skill.name);
    }
    saveDisabledSkillNames(profile, disabledNames);
    return { success: true };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export function recordSkillUsage(
  skillId: string,
  success: boolean,
  profile?: string,
): { success: boolean; stats?: SkillUsageStats; error?: string } {
  try {
    if (!skillId || typeof skillId !== "string") {
      return { success: false, error: "无效的技能 ID" };
    }
    const config = loadSkillConfig(profile);
    const current = config.stats[skillId] || { ...DEFAULT_SKILL_STATS };
    const next: SkillUsageStats = {
      uses: current.uses + 1,
      successes: current.successes + (success ? 1 : 0),
      failures: current.failures + (success ? 0 : 1),
      xp: current.xp + (success ? 20 : 3),
      lastUsedAt: Date.now(),
    };
    config.stats[skillId] = next;
    saveSkillConfig(profile, config);
    return { success: true, stats: next };
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}

export function uninstallSkill(
  name: string,
  profile?: string,
): { success: boolean; error?: string } {
  try {
    const skillsDir = join(getProfilePath(profile || "default"), "skills");
    if (existsSync(skillsDir)) {
      const categories = readdirSync(skillsDir);
      for (const category of categories) {
        if (category.startsWith(".")) continue;
        const catPath = join(skillsDir, category);
        if (!safeStat(catPath).isDir) continue;

        const skillDir = join(catPath, name);
        if (existsSync(skillDir) && safeStat(skillDir).isDir) {
          rmSync(skillDir, { recursive: true, force: true });
          return { success: true };
        }
      }

      const directDir = join(skillsDir, name);
      if (existsSync(directDir) && safeStat(directDir).isDir) {
        rmSync(directDir, { recursive: true, force: true });
        return { success: true };
      }
    }

    try {
      const output = runHermesCli(["skills", "uninstall", name], profile || "default");
      if (output.includes("Error") || output.includes("error")) {
        return { success: false, error: output };
      }
      return { success: true };
    } catch {
      return { success: false, error: "未找到技能 " + name };
    }
  } catch (err: unknown) {
    return { success: false, error: (err as Error).message };
  }
}
