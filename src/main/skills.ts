import { existsSync, readdirSync, readFileSync, statSync, rmSync } from "fs";
import { join } from "path";
import { HERMES_HOME, loadAppConfig, getProfilePath, runHermesCli } from "./config";

export interface InstalledSkill {
  name: string;
  category: string;
  description: string;
  path: string;
}

export interface BundledSkill {
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
}

function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
} {
  const result = { name: "", description: "" };

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
} {
  const skillFile = join(entryPath, "SKILL.md");
  if (!existsSync(skillFile)) return { name: entryName, description: "" };
  try {
    const content = readFileSync(skillFile, "utf-8").slice(0, 4000);
    const meta = parseSkillFrontmatter(content);
    return { name: meta.name || entryName, description: meta.description || "" };
  } catch {
    return { name: entryName, description: "" };
  }
}

function scanSkillsDir(skillsDir: string): InstalledSkill[] {
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
      skills.push({
        name: meta.name,
        category: "general",
        description: meta.description,
        path: topPath,
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
      skills.push({
        name: meta.name,
        category: topEntry,
        description: meta.description,
        path: subPath,
      });
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
  console.log("[skills] listInstalledSkills profile:", profile, "dir:", skillsDir);
  const result = scanSkillsDir(skillsDir);
  console.log("[skills] listInstalledSkills found:", result.length, "skills");
  return result;
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
  console.log("[skills] listBundledSkills repo:", repoDir, "dir:", bundledDir);

  if (!existsSync(bundledDir)) {
    console.log("[skills] bundled dir not found, returning empty");
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
      skills.push({
        name: skillName,
        description: meta.description,
        category: "general",
        source: "bundled",
        installed: installedNames.has(skillName.toLowerCase()),
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
        name: skillName,
        description: meta.description,
        category: topEntry,
        source: "bundled",
        installed: installedNames.has(skillName.toLowerCase()),
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
        skills.push({
          name: skillName,
          description: meta.description,
          category: "optional",
          source: "optional",
          installed: installedNames.has(skillName.toLowerCase()),
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
        skills.push({
          name: skillName,
          description: meta.description,
          category: `optional/${optEntry}`,
          source: "optional",
          installed: installedNames.has(skillName.toLowerCase()),
        });
      }
    }
  }

  console.log("[skills] listBundledSkills found:", skills.length, "skills");
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
    return { success: true };
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
