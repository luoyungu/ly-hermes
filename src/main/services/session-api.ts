import path from "path";
import fs from "fs";
import {
  HERMES_HOME,
  validateProfileName,
  runHermesCli,
  getProfilePath,
} from "../config";
import {
  queryStateDb,
  queryProfileStateDb,
  execStateDb,
  execProfileStateDb,
  getSessionMessages,
  getEmployeeSessions,
  validateSessionId,
  fillSessionTitles,
} from "../sessions";

function isSafeDeliverTarget(deliver: unknown): deliver is string {
  if (typeof deliver !== "string") return false;
  const trimmed = deliver.trim();
  if (!trimmed) return false;
  if (trimmed === "local") return true;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(trimmed)) return true;
  return false;
}

function hasHermesCliFailure(output: string): boolean {
  return output.includes("Error") || output.includes("error") || output.includes("Traceback");
}

export function listSessions(limit = 50, offset = 0): Array<Record<string, unknown>> {
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
  const off = Math.max(parseInt(String(offset), 10) || 0, 0);
  const sessions = queryStateDb(
    "SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, " +
      "input_tokens, output_tokens, cache_read_tokens, estimated_cost_usd, actual_cost_usd, title " +
      "FROM sessions ORDER BY started_at DESC LIMIT ? OFFSET ?",
    [lim, off],
  );
  fillSessionTitles(sessions, queryStateDb);
  return sessions;
}

export function deleteSessionRecord(
  sessionId: string,
  profileName?: string,
): { success: boolean; error?: string } {
  if (!validateSessionId(sessionId)) return { success: false, error: "Invalid session ID" };
  try {
    if (profileName && validateProfileName(profileName)) {
      const dbPath = path.join(HERMES_HOME, "profiles", profileName, "state.db");
      if (fs.existsSync(dbPath)) {
        execProfileStateDb(profileName, "DELETE FROM messages WHERE session_id = ?", [sessionId]);
        execProfileStateDb(profileName, "DELETE FROM sessions WHERE id = ?", [sessionId]);
        return { success: true };
      }
    }
    execStateDb("DELETE FROM messages WHERE session_id = ?", [sessionId]);
    execStateDb("DELETE FROM sessions WHERE id = ?", [sessionId]);
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: (e as Error).message };
  }
}

export function searchSessionsQuery(
  query: string,
  profileName?: string,
): Array<Record<string, unknown>> {
  if (!query) return [];
  const like = "%" + String(query).slice(0, 200) + "%";
  const queryFn =
    profileName && validateProfileName(profileName)
      ? (sql: string, params?: unknown[]) => queryProfileStateDb(profileName, sql, params)
      : queryStateDb;
  return queryFn(
    "SELECT id, source, model, started_at, ended_at, message_count, title " +
      "FROM sessions WHERE title LIKE ? " +
      "OR id IN (SELECT session_id FROM messages WHERE content LIKE ?) " +
      "ORDER BY started_at DESC LIMIT 50",
    [like, like],
  );
}

export function getUsageStatsData(days = 30): Record<string, unknown> {
  const d = Math.min(Math.max(parseInt(String(days), 10) || 30, 1), 365);
  const cutoff = Date.now() / 1000 - d * 86400;
  const totals = queryStateDb(
    "SELECT COUNT(*) as total_sessions, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, " +
      "SUM(cache_read_tokens) as total_cache_read, SUM(estimated_cost_usd) as total_estimated_cost, " +
      "SUM(actual_cost_usd) as total_actual_cost FROM sessions WHERE started_at > ?",
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
      "SUM(estimated_cost_usd) as estimated_cost_usd FROM sessions WHERE started_at > ? GROUP BY date ORDER BY date ASC",
    [cutoff],
  );
  return { totals: totals[0] || {}, by_model: byModel, daily };
}

export function getTokenStatsData(days = 30): Record<string, unknown> {
  const d = Math.min(Math.max(parseInt(String(days), 10) || 30, 1), 365);
  const cutoff = Date.now() / 1000 - d * 86400;
  const totals = queryStateDb(
    "SELECT COUNT(*) as total_sessions, SUM(input_tokens) as total_input, SUM(output_tokens) as total_output, " +
      "SUM(cache_read_tokens) as total_cache_read, SUM(estimated_cost_usd) as total_estimated_cost, " +
      "SUM(actual_cost_usd) as total_actual_cost FROM sessions WHERE started_at > ?",
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
      "SUM(estimated_cost_usd) as estimated_cost_usd FROM sessions WHERE started_at > ? GROUP BY date ORDER BY date ASC",
    [cutoff],
  );
  const profileDirs = path.join(HERMES_HOME, "profiles");
  const agents: string[] = [];
  const byAgent: Array<Record<string, unknown>> = [];
  if (fs.existsSync(profileDirs)) {
    for (const entry of fs.readdirSync(profileDirs, { withFileTypes: true })) {
      if (!entry.isDirectory() || !validateProfileName(entry.name)) continue;
      const dbPath = path.join(profileDirs, entry.name, "state.db");
      if (!fs.existsSync(dbPath)) continue;
      const agentTotals = queryProfileStateDb(
        entry.name,
        "SELECT COUNT(*) as sessions, COALESCE(SUM(input_tokens), 0) as input_tokens, " +
          "COALESCE(SUM(output_tokens), 0) as output_tokens FROM sessions WHERE started_at > ?",
        [cutoff],
      );
      const sessions = (agentTotals[0]?.sessions as number) || 0;
      const inputTokens = (agentTotals[0]?.input_tokens as number) || 0;
      const outputTokens = (agentTotals[0]?.output_tokens as number) || 0;
      if (sessions > 0) {
        agents.push(entry.name);
        byAgent.push({ agent: entry.name, sessions, input_tokens: inputTokens, output_tokens: outputTokens });
      }
    }
  }
  byAgent.sort((a, b) => {
    const aTotal = ((a.input_tokens as number) || 0) + ((a.output_tokens as number) || 0);
    const bTotal = ((b.input_tokens as number) || 0) + ((b.output_tokens as number) || 0);
    return bTotal - aTotal;
  });
  let totalAgentTokens = byAgent.reduce(
    (sum, a) => sum + ((a.input_tokens as number) || 0) + ((a.output_tokens as number) || 0),
    0,
  );
  for (const agent of byAgent) {
    const agentTotal = ((agent.input_tokens as number) || 0) + ((agent.output_tokens as number) || 0);
    agent.percentage = totalAgentTokens > 0 ? Math.round((agentTotal / totalAgentTokens) * 100) : 0;
  }
  return { totals: totals[0] || {}, byModel, byAgent, daily, agents };
}

export function getCronJobsList(profile?: string): Array<Record<string, unknown>> {
  try {
    const effectiveProfile = profile || "default";
    const jobsFile = path.join(getProfilePath(effectiveProfile), "cron", "jobs.json");
    if (!fs.existsSync(jobsFile)) return [];
    const parsed = JSON.parse(fs.readFileSync(jobsFile, "utf-8"));
    const raw = Array.isArray(parsed) ? parsed : parsed.jobs || [];
    const jobs: Record<string, unknown>[] = [];
    for (const job of raw) {
      if (!job.id) continue;
      const enabled = job.enabled !== false;
      let state = "active";
      if (job.state === "paused" || !enabled) state = "paused";
      else if (job.state === "completed") state = "completed";
      const sched = job.schedule as Record<string, unknown> | string | undefined;
      const scheduleValue =
        typeof sched === "object" ? sched?.value || String(sched) : sched || "?";
      const deliverRaw = job.deliver;
      let deliverStr: string | undefined;
      if (Array.isArray(deliverRaw)) deliverStr = (deliverRaw as string[]).join(",");
      else if (typeof deliverRaw === "string") deliverStr = deliverRaw;
      const skillsRaw = job.skills;
      let skillsStr: string | undefined;
      if (Array.isArray(skillsRaw)) skillsStr = (skillsRaw as string[]).join(", ");
      else if (typeof skillsRaw === "string") skillsStr = skillsRaw;
      const repeatObj = job.repeat as Record<string, unknown> | null | undefined;
      let repeatStr: string | undefined;
      if (repeatObj && typeof repeatObj === "object") {
        const times = repeatObj.times != null ? repeatObj.times : null;
        const completed = repeatObj.completed ?? 0;
        if (times != null) repeatStr = `${completed}/${times}`;
      } else if (typeof job.repeat === "string") repeatStr = job.repeat;
      jobs.push({
        id: String(job.id),
        name: (job.name as string) || "",
        schedule: scheduleValue,
        schedule_display: (job.schedule_display as string) || scheduleValue,
        prompt: (job.prompt as string) || "",
        enabled,
        state,
        next_run_at: (job.next_run_at as string) || null,
        last_run_at: (job.last_run_at as string) || null,
        last_status: (job.last_status as string) || null,
        last_error: (job.last_error as string) || null,
        deliver: deliverStr,
        repeat: repeatStr,
        skills: skillsStr,
        script: (job.script as string) || null,
      });
    }
    return jobs;
  } catch {
    return [];
  }
}

export function createCronJobRecord(job: Record<string, unknown>): { success: boolean; output?: string } {
  const args: string[] = ["cron", "create"];
  if (job.name) args.push("--name", String(job.name));
  const deliver = job.deliver || "local";
  if (deliver) {
    if (!isSafeDeliverTarget(deliver)) return { success: false, output: "不支持的投递目标" };
    args.push("--deliver", String(deliver).trim());
  }
  args.push(String(job.schedule || ""));
  args.push(String(job.prompt || ""));
  const profile = (job.profile as string) || "default";
  const output = runHermesCli(args, profile);
  return { success: !hasHermesCliFailure(output), output };
}

export function pauseCronJobRecord(jobId: string, profile?: string): { success: boolean } {
  return {
    success: !runHermesCli(["cron", "pause", String(jobId)], profile || "default").includes("Error"),
  };
}

export function resumeCronJobRecord(jobId: string, profile?: string): { success: boolean } {
  return {
    success: !runHermesCli(["cron", "resume", String(jobId)], profile || "default").includes("Error"),
  };
}

export function triggerCronJobRecord(jobId: string, profile?: string): { success: boolean; output?: string } {
  const output = runHermesCli(["cron", "run", String(jobId)], profile || "default");
  return { success: !hasHermesCliFailure(output), output };
}

export function updateCronJobDeliverRecord(
  jobId: string,
  deliver: string,
  profile?: string,
): { success: boolean; output?: string } {
  const safeDeliver = isSafeDeliverTarget(deliver) ? deliver.trim() : "local";
  const output = runHermesCli(["cron", "edit", String(jobId), "--deliver", safeDeliver], profile || "default");
  return { success: !hasHermesCliFailure(output), output };
}

export function updateCronJobRecord(
  jobId: string,
  updates: Record<string, string>,
  profile?: string,
): { success: boolean; output?: string } {
  const args: string[] = ["cron", "edit", String(jobId)];
  if (updates.name) args.push("--name", updates.name);
  if (updates.schedule) args.push("--schedule", updates.schedule);
  if (updates.prompt) args.push("--prompt", updates.prompt);
  if (updates.deliver) {
    const safeDeliver = isSafeDeliverTarget(updates.deliver) ? updates.deliver.trim() : "local";
    args.push("--deliver", safeDeliver);
  }
  const output = runHermesCli(args, profile || "default");
  return { success: !hasHermesCliFailure(output), output };
}

export function deleteCronJobRecord(jobId: string, profile?: string): { success: boolean } {
  return {
    success: !runHermesCli(["cron", "delete", String(jobId)], profile || "default").includes("Error"),
  };
}

export function getCronHistoryList(limit = 50, offset = 0): Array<Record<string, unknown>> {
  const lim = Math.min(Math.max(parseInt(String(limit), 10) || 50, 1), 200);
  const off = Math.max(parseInt(String(offset), 10) || 0, 0);
  return queryStateDb(
    "SELECT id, source, model, started_at, ended_at, message_count, tool_call_count, title " +
      "FROM sessions WHERE source = 'cron' OR id LIKE 'cron_%' ORDER BY started_at DESC LIMIT ? OFFSET ?",
    [lim, off],
  );
}

export { getSessionMessages, getEmployeeSessions };
