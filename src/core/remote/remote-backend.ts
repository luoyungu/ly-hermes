import { getRemoteConnection } from "../../main/deployment";
import { remoteJsonRequest } from "./remote-client";

class RemoteBackend {
  private conn() {
    return getRemoteConnection();
  }

  private async call<T>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const res = await remoteJsonRequest<T>(this.conn(), method, path, body);
    if (res.status >= 400 || res.data === null) {
      throw new Error(res.error || (res.data as { error?: string } | null)?.error || `远程请求失败 (${res.status})`);
    }
    return res.data as T;
  }

  listEmployees() {
    return this.call<{ employees: unknown[] }>("GET", "/api/v1/employees").then((d) => d.employees || []);
  }

  getEmployee(name: string) {
    return this.call<{ employee: unknown }>("GET", `/api/v1/employees/${encodeURIComponent(name)}`).then((d) => d.employee);
  }

  createEmployee(config: Record<string, unknown>) {
    return this.call<Record<string, unknown>>("POST", "/api/v1/employees", config);
  }

  updateEmployee(name: string, changes: Record<string, unknown>) {
    return this.call<Record<string, unknown>>(
      "PATCH",
      `/api/v1/employees/${encodeURIComponent(name)}`,
      changes,
    );
  }

  deleteEmployee(name: string) {
    return this.call<Record<string, unknown>>("DELETE", `/api/v1/employees/${encodeURIComponent(name)}`);
  }

  wakeUpEmployee(name: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/wake-up`,
    );
  }

  sleepEmployee(name: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/sleep`,
    );
  }

  restartEmployee(name: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/restart`,
    );
  }

  restartAllEngines() {
    return this.call<{ success: boolean; restarted: number; total: number }>(
      "POST",
      "/api/v1/employees/restart-all",
    );
  }

  getEmployeeStatus(name: string) {
    return this.call<{ status: string }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/status`,
    ).then((d) => d.status);
  }

  resetWebToken(name: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/web-access/rotate-token`,
    );
  }

  renameEmployee(oldName: string, newName: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(oldName)}/rename`,
      { newName },
    );
  }

  getSoul(name: string) {
    return this.call<{ content: string }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/soul`,
    ).then((d) => d.content || "");
  }

  setSoul(name: string, content: string) {
    return this.call<Record<string, unknown>>(
      "PUT",
      `/api/v1/employees/${encodeURIComponent(name)}/soul`,
      { content },
    );
  }

  resetSoul(name: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/soul/reset`,
    );
  }

  getConfig(name: string) {
    return this.call<{ config: Record<string, unknown> }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/config`,
    ).then((d) => d.config || {});
  }

  setConfig(name: string, config: Record<string, unknown>) {
    return this.call<Record<string, unknown>>(
      "PUT",
      `/api/v1/employees/${encodeURIComponent(name)}/config`,
      config,
    );
  }

  getEnv(name: string) {
    return this.call<{ env: Record<string, string> }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/env`,
    ).then((d) => d.env || {});
  }

  setEnv(name: string, env: Record<string, string>) {
    return this.call<Record<string, unknown>>(
      "PUT",
      `/api/v1/employees/${encodeURIComponent(name)}/env`,
      env,
    );
  }

  getTools(name: string) {
    return this.call<{ tools: string[] }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/tools`,
    ).then((d) => d.tools || []);
  }

  setTools(name: string, tools: string[]) {
    return this.call<Record<string, unknown>>(
      "PUT",
      `/api/v1/employees/${encodeURIComponent(name)}/tools`,
      { tools },
    );
  }

  toggleTool(name: string, toolKey: string, enabled: boolean) {
    return this.call<Record<string, unknown>>(
      "PATCH",
      `/api/v1/employees/${encodeURIComponent(name)}/tools/${encodeURIComponent(toolKey)}`,
      { enabled },
    );
  }

  getMemory(name: string) {
    return this.call<Record<string, unknown>>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/memory`,
    );
  }

  addMemory(name: string, content: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/memory`,
      { content },
    );
  }

  deleteMemory(name: string, index: number) {
    return this.call<Record<string, unknown>>(
      "DELETE",
      `/api/v1/employees/${encodeURIComponent(name)}/memory/${index}`,
    );
  }

  getEmployeeSessions(name: string) {
    return this.call<{ sessions: unknown[] }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/sessions`,
    ).then((d) => d.sessions || []);
  }

  exportEmployee(name: string) {
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/employees/${encodeURIComponent(name)}/export`,
    );
  }

  getEmployeeSkillsDir(name: string) {
    return this.call<{ skills: unknown[] }>(
      "GET",
      `/api/v1/employees/${encodeURIComponent(name)}/skills/dir`,
    ).then((d) => d.skills || []);
  }

  removeEmployeeSkill(name: string, skillName: string) {
    return this.call<Record<string, unknown>>(
      "DELETE",
      `/api/v1/employees/${encodeURIComponent(name)}/skills/${encodeURIComponent(skillName)}`,
    );
  }

  listInstalledSkills(profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<{ skills: unknown[] }>("GET", `/api/v1/skills/installed${q}`).then((d) => d.skills || []);
  }

  listBundledSkills(profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<{ skills: unknown[] }>("GET", `/api/v1/skills/bundled${q}`).then((d) => d.skills || []);
  }

  getSkillContent(skillPath: string) {
    return this.call<{ content: string }>(
      "GET",
      `/api/v1/skills/content?path=${encodeURIComponent(skillPath)}`,
    ).then((d) => d.content || "");
  }

  installSkill(identifier: string, profile?: string) {
    return this.call<Record<string, unknown>>("POST", "/api/v1/skills/install", { identifier, profile });
  }

  uninstallSkill(name: string, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>(
      "DELETE",
      `/api/v1/skills/${encodeURIComponent(name)}${q}`,
    );
  }

  getSkillConfig(profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>("GET", `/api/v1/skills/config${q}`);
  }

  setSkillEnabled(skillId: string, enabled: boolean, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>(
      "PATCH",
      `/api/v1/skills/${encodeURIComponent(skillId)}/enabled${q}`,
      { enabled },
    );
  }

  recordSkillUsage(skillId: string, success: boolean, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>(
      "POST",
      `/api/v1/skills/${encodeURIComponent(skillId)}/usage${q}`,
      { success },
    );
  }

  getSessionMessages(sessionId: string, profileName?: string) {
    const q = profileName ? `?profile=${encodeURIComponent(profileName)}` : "";
    return this.call<{ messages: unknown[] }>(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}/messages${q}`,
    ).then((d) => d.messages || []);
  }

  getSessions(limit?: number, offset?: number) {
    return this.call<{ sessions: unknown[] }>(
      "GET",
      `/api/v1/sessions?limit=${limit || 50}&offset=${offset || 0}`,
    ).then((d) => d.sessions || []);
  }

  deleteSession(sessionId: string, profileName?: string) {
    const q = profileName ? `?profile=${encodeURIComponent(profileName)}` : "";
    return this.call<Record<string, unknown>>(
      "DELETE",
      `/api/v1/sessions/${encodeURIComponent(sessionId)}${q}`,
    );
  }

  searchSessions(query: string, profileName?: string) {
    const params = new URLSearchParams({ q: query });
    if (profileName) params.set("profile", profileName);
    return this.call<{ sessions: unknown[] }>(
      "GET",
      `/api/v1/sessions/search?${params.toString()}`,
    ).then((d) => d.sessions || []);
  }

  getUsageStats(days?: number) {
    return this.call<Record<string, unknown>>("GET", `/api/v1/stats/usage?days=${days || 30}`);
  }

  getTokenStats(days?: number) {
    return this.call<Record<string, unknown>>("GET", `/api/v1/stats/tokens?days=${days || 30}`);
  }

  getCronJobs(profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<{ jobs: unknown[] }>("GET", `/api/v1/cron/jobs${q}`).then((d) => d.jobs || []);
  }

  createCronJob(job: Record<string, unknown>) {
    return this.call<Record<string, unknown>>("POST", "/api/v1/cron/jobs", job);
  }

  pauseCronJob(jobId: string, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>("POST", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}/pause${q}`);
  }

  resumeCronJob(jobId: string, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>("POST", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}/resume${q}`);
  }

  triggerCronJob(jobId: string, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>("POST", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}/run${q}`);
  }

  updateCronJobDeliver(jobId: string, deliver: string, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>(
      "PATCH",
      `/api/v1/cron/jobs/${encodeURIComponent(jobId)}${q}`,
      { deliver },
    );
  }

  updateCronJob(jobId: string, updates: Record<string, string>, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>(
      "PATCH",
      `/api/v1/cron/jobs/${encodeURIComponent(jobId)}${q}`,
      updates,
    );
  }

  deleteCronJob(jobId: string, profile?: string) {
    const q = profile ? `?profile=${encodeURIComponent(profile)}` : "";
    return this.call<Record<string, unknown>>("DELETE", `/api/v1/cron/jobs/${encodeURIComponent(jobId)}${q}`);
  }

  getCronHistory(limit?: number, offset?: number) {
    return this.call<{ history: unknown[] }>(
      "GET",
      `/api/v1/cron/history?limit=${limit || 50}&offset=${offset || 0}`,
    ).then((d) => d.history || []);
  }

  stageAttachment(sessionId: string, filename: string, base64Bytes: string) {
    return this.call<{ path: string }>("POST", "/api/v1/attachments", {
      sessionId,
      filename,
      base64: base64Bytes,
    }).then((d) => d.path);
  }

  abortChat(profileName: string) {
    return this.call<Record<string, unknown>>("POST", "/api/v1/chat/abort", { profileName });
  }
}

export const remoteBackend = new RemoteBackend();
