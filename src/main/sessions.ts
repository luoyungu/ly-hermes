import { ipcMain } from "electron";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import {
  HERMES_HOME,
  validateProfileName,
  runHermesCli,
} from "./config";

export function escapeSql(val: unknown): string {
  if (val == null) return "";
  return String(val).replace(/'/g, "''").slice(0, 1000);
}

export function validateSessionId(sid: string): boolean {
  if (!sid || typeof sid !== "string") return false;
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(sid)) return false;
  return true;
}

export function queryStateDb(
  sql: string,
  params?: unknown[],
): Array<Record<string, unknown>> {
  const dbPath = path.join(HERMES_HOME, "state.db");
  if (!fs.existsSync(dbPath)) return [];
  try {
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        sql = sql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    const result = execFileSync("sqlite3", ["-json", dbPath, sql], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
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
  try {
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        sql = sql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    const result = execFileSync("sqlite3", ["-json", dbPath, sql], {
      encoding: "utf-8",
      timeout: 5000,
    });
    return JSON.parse(result.trim() || "[]");
  } catch {
    return [];
  }
}

export function execStateDb(sql: string, params?: unknown[]): boolean {
  const dbPath = path.join(HERMES_HOME, "state.db");
  if (!fs.existsSync(dbPath)) return false;
  try {
    let finalSql = sql;
    if (params && Array.isArray(params)) {
      for (let i = 0; i < params.length; i++) {
        finalSql = finalSql.replace("?", "'" + escapeSql(params[i]) + "'");
      }
    }
    execFileSync("sqlite3", [dbPath, finalSql], { encoding: "utf-8", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
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

export function registerSessionIpcHandlers(): void {
  ipcMain.handle(
    "get-sessions",
    async (_, limit: string | number, offset: string | number) => {
      const lim = Math.min(
        Math.max(parseInt(String(limit), 10) || 50, 1),
        200,
      );
      const off = Math.max(parseInt(String(offset), 10) || 0, 0);
      const sessions = queryStateDb(
        "SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, " +
          "input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd, actual_cost_usd, title " +
          "FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
        [lim, off],
      );
      fillSessionTitles(sessions, queryStateDb);
      return sessions;
    },
  );

  ipcMain.handle(
    "get-session-messages",
    async (_, sessionId: string, profileName?: string) => {
      if (!validateSessionId(sessionId)) return [];
      if (profileName) {
        return queryProfileStateDb(
          profileName,
          "SELECT id, session_id, role, content, tool_name, timestamp, token_count, finish_reason " +
            "FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
          [sessionId],
        );
      }
      return queryStateDb(
        "SELECT id, session_id, role, content, tool_name, timestamp, token_count, finish_reason " +
          "FROM messages WHERE session_id = ? ORDER BY timestamp ASC",
        [sessionId],
      );
    },
  );

  ipcMain.handle(
    "delete-session",
    async (_, sessionId: string, profileName?: string) => {
      if (!validateSessionId(sessionId))
        return { success: false, error: "Invalid session ID" };
      try {
        if (profileName && validateProfileName(profileName)) {
          const dbPath = path.join(
            HERMES_HOME,
            "profiles",
            profileName,
            "state.db",
          );
          if (fs.existsSync(dbPath)) {
            queryProfileStateDb(
              profileName,
              "DELETE FROM messages WHERE session_id = ?",
              [sessionId],
            );
            queryProfileStateDb(
              profileName,
              "DELETE FROM sessions WHERE id = ?",
              [sessionId],
            );
            return { success: true };
          }
        }
        queryStateDb("DELETE FROM messages WHERE session_id = ?", [sessionId]);
        queryStateDb("DELETE FROM sessions WHERE id = ?", [sessionId]);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    },
  );

  ipcMain.handle("search-sessions", async (_, query: string) => {
    if (!query) return [];
    const like = "%" + String(query).slice(0, 200) + "%";
    return queryStateDb(
      "SELECT id, source, model, started_at, ended_at, message_count, title " +
        "FROM sessions WHERE title LIKE ? " +
        "OR id IN (SELECT session_id FROM messages WHERE content LIKE ?) " +
        "ORDER BY started_at DESC LIMIT 50",
      [like, like],
    );
  });

  ipcMain.handle("get-usage-stats", async (_, days: string | number) => {
    const d = Math.min(
      Math.max(parseInt(String(days), 10) || 30, 1),
      365,
    );
    const cutoff = Date.now() / 1000 - d * 86400;
    const totals = queryStateDb(
      "SELECT COUNT(*) as total_sessions, " +
        "SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, " +
        "SUM(cache_read_tokens) as total_cache_read, " +
        "SUM(estimated_cost_usd) as total_estimated_cost, SUM(actual_cost_usd) as total_actual_cost " +
        "FROM sessions WHERE started_at > ?",
      [cutoff],
    );
    const byModel = queryStateDb(
      "SELECT model, COUNT(*) as count, SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens " +
        "FROM sessions WHERE started_at > ? GROUP BY model ORDER BY count DESC",
      [cutoff],
    );
    const daily = queryStateDb(
      "SELECT date(started_at, 'unixepoch', 'localtime') as date, COUNT(*) as sessions, " +
        "SUM(input_tokens) as input_tokens, SUM(output_tokens) as output_tokens, " +
        "SUM(estimated_cost_usd) as estimated_cost_usd " +
        "FROM sessions WHERE started_at > ? GROUP BY date ORDER BY date ASC",
      [cutoff],
    );
    return {
      totals: totals[0] || {},
      by_model: byModel,
      daily: daily,
    };
  });

  ipcMain.handle("get-cron-jobs", async (_, profile?: string) => {
    const output = runHermesCli(["cron", "list", "--json"], profile || "default");
    try {
      return JSON.parse(output);
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "create-cron-job",
    async (_, job: Record<string, unknown>) => {
      const args = [
        "cron",
        "create",
        "--name",
        JSON.stringify(job.name || "untitled"),
        "--schedule",
        JSON.stringify(job.schedule || ""),
        "--prompt",
        JSON.stringify(job.prompt || ""),
      ];
      if (job.deliver) args.push("--deliver", String(job.deliver));
      const profile = (job.profile as string) || "default";
      const output = runHermesCli(args, profile);
      return { success: !output.includes("Error"), output: output };
    },
  );

  ipcMain.handle("pause-cron-job", async (_, jobId: string, profile?: string) => {
    return {
      success: !runHermesCli(
        ["cron", "pause", String(jobId)],
        profile || "default",
      ).includes("Error"),
    };
  });

  ipcMain.handle("resume-cron-job", async (_, jobId: string, profile?: string) => {
    return {
      success: !runHermesCli(
        ["cron", "resume", String(jobId)],
        profile || "default",
      ).includes("Error"),
    };
  });

  ipcMain.handle("trigger-cron-job", async (_, jobId: string, profile?: string) => {
    return {
      success: !runHermesCli(
        ["cron", "trigger", String(jobId)],
        profile || "default",
      ).includes("Error"),
    };
  });

  ipcMain.handle("delete-cron-job", async (_, jobId: string, profile?: string) => {
    return {
      success: !runHermesCli(
        ["cron", "delete", String(jobId)],
        profile || "default",
      ).includes("Error"),
    };
  });

  ipcMain.handle(
    "get-cron-history",
    async (_, limit: string | number, offset: string | number) => {
      const lim = Math.min(
        Math.max(parseInt(String(limit), 10) || 50, 1),
        200,
      );
      const off = Math.max(parseInt(String(offset), 10) || 0, 0);
      return queryStateDb(
        "SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, title " +
          "FROM sessions WHERE source = 'cron' ORDER BY started_at DESC LIMIT ? OFFSET ?",
        [lim, off],
      );
    },
  );

  ipcMain.handle("run-hermes-backup", async () => {
    try {
      const output = runHermesCli(["backup"], "default");
      return { success: !output.includes("Error"), output: output };
    } catch (e) {
      return { success: false, output: String(e) };
    }
  });

  ipcMain.handle("run-hermes-import", async (_, filePath: string) => {
    try {
      const output = runHermesCli(["import", filePath, "--force"], "default");
      return { success: !output.includes("Error"), output: output };
    } catch (e) {
      return { success: false, output: String(e) };
    }
  });
}
