import fs from "fs";
import path from "path";
import os from "os";
import { ensureDir } from "./utils";

const APP_DATA_DIR = path.join(os.homedir(), ".lyhermes");
export const LOG_DIR = path.join(APP_DATA_DIR, "logs");
const LOG_FILE = path.join(LOG_DIR, "app.log");
const MAX_LOG_SIZE = 5 * 1024 * 1024;
const MAX_LOG_FILES = 5;

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  module: string;
  message: string;
  data?: unknown;
}

let _initialized = false;

function init(): void {
  if (_initialized) return;
  ensureDir(LOG_DIR);
  _initialized = true;
  rotateLogsIfNeeded();
}

function rotateLogsIfNeeded(): void {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const stats = fs.statSync(LOG_FILE);
    if (stats.size < MAX_LOG_SIZE) return;

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const rotatedFile = path.join(LOG_DIR, `app-${timestamp}.log`);
    fs.renameSync(LOG_FILE, rotatedFile);

    cleanupOldLogs();
  } catch {
    /* ignore */
  }
}

function cleanupOldLogs(): void {
  try {
    const files = fs.readdirSync(LOG_DIR)
      .filter((f) => f.startsWith("app-") && f.endsWith(".log"))
      .sort();

    while (files.length > MAX_LOG_FILES) {
      const oldest = files.shift();
      if (oldest) {
        fs.unlinkSync(path.join(LOG_DIR, oldest));
      }
    }
  } catch {
    /* ignore */
  }
}

function formatEntry(entry: LogEntry): string {
  const dataStr = entry.data ? ` | ${JSON.stringify(entry.data)}` : "";
  return `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.module}] ${entry.message}${dataStr}\n`;
}

function writeToFile(entry: LogEntry): void {
  try {
    init();
    const line = formatEntry(entry);
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch {
    /* ignore - don't crash app on logging failure */
  }
}

function getTimestamp(): string {
  return new Date().toISOString();
}

export function logDebug(module: string, message: string, data?: unknown): void {
  const entry: LogEntry = { timestamp: getTimestamp(), level: "debug", module, message, data };
  writeToFile(entry);
  if (process.env.NODE_ENV !== "production") {
    console.debug(`[DEBUG] [${module}] ${message}`, data ?? "");
  }
}

export function logInfo(module: string, message: string, data?: unknown): void {
  const entry: LogEntry = { timestamp: getTimestamp(), level: "info", module, message, data };
  writeToFile(entry);
  if (process.env.NODE_ENV !== "production") {
    console.log(`[INFO] [${module}] ${message}`, data ?? "");
  }
}

export function logWarn(module: string, message: string, data?: unknown): void {
  const entry: LogEntry = { timestamp: getTimestamp(), level: "warn", module, message, data };
  writeToFile(entry);
  if (process.env.NODE_ENV !== "production") {
    console.warn(`[WARN] [${module}] ${message}`, data ?? "");
  }
}

export function logError(module: string, message: string, data?: unknown): void {
  const entry: LogEntry = { timestamp: getTimestamp(), level: "error", module, message, data };
  writeToFile(entry);
  console.error(`[ERROR] [${module}] ${message}`, data ?? "");
}

export function readLogs(options?: { level?: LogLevel; lines?: number }): LogEntry[] {
  try {
    init();
    if (!fs.existsSync(LOG_FILE)) return [];

    const content = fs.readFileSync(LOG_FILE, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    const entries: LogEntry[] = [];

    for (const line of lines) {
      const match = line.match(
        /^\[([^\]]+)\]\s+\[(\w+)\]\s+\[([^\]]+)\]\s+(.+?)(?:\s+\|\s+(.+))?$/
      );
      if (match) {
        const entry: LogEntry = {
          timestamp: match[1],
          level: match[2].toLowerCase() as LogLevel,
          module: match[3],
          message: match[4],
        };
        if (match[5]) {
          try {
            entry.data = JSON.parse(match[5]);
          } catch {
            entry.data = match[5];
          }
        }
        entries.push(entry);
      }
    }

    const filtered = options?.level
      ? entries.filter((e) => e.level === options.level)
      : entries;

    const limit = options?.lines || 500;
    return filtered.slice(-limit);
  } catch {
    return [];
  }
}

export function getLogFilePath(): string {
  return LOG_FILE;
}

export function clearLogs(): void {
  try {
    init();
    if (fs.existsSync(LOG_FILE)) {
      fs.writeFileSync(LOG_FILE, "", "utf-8");
    }
  } catch {
    /* ignore */
  }
}
