import type { BrowserWindow } from "electron";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import {
  HERMES_HOME,
  validateProfileName,
  runHermesCli,
} from "./config";
import { showChatNotification } from "./utils";
import { exportAppDataBackup, importAppDataBackup } from "./db";
import { ipcHandle } from "./ipc/remote-handle";
import { webIpc } from "./ipc/web-api-ipc";
import { notifyRenderer } from "./ipc/desktop-events";
import {
  listSessions,
  deleteSessionRecord,
  searchSessionsQuery,
  getUsageStatsData,
  getTokenStatsData,
  getCronJobsList,
  createCronJobRecord,
  pauseCronJobRecord,
  resumeCronJobRecord,
  triggerCronJobRecord,
  updateCronJobDeliverRecord,
  updateCronJobRecord,
  deleteCronJobRecord,
  getCronHistoryList,
} from "./services/session-api";

interface CronSessionNotification {
  id: string;
  profileName: string;
  title: string;
  startedAt: number;
}

interface SessionActivityNotification {
  id: string;
  profileName: string;
  source: string;
  title: string;
  startedAt: number;
  lastMessageAt: number;
  messageCount: number;
}

interface SessionMergeResult {
  sessionId: string;
  merged: boolean;
}

let cronSessionWatcher: NodeJS.Timeout | null = null;
let sessionActivityWatcher: NodeJS.Timeout | null = null;
const notifiedCronSessionIds = new Set<string>();
const knownSessionActivity = new Map<string, string>();
const mergedIncomingSessionTargets = new Map<string, string>();

export function validateSessionId(sid: string): boolean {
  if (!sid || typeof sid !== "string") return false;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sid)) return false;
  return true;
}

function querySqliteDb(
  dbPath: string,
  sql: string,
  params?: unknown[],
): Array<Record<string, unknown>> {
  if (!fs.existsSync(dbPath)) return [];
  try {
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      return db.prepare(sql).all(...(params || [])) as Array<Record<string, unknown>>;
    } finally {
      db.close();
    }
  } catch {
    return [];
  }
}

function execSqliteDb(dbPath: string, sql: string, params?: unknown[]): boolean {
  if (!fs.existsSync(dbPath)) return false;
  try {
    const db = new Database(dbPath, { fileMustExist: true });
    try {
      db.prepare(sql).run(...(params || []));
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}

function getStateDbPathForProfile(profileName: string): string {
  if (profileName === "default") return path.join(HERMES_HOME, "state.db");
  return path.join(HERMES_HOME, "profiles", profileName, "state.db");
}

export function queryStateDb(
  sql: string,
  params?: unknown[],
): Array<Record<string, unknown>> {
  const dbPath = path.join(HERMES_HOME, "state.db");
  return querySqliteDb(dbPath, sql, params);
}

export function queryProfileStateDb(
  profileName: string,
  sql: string,
  params?: unknown[],
): Array<Record<string, unknown>> {
  if (!validateProfileName(profileName)) return [];
  const dbPath = path.join(
    HERMES_HOME,
    "profiles",
    profileName,
    "state.db",
  );
  if (!fs.existsSync(dbPath)) return queryStateDb(sql, params);
  return querySqliteDb(dbPath, sql, params);
}

export function execStateDb(sql: string, params?: unknown[]): boolean {
  const dbPath = path.join(HERMES_HOME, "state.db");
  return execSqliteDb(dbPath, sql, params);
}

export function execProfileStateDb(profileName: string, sql: string, params?: unknown[]): boolean {
  if (!validateProfileName(profileName)) return false;
  const dbPath = path.join(HERMES_HOME, "profiles", profileName, "state.db");
  if (!fs.existsSync(dbPath)) return execStateDb(sql, params);
  return execSqliteDb(dbPath, sql, params);
}

export function getSessionCount(): number {
  const stats = queryStateDb("SELECT COUNT(*) as cnt FROM sessions");
  return (stats[0] && (stats[0].cnt as number)) || 0;
}

export function getEmployeeSessions(profileName: string, limit: number = 20): Array<Record<string, unknown>> {
  if (!validateProfileName(profileName)) return [];
  const sessions = queryProfileStateDb(
    profileName,
    "SELECT id, source, model, started_at, ended_at, message_count, title " +
      "FROM sessions ORDER BY started_at DESC LIMIT ?",
    [limit],
  );
  fillCronSessionTitles(sessions, profileName);
  fillSessionTitles(sessions, (sql, params) => queryProfileStateDb(profileName, sql, params));
  return sessions;
}

function listProfileNamesWithStateDb(): string[] {
  const names = ["default"];
  const profilesDir = path.join(HERMES_HOME, "profiles");
  if (!fs.existsSync(profilesDir)) return names;
  try {
    for (const dir of fs.readdirSync(profilesDir)) {
      if (dir.startsWith(".")) continue;
      if (!validateProfileName(dir)) continue;
      const dbPath = path.join(profilesDir, dir, "state.db");
      if (fs.existsSync(dbPath)) names.push(dir);
    }
  } catch {
    /* ignore */
  }
  return names;
}

function getRecentCronSessions(profileName: string): CronSessionNotification[] {
  const sql =
    "SELECT id, source, started_at, title FROM sessions " +
    "WHERE source = 'cron' OR id LIKE 'cron_%' " +
    "ORDER BY started_at DESC LIMIT 20";
  const sessions =
    profileName === "default"
      ? queryStateDb(sql)
      : queryProfileStateDb(profileName, sql);
  fillCronSessionTitles(sessions, profileName);
  fillSessionTitles(sessions, (query, params) =>
    profileName === "default"
      ? queryStateDb(query, params)
      : queryProfileStateDb(profileName, query, params),
  );
  return sessions
    .map((session) => ({
      id: String(session.id || ""),
      profileName,
      title: String(session.title || "日程执行结果"),
      startedAt: Number(session.started_at || 0),
    }))
    .filter((session) => session.id && session.startedAt > 0);
}

function collectRecentCronSessions(): CronSessionNotification[] {
  const seen = new Set<string>();
  const result: CronSessionNotification[] = [];
  for (const profileName of listProfileNamesWithStateDb()) {
    for (const session of getRecentCronSessions(profileName)) {
      const key = `${session.profileName}:${session.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(session);
    }
  }
  return result.sort((a, b) => a.startedAt - b.startedAt);
}

function getRecentSessionActivity(profileName: string): SessionActivityNotification[] {
  const sql =
    "SELECT s.id, s.source, s.started_at, s.ended_at, s.message_count, s.title, " +
      "COALESCE(MAX(m.timestamp), s.ended_at, s.started_at) as last_message_at " +
      "FROM sessions s LEFT JOIN messages m ON m.session_id = s.id " +
      "GROUP BY s.id " +
      "ORDER BY last_message_at DESC LIMIT 30";
  const sessions =
    profileName === "default"
      ? queryStateDb(sql)
      : queryProfileStateDb(profileName, sql);
  fillCronSessionTitles(sessions, profileName);
  fillSessionTitles(sessions, (query, params) =>
    profileName === "default"
      ? queryStateDb(query, params)
      : queryProfileStateDb(profileName, query, params),
  );
  return sessions
    .map((session) => ({
      id: String(session.id || ""),
      profileName,
      source: String(session.source || ""),
      title: String(session.title || "未命名会话"),
      startedAt: Number(session.started_at || 0),
      lastMessageAt: Number(session.last_message_at || session.ended_at || session.started_at || 0),
      messageCount: Number(session.message_count || 0),
    }))
    .filter((session) => session.id && session.startedAt > 0);
}

function collectRecentSessionActivity(): SessionActivityNotification[] {
  const seen = new Set<string>();
  const result: SessionActivityNotification[] = [];
  for (const profileName of listProfileNamesWithStateDb()) {
    for (const session of getRecentSessionActivity(profileName)) {
      const key = `${session.profileName}:${session.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(session);
    }
  }
  return result.sort((a, b) => a.lastMessageAt - b.lastMessageAt);
}

function sessionActivitySignature(session: SessionActivityNotification): string {
  return [
    session.lastMessageAt,
    session.messageCount,
    session.title,
    session.source,
  ].join(":");
}

function isExternalActivitySource(source: string): boolean {
  const value = source.toLowerCase();
  return (
    value === "cron" ||
    value.includes("cron") ||
    value.includes("feishu") ||
    value.includes("lark") ||
    value.includes("weixin") ||
    value.includes("wechat") ||
    value.includes("dingtalk") ||
    value.includes("platform") ||
    value.includes("external")
  );
}

function isCronSession(sessionId: string, source?: string): boolean {
  const value = (source || "").toLowerCase();
  return value === "cron" || value.includes("cron") || sessionId.startsWith("cron_");
}

function mergeIncomingSessionIntoLatest(
  profileName: string,
  incomingSessionId: string,
  incomingSource: string,
): SessionMergeResult {
  const mergeKey = `${profileName}:${incomingSessionId}`;
  const cachedTarget = mergedIncomingSessionTargets.get(mergeKey);
  if (cachedTarget) return { sessionId: cachedTarget, merged: true };
  if (!validateSessionId(incomingSessionId)) {
    return { sessionId: incomingSessionId, merged: false };
  }
  if (!isExternalActivitySource(incomingSource) && !incomingSessionId.startsWith("cron_")) {
    return { sessionId: incomingSessionId, merged: false };
  }
  const dbPath = getStateDbPathForProfile(profileName);
  const fallbackDbPath = path.join(HERMES_HOME, "state.db");
  const actualDbPath = fs.existsSync(dbPath) ? dbPath : fallbackDbPath;
  if (!fs.existsSync(actualDbPath)) return { sessionId: incomingSessionId, merged: false };

  try {
    const db = new Database(actualDbPath, { fileMustExist: true });
    try {
      const incoming = db.prepare("SELECT id FROM sessions WHERE id = ?").get(incomingSessionId) as
        | { id: string }
        | undefined;
      if (!incoming) return { sessionId: incomingSessionId, merged: false };

      const target = db.prepare(
        "SELECT s.id FROM sessions s " +
          "LEFT JOIN messages m ON m.session_id = s.id " +
          "WHERE s.id != ? " +
          "AND LOWER(COALESCE(s.source, '')) NOT IN ('cron', 'feishu', 'lark', 'weixin', 'wechat', 'dingtalk') " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%cron%' " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%feishu%' " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%lark%' " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%weixin%' " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%wechat%' " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%dingtalk%' " +
          "AND LOWER(COALESCE(s.source, '')) NOT LIKE '%external%' " +
          "AND s.id NOT LIKE 'cron_%' " +
          "GROUP BY s.id " +
          "ORDER BY COALESCE(MAX(m.timestamp), s.ended_at, s.started_at) DESC LIMIT 1",
      ).get(incomingSessionId) as { id: string } | undefined;
      if (!target?.id || !validateSessionId(target.id)) {
        return { sessionId: incomingSessionId, merged: false };
      }

      const merge = db.transaction((targetSessionId: string, sourceSessionId: string) => {
        db.prepare("UPDATE messages SET session_id = ? WHERE session_id = ?").run(targetSessionId, sourceSessionId);
        db.prepare(
          "UPDATE sessions SET " +
            "ended_at = COALESCE((SELECT MAX(timestamp) FROM messages WHERE session_id = ?), ended_at), " +
            "message_count = (SELECT COUNT(*) FROM messages WHERE session_id = ?), " +
            "tool_call_count = COALESCE((SELECT COUNT(*) FROM messages WHERE session_id = ? AND tool_name IS NOT NULL AND tool_name != ''), tool_call_count), " +
            "input_tokens = COALESCE((SELECT SUM(token_count) FROM messages WHERE session_id = ? AND role = 'user'), input_tokens), " +
            "output_tokens = COALESCE((SELECT SUM(token_count) FROM messages WHERE session_id = ? AND role = 'assistant'), output_tokens) " +
            "WHERE id = ?",
        ).run(targetSessionId, targetSessionId, targetSessionId, targetSessionId, targetSessionId, targetSessionId);
        db.prepare("DELETE FROM sessions WHERE id = ?").run(sourceSessionId);
      });
      merge(target.id, incomingSessionId);
      mergedIncomingSessionTargets.set(mergeKey, target.id);
      return { sessionId: target.id, merged: true };
    } finally {
      db.close();
    }
  } catch {
    return { sessionId: incomingSessionId, merged: false };
  }
}

function startSessionActivityWatcher(getMainWindow: () => BrowserWindow | null): void {
  if (sessionActivityWatcher) return;
  for (const session of collectRecentSessionActivity()) {
    knownSessionActivity.set(`${session.profileName}:${session.id}`, sessionActivitySignature(session));
  }

  sessionActivityWatcher = setInterval(() => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;

    for (const session of collectRecentSessionActivity()) {
      const key = `${session.profileName}:${session.id}`;
      const signature = sessionActivitySignature(session);
      const previous = knownSessionActivity.get(key);
      knownSessionActivity.set(key, signature);
      if (previous === signature) continue;
      if (isCronSession(session.id, session.source)) continue;
      if (!previous && !isExternalActivitySource(session.source)) continue;
      const mergeResult = mergeIncomingSessionIntoLatest(session.profileName, session.id, session.source);

      notifyRenderer(win, "session-updated", {
        profileName: session.profileName,
        sessionId: mergeResult.sessionId,
        source: session.source,
        title: session.title,
        startedAt: session.startedAt,
        lastMessageAt: session.lastMessageAt,
        messageCount: session.messageCount,
        mergedFromSessionId: mergeResult.merged ? session.id : undefined,
      });
    }
  }, 3000);
}

function startCronSessionWatcher(getMainWindow: () => BrowserWindow | null): void {
  if (cronSessionWatcher) return;
  for (const session of collectRecentCronSessions()) {
    notifiedCronSessionIds.add(`${session.profileName}:${session.id}`);
  }

  cronSessionWatcher = setInterval(() => {
    const freshSessions = collectRecentCronSessions().filter((session) => {
      const key = `${session.profileName}:${session.id}`;
      return !notifiedCronSessionIds.has(key);
    });
    for (const session of freshSessions) {
      const key = `${session.profileName}:${session.id}`;
      notifiedCronSessionIds.add(key);
      const win = getMainWindow();
      const payload = {
        profileName: session.profileName,
        sessionId: session.id,
        title: session.title,
        startedAt: session.startedAt,
      };
      notifyRenderer(win, "cron-session-created", payload);
      showChatNotification(
        "日程执行完成",
        `${session.profileName}: ${session.title}`,
        win,
      );
    }
  }, 10000);
}

export function getAgentStats(profileName: string, days: number): {
  totals: Record<string, unknown>
  byModel: Array<Record<string, unknown>>
  daily: Array<Record<string, unknown>>
} {
  const cutoff = Date.now() / 1000 - days * 86400;

  const totals = queryProfileStateDb(
    profileName,
    "SELECT COUNT(*) as total_sessions, " +
      "SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, " +
      "SUM(cache_read_tokens) as total_cache_read, " +
      "SUM(estimated_cost_usd) as total_estimated_cost, SUM(actual_cost_usd) as total_actual_cost " +
      "FROM sessions WHERE started_at > ?",
    [cutoff],
  );

  const byModel = queryProfileStateDb(
    profileName,
    "SELECT model, COUNT(*) as count, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens " +
      "FROM sessions WHERE started_at > ? GROUP BY model ORDER BY count DESC",
    [cutoff],
  );

  const daily = queryProfileStateDb(
    profileName,
    "SELECT date(started_at, 'unixepoch', 'localtime') as date, COUNT(*) as sessions, " +
      "SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, " +
      "SUM(estimated_cost_usd) as estimated_cost_usd " +
      "FROM sessions WHERE started_at > ? GROUP BY date ORDER BY date ASC",
    [cutoff],
  );

  return {
    totals: totals[0] || {},
    byModel: byModel,
    daily: daily,
  };
}

export function generateSessionTitle(message: string): string {
  if (!message || !message.trim()) return "未命名会话";
  let text = message.trim();
  text = text.replace(/[#*_`~\[\]()]/g, "");
  text = text.replace(/https?:\/\/\S+/g, "");
  text = text.replace(/\s+/g, " ").trim();
  if (!text) return "未命名会话";
  if (text.length <= 50) return text;
  return text.slice(0, 47) + "...";
}

function getCronJobNameFromSessionId(sessionId: unknown, profileName?: string): string | null {
  const sid = String(sessionId || "");
  const match = sid.match(/^cron_([a-zA-Z0-9]+)_/);
  if (!match) return null;
  const jobId = match[1];
  const cronDir = profileName && profileName !== "default" && validateProfileName(profileName)
    ? path.join(HERMES_HOME, "profiles", profileName, "cron")
    : path.join(HERMES_HOME, "cron");
  const jobsFile = path.join(cronDir, "jobs.json");
  try {
    if (!fs.existsSync(jobsFile)) return null;
    const raw = JSON.parse(fs.readFileSync(jobsFile, "utf-8")) as { jobs?: Array<Record<string, unknown>> };
    const job = (raw.jobs || []).find(j => String(j.id || "") === jobId);
    const name = String(job?.name || "").trim();
    return name || null;
  } catch {
    return null;
  }
}

function fillCronSessionTitles(
  sessions: Array<Record<string, unknown>>,
  profileName?: string,
): void {
  for (const session of sessions) {
    if (session.title && String(session.title).trim() !== "") continue;
    if (String(session.source || "") !== "cron" && !String(session.id || "").startsWith("cron_")) continue;
    const jobName = getCronJobNameFromSessionId(session.id, profileName);
    session.title = jobName ? `日程：${jobName}` : "日程执行结果";
  }
}

export function fillSessionTitles(
  sessions: Array<Record<string, unknown>>,
  queryFn: (sql: string, params?: unknown[]) => Array<Record<string, unknown>>,
): void {
  for (let i = 0; i < sessions.length; i++) {
    if (sessions[i].title && String(sessions[i].title).trim() !== "") continue;
    const sid = sessions[i].id;
    const userMsg = queryFn(
      "SELECT content FROM messages WHERE session_id = ? AND role = 'user' AND content IS NOT NULL AND content != '' ORDER BY timestamp ASC LIMIT 1",
      [sid],
    );
    if (userMsg.length > 0 && userMsg[0].content) {
      sessions[i].title = generateSessionTitle(String(userMsg[0].content));
      continue;
    }
    const assistantMsg = queryFn(
      "SELECT content FROM messages WHERE session_id = ? AND role = 'assistant' AND content IS NOT NULL AND content != '' ORDER BY timestamp ASC LIMIT 1",
      [sid],
    );
    if (assistantMsg.length > 0 && assistantMsg[0].content) {
      sessions[i].title = generateSessionTitle(String(assistantMsg[0].content));
      continue;
    }
    sessions[i].title = "未命名会话";
  }
}

export function readLogs(
  logFile = "agent.log",
  lines = 200,
): { content: string; path: string } {
  const logsDir = path.join(HERMES_HOME, "logs");
  const allowed = ["agent.log", "errors.log", "gateway.log"];
  const file = allowed.includes(logFile) ? logFile : "agent.log";
  const fullPath = path.join(logsDir, file);

  if (!fs.existsSync(fullPath)) {
    return { content: "", path: fullPath };
  }
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    const allLines = content.split("\n");
    const tail = allLines.slice(-lines).join("\n");
    return { content: tail, path: fullPath };
  } catch {
    return { content: "", path: fullPath };
  }
}

export function clearHermesLog(logFile = "agent.log"): { success: boolean; path: string } {
  const logsDir = path.join(HERMES_HOME, "logs");
  const allowed = ["agent.log", "errors.log", "gateway.log"];
  const file = allowed.includes(logFile) ? logFile : "agent.log";
  const fullPath = path.join(logsDir, file);
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.writeFileSync(fullPath, "", "utf-8");
    return { success: true, path: fullPath };
  } catch {
    return { success: false, path: fullPath };
  }
}

function hasHermesCliFailure(output: string): boolean {
  return /(^|\b)(error|failed|failure|traceback)(\b|:)/i.test(output);
}

export function getSessionMessages(
  sessionId: string,
  profileName?: string,
): Array<Record<string, unknown>> {
  if (!validateSessionId(sessionId)) return [];
  const queryFn = profileName && validateProfileName(profileName)
    ? (sql: string, params?: unknown[]) => queryProfileStateDb(profileName, sql, params)
    : queryStateDb;
  return queryFn(
    "SELECT id, role, content, tool_calls, tool_call_id, tool_name, timestamp, reasoning_content " +
      "FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
    [sessionId],
  );
}

export function registerSessionIpcHandlers(getMainWindow: () => BrowserWindow | null): void {
  startCronSessionWatcher(getMainWindow);
  startSessionActivityWatcher(getMainWindow);

  ipcHandle("get-session-messages", async (_, sessionId: string, profileName?: string) => {
    return getSessionMessages(sessionId, profileName);
  });

  ipcHandle("get-sessions", async (_, limit: string | number, offset: string | number) => {
    return listSessions(Number(limit), Number(offset));
  });

  ipcHandle("delete-session", async (_, sessionId: string, profileName?: string) => {
    return deleteSessionRecord(sessionId, profileName);
  });

  ipcHandle("search-sessions", async (_, query: string, profileName?: string) => {
    return searchSessionsQuery(query, profileName);
  });

  ipcHandle("get-usage-stats", async (_, days: string | number) => {
    return getUsageStatsData(Number(days));
  });

  ipcHandle("get-cron-jobs", async (_, profile?: string) => {
    return getCronJobsList(profile);
  });

  ipcHandle("create-cron-job", async (_, job: Record<string, unknown>) => {
    return createCronJobRecord(job);
  });

  ipcHandle("pause-cron-job", async (_, jobId: string, profile?: string) => {
    return pauseCronJobRecord(jobId, profile);
  });

  ipcHandle("resume-cron-job", async (_, jobId: string, profile?: string) => {
    return resumeCronJobRecord(jobId, profile);
  });

  ipcHandle("trigger-cron-job", async (_, jobId: string, profile?: string) => {
    return triggerCronJobRecord(jobId, profile);
  });

  ipcHandle("update-cron-job-deliver", async (_, jobId: string, deliver: string, profile?: string) => {
    return updateCronJobDeliverRecord(jobId, deliver, profile);
  });

  ipcHandle("update-cron-job", async (_, jobId: string, updates: Record<string, string>, profile?: string) => {
    return updateCronJobRecord(jobId, updates, profile);
  });

  ipcHandle("delete-cron-job", async (_, jobId: string, profile?: string) => {
    return deleteCronJobRecord(jobId, profile);
  });

  ipcHandle("get-cron-history", async (_, limit: string | number, offset: string | number) => {
    return getCronHistoryList(Number(limit), Number(offset));
  });

  ipcHandle("get-token-stats", async (_, days: string | number) => {
    return getTokenStatsData(Number(days));
  });

  webIpc("run-hermes-backup", async () => {
    const appBackup = exportAppDataBackup();
    try {
      const output = runHermesCli(["backup"], "default");
      const hermesSuccess = !hasHermesCliFailure(output);
      const success = hermesSuccess && appBackup.success;
      return {
        success,
        output: [
          hermesSuccess ? output : `Hermes 备份失败: ${output}`,
          appBackup.success
            ? `桌面端数据备份: ${appBackup.path}`
            : `桌面端数据备份失败: ${appBackup.error || "unknown error"}`,
        ].filter(Boolean).join("\n"),
      };
    } catch (e) {
      return {
        success: false,
        output: appBackup.success
          ? `Hermes 备份失败: ${String(e)}\n桌面端数据备份: ${appBackup.path}`
          : `Hermes 备份失败: ${String(e)}\n桌面端数据备份失败: ${appBackup.error || "unknown error"}`,
      };
    }
  });

  webIpc("run-hermes-import", async (_, filePath: string) => {
    try {
      if (String(filePath).toLowerCase().endsWith(".json")) {
        const result = importAppDataBackup(filePath);
        return { success: result.success, output: result.error };
      }
      const output = runHermesCli(["import", filePath, "--force"], "default");
      return { success: !output.includes("Error"), output: output };
    } catch (e) {
      return { success: false, output: String(e) };
    }
  });
}
