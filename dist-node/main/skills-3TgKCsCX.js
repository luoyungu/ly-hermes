"use strict";
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
const fs = require("fs");
const path = require("path");
const index = require("./index.js");
function parseSkillFrontmatter(content) {
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
    /^\s*description:\s*["']?([^"'\n]+)["']?\s*$/m
  );
  if (descMatch) result.description = descMatch[1].trim();
  return result;
}
function safeStat(p) {
  try {
    const s = fs.statSync(p);
    return { isDir: s.isDirectory(), isFile: s.isFile() };
  } catch {
    return { isDir: false, isFile: false };
  }
}
function readSkillMeta(entryPath, entryName) {
  const skillFile = path.join(entryPath, "SKILL.md");
  if (!fs.existsSync(skillFile)) return { name: entryName, description: "" };
  try {
    const content = fs.readFileSync(skillFile, "utf-8").slice(0, 4e3);
    const meta = parseSkillFrontmatter(content);
    return { name: meta.name || entryName, description: meta.description || "" };
  } catch {
    return { name: entryName, description: "" };
  }
}
function scanSkillsDir(skillsDir) {
  const skills = [];
  if (!fs.existsSync(skillsDir)) return skills;
  let topEntries;
  try {
    topEntries = fs.readdirSync(skillsDir);
  } catch (err) {
    console.error("[skills] Failed to read skills dir:", skillsDir, err);
    return skills;
  }
  for (const topEntry of topEntries) {
    if (topEntry.startsWith(".")) continue;
    const topPath = path.join(skillsDir, topEntry);
    const topStat = safeStat(topPath);
    if (!topStat.isDir) continue;
    const skillFile = path.join(topPath, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      const meta = readSkillMeta(topPath, topEntry);
      skills.push({
        name: meta.name,
        category: "general",
        description: meta.description,
        path: topPath
      });
      continue;
    }
    let subEntries;
    try {
      subEntries = fs.readdirSync(topPath);
    } catch {
      continue;
    }
    for (const subEntry of subEntries) {
      if (subEntry.startsWith(".")) continue;
      if (subEntry === "DESCRIPTION.md") continue;
      const subPath = path.join(topPath, subEntry);
      const subStat = safeStat(subPath);
      if (!subStat.isDir) continue;
      const subSkillFile = path.join(subPath, "SKILL.md");
      if (!fs.existsSync(subSkillFile)) continue;
      const meta = readSkillMeta(subPath, subEntry);
      skills.push({
        name: meta.name,
        category: topEntry,
        description: meta.description,
        path: subPath
      });
    }
  }
  return skills.sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );
}
function listInstalledSkills(profile) {
  const profilePath = index.getProfilePath(profile || "default");
  const skillsDir = path.join(profilePath, "skills");
  console.log("[skills] listInstalledSkills profile:", profile, "dir:", skillsDir);
  const result = scanSkillsDir(skillsDir);
  console.log("[skills] listInstalledSkills found:", result.length, "skills");
  return result;
}
function getSkillContent(skillPath) {
  const skillFile = path.join(skillPath, "SKILL.md");
  if (!fs.existsSync(skillFile)) return "";
  try {
    return fs.readFileSync(skillFile, "utf-8");
  } catch {
    return "";
  }
}
function findHermesRepoDir() {
  const appConfig = index.loadAppConfig();
  const hermesConfig = appConfig.hermes || {};
  if (hermesConfig.repo && typeof hermesConfig.repo === "string") {
    return hermesConfig.repo;
  }
  const candidates = [
    path.join(index.HERMES_HOME, "hermes-agent"),
    path.join(index.HERMES_HOME, "hermes-office")
  ];
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, "skills"))) return c;
  }
  return index.HERMES_HOME;
}
function listBundledSkills(profile) {
  const repoDir = findHermesRepoDir();
  const bundledDir = path.join(repoDir, "skills");
  console.log("[skills] listBundledSkills repo:", repoDir, "dir:", bundledDir);
  if (!fs.existsSync(bundledDir)) {
    console.log("[skills] bundled dir not found, returning empty");
    return [];
  }
  const installedSkills = listInstalledSkills(profile);
  const installedNames = new Set(installedSkills.map((s) => s.name.toLowerCase()));
  const skills = [];
  let topEntries;
  try {
    topEntries = fs.readdirSync(bundledDir);
  } catch (err) {
    console.error("[skills] Failed to read bundled dir:", bundledDir, err);
    return skills;
  }
  for (const topEntry of topEntries) {
    if (topEntry.startsWith(".")) continue;
    const topPath = path.join(bundledDir, topEntry);
    const topStat = safeStat(topPath);
    if (!topStat.isDir) continue;
    const skillFile = path.join(topPath, "SKILL.md");
    if (fs.existsSync(skillFile)) {
      const meta = readSkillMeta(topPath, topEntry);
      const skillName = meta.name;
      skills.push({
        name: skillName,
        description: meta.description,
        category: "general",
        source: "bundled",
        installed: installedNames.has(skillName.toLowerCase())
      });
      continue;
    }
    let subEntries;
    try {
      subEntries = fs.readdirSync(topPath);
    } catch {
      continue;
    }
    for (const subEntry of subEntries) {
      if (subEntry.startsWith(".")) continue;
      if (subEntry === "DESCRIPTION.md") continue;
      const subPath = path.join(topPath, subEntry);
      const subStat = safeStat(subPath);
      if (!subStat.isDir) continue;
      const subSkillFile = path.join(subPath, "SKILL.md");
      if (!fs.existsSync(subSkillFile)) continue;
      const meta = readSkillMeta(subPath, subEntry);
      const skillName = meta.name;
      skills.push({
        name: skillName,
        description: meta.description,
        category: topEntry,
        source: "bundled",
        installed: installedNames.has(skillName.toLowerCase())
      });
    }
  }
  const optionalDir = path.join(repoDir, "optional-skills");
  if (fs.existsSync(optionalDir)) {
    let optEntries;
    try {
      optEntries = fs.readdirSync(optionalDir);
    } catch {
      optEntries = [];
    }
    for (const optEntry of optEntries) {
      if (optEntry.startsWith(".")) continue;
      const optPath = path.join(optionalDir, optEntry);
      const optStat = safeStat(optPath);
      if (!optStat.isDir) continue;
      const skillFile = path.join(optPath, "SKILL.md");
      if (fs.existsSync(skillFile)) {
        const meta = readSkillMeta(optPath, optEntry);
        const skillName = meta.name;
        skills.push({
          name: skillName,
          description: meta.description,
          category: "optional",
          source: "optional",
          installed: installedNames.has(skillName.toLowerCase())
        });
        continue;
      }
      let subEntries;
      try {
        subEntries = fs.readdirSync(optPath);
      } catch {
        continue;
      }
      for (const subEntry of subEntries) {
        if (subEntry.startsWith(".")) continue;
        if (subEntry === "DESCRIPTION.md") continue;
        const subPath = path.join(optPath, subEntry);
        const subStat = safeStat(subPath);
        if (!subStat.isDir) continue;
        const subSkillFile = path.join(subPath, "SKILL.md");
        if (!fs.existsSync(subSkillFile)) continue;
        const meta = readSkillMeta(subPath, subEntry);
        const skillName = meta.name;
        skills.push({
          name: skillName,
          description: meta.description,
          category: `optional/${optEntry}`,
          source: "optional",
          installed: installedNames.has(skillName.toLowerCase())
        });
      }
    }
  }
  console.log("[skills] listBundledSkills found:", skills.length, "skills");
  return skills.sort(
    (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)
  );
}
function installSkill(identifier, profile) {
  try {
    const args = ["skills", "install", identifier, "--yes"];
    const output = index.runHermesCli(args, profile || "default");
    if (output.includes("Error") || output.includes("error")) {
      return { success: false, error: output };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
function uninstallSkill(name, profile) {
  try {
    const skillsDir = path.join(index.getProfilePath(profile || "default"), "skills");
    if (fs.existsSync(skillsDir)) {
      const categories = fs.readdirSync(skillsDir);
      for (const category of categories) {
        if (category.startsWith(".")) continue;
        const catPath = path.join(skillsDir, category);
        if (!safeStat(catPath).isDir) continue;
        const skillDir = path.join(catPath, name);
        if (fs.existsSync(skillDir) && safeStat(skillDir).isDir) {
          fs.rmSync(skillDir, { recursive: true, force: true });
          return { success: true };
        }
      }
      const directDir = path.join(skillsDir, name);
      if (fs.existsSync(directDir) && safeStat(directDir).isDir) {
        fs.rmSync(directDir, { recursive: true, force: true });
        return { success: true };
      }
    }
    try {
      const output = index.runHermesCli(["skills", "uninstall", name], profile || "default");
      if (output.includes("Error") || output.includes("error")) {
        return { success: false, error: output };
      }
      return { success: true };
    } catch {
      return { success: false, error: "未找到技能 " + name };
    }
  } catch (err) {
    return { success: false, error: err.message };
  }
}
exports.getSkillContent = getSkillContent;
exports.installSkill = installSkill;
exports.listBundledSkills = listBundledSkills;
exports.listInstalledSkills = listInstalledSkills;
exports.uninstallSkill = uninstallSkill;
