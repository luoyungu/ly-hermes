import { existsSync, mkdirSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { HERMES_HOME } from "./config";

const STAGING_ROOT = join(HERMES_HOME, "desktop-staging");

function sanitizeSegment(value: string, fallback: string): string {
  const cleaned = value
    .replace(/[\x00-\x1F<>:"/\\|?*]/g, "")
    .replace(/\s+/g, "_")
    .replace(/\.{2,}/g, ".")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") return fallback;
  return cleaned.slice(0, 200);
}

function uniquePath(dir: string, filename: string): string {
  const base = sanitizeSegment(filename, "file");
  let candidate = join(dir, base);
  if (!existsSync(candidate)) return candidate;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  for (let i = 1; i < 1000; i++) {
    candidate = join(dir, `${stem}_${i}${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
  return join(dir, `${stem}_${Date.now()}${ext}`);
}

export function stageAttachment(
  sessionId: string,
  filename: string,
  base64Bytes: string,
): string {
  const sessionSegment = sanitizeSegment(sessionId || "default", "default");
  const dir = join(STAGING_ROOT, sessionSegment);
  mkdirSync(dir, { recursive: true });
  const target = uniquePath(dir, filename);
  writeFileSync(target, Buffer.from(base64Bytes, "base64"));
  return target;
}

export function clearStagedAttachments(sessionId: string): void {
  if (!sessionId) return;
  const sessionSegment = sanitizeSegment(sessionId, "");
  if (!sessionSegment) return;
  const dir = join(STAGING_ROOT, sessionSegment);
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}
