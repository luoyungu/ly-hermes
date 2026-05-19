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

export function execProfileStateDb(profileName: string, sql: string, params?: unknown[]): boolean {
  if (!validateProfileName(profileName)) return false;
  const dbPath = path.join(HERMES_HOME, "profiles", profileName, "state.db");
  if (!fs.existsSync(dbPath)) return execStateDb(sql, params);
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
  fillSessionTitles(sessions, (sql, params) => queryProfileStateDb(profileName, sql, params));
  return sessions;
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

export function registerSessionIpcHandlers(): void {
  ipcMain.handle("get-session-messages", async (_, sessionId: string, profileName?: string) => {
    return getSessionMessages(sessionId, profileName);
  });

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
            execProfileStateDb(
              profileName,
              "DELETE FROM messages WHERE session_id = ?",
              [sessionId],
            );
            execProfileStateDb(
              profileName,
              "DELETE FROM sessions WHERE id = ?",
              [sessionId],
            );
            return { success: true };
          }
        }
        execStateDb("DELETE FROM messages WHERE session_id = ?", [sessionId]);
        execStateDb("DELETE FROM sessions WHERE id = ?", [sessionId]);
        return { success: true };
      } catch (e: unknown) {
        return { success: false, error: (e as Error).message };
      }
    },
  );

  ipcMain.handle("search-sessions", async (_, query: string, profileName?: string) => {
    if (!query) return [];
    const like = "%" + String(query).slice(0, 200) + "%";
    const queryFn = profileName && validateProfileName(profileName)
      ? (sql: string, params?: unknown[]) => queryProfileStateDb(profileName, sql, params)
      : queryStateDb;
    return queryFn(
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
    try {
      const effectiveProfile = profile || "default";
      const output = runHermesCli(["cron", "list", "--all"], effectiveProfile);
      if (output.includes("No scheduled jobs")) return [];
      const jobs: Record<string, unknown>[] = [];
      const blocks = output.split(/\n\s*\n/).filter(b => b.trim());
      for (const block of blocks) {
        const idMatch = block.match(/^\s*(\w+)\s+\[(active|paused)\]/m);
        if (!idMatch) continue;
        const job: Record<string, unknown> = {
          id: idMatch[1],
          enabled: idMatch[2] === "active",
        };
        const nameMatch = block.match(/Name:\s*(.+)/);
        if (nameMatch) job.name = nameMatch[1].trim();
        const schedMatch = block.match(/Schedule:\s*(.+)/);
        if (schedMatch) {
          job.schedule = schedMatch[1].trim();
          job.schedule_display = schedMatch[1].trim();
        }
        const promptMatch = block.match(/Prompt:\s*(.+)/);
        if (promptMatch) job.prompt = promptMatch[1].trim();
        const nextMatch = block.match(/Next run:\s*(\S+)/);
        if (nextMatch) job.next_run_at = nextMatch[1].trim();
        const lastMatch = block.match(/Last run:\s*(\S+)/);
        if (lastMatch) job.last_run_at = lastMatch[1].trim();
        const deliverMatch = block.match(/Deliver:\s*(.+)/);
        if (deliverMatch) job.deliver = deliverMatch[1].trim();
        const repeatMatch = block.match(/Repeat:\s*(.+)/);
        if (repeatMatch) job.repeat = repeatMatch[1].trim();
        const warnMatch = block.match(/⚠\s*(.+)/);
        if (warnMatch) job.last_error = warnMatch[1].trim();
        const errMatch = block.match(/Last error:\s*(.+)/);
        if (errMatch) job.last_error = errMatch[1].trim();
        const skillsMatch = block.match(/Skills:\s*(.+)/);
        if (skillsMatch) job.skills = skillsMatch[1].trim();
        jobs.push(job);
      }
      return jobs;
    } catch {
      return [];
    }
  });

  ipcMain.handle(
    "create-cron-job",
    async (_, job: Record<string, unknown>) => {
      const args: string[] = ["cron", "create"];
      if (job.name) args.push("--name", String(job.name));
      if (job.deliver) args.push("--deliver", String(job.deliver));
      args.push(String(job.schedule || ""));
      args.push(String(job.prompt || ""));
      const profile = (job.profile as string) || "default";
      const output = runHermesCli(args, profile);
      return { success: !output.includes("Error") && !output.includes("error"), output: output };
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

  ipcMain.handle("get-token-stats", async (_, days: string | number) => {
    const d = Math.min(Math.max(parseInt(String(days), 10) || 30, 1), 365);
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

    const profileDirs = path.join(HERMES_HOME, "profiles");
    const agents: string[] = [];
    const byAgent: Array<Record<string, unknown>> = [];
    let totalAgentTokens = 0;

    if (fs.existsSync(profileDirs)) {
      const entries = fs.readdirSync(profileDirs, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && validateProfileName(entry.name)) {
          const dbPath = path.join(profileDirs, entry.name, "state.db");
          if (fs.existsSync(dbPath)) {
            const agentTotals = queryProfileStateDb(
              entry.name,
              "SELECT COUNT(*) as sessions, " +
                "COALESCE(SUM(input_tokens), 0) as input_tokens, " +
                "COALESCE(SUM(output_tokens), 0) as output_tokens " +
                "FROM sessions WHERE started_at > ?",
              [cutoff],
            );
            const sessions = (agentTotals[0]?.sessions as number) || 0;
            const inputTokens = (agentTotals[0]?.input_tokens as number) || 0;
            const outputTokens = (agentTotals[0]?.output_tokens as number) || 0;
            const agentTotal = inputTokens + outputTokens;
            if (sessions > 0) {
              agents.push(entry.name);
              totalAgentTokens += agentTotal;
              byAgent.push({
                agent: entry.name,
                sessions,
                input_tokens: inputTokens,
                output_tokens: outputTokens,
              });
            }
          }
        }
      }
    }

    byAgent.sort((a, b) => {
      const aTotal = ((a.input_tokens as number) || 0) + ((a.output_tokens as number) || 0);
      const bTotal = ((b.input_tokens as number) || 0) + ((b.output_tokens as number) || 0);
      return bTotal - aTotal;
    });

    for (const agent of byAgent) {
      const agentTotal = ((agent.input_tokens as number) || 0) + ((agent.output_tokens as number) || 0);
      (agent as Record<string, unknown>).percentage = totalAgentTokens > 0
        ? Math.round((agentTotal / totalAgentTokens) * 100)
        : 0;
    }

    return {
      totals: totals[0] || {},
      byModel: byModel,
      byAgent: byAgent,
      daily: daily,
      agents: agents,
    };
  });
}
