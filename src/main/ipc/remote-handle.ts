import { ipcMain, type IpcMainInvokeEvent } from "electron";
import { isClientOnlyMode } from "../deployment";
import { remoteBackend } from "../../core/remote/remote-backend";

type RemoteHandler = (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown>;

const REMOTE_HANDLERS = new Map<string, RemoteHandler>();

export function registerRemoteHandler(
  channel: string,
  handler: RemoteHandler,
): void {
  REMOTE_HANDLERS.set(channel, handler);
}

export function ipcHandle(
  channel: string,
  localHandler: (event: IpcMainInvokeEvent, ...args: any[]) => unknown,
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    if (isClientOnlyMode()) {
      const remote = REMOTE_HANDLERS.get(channel);
      if (remote) return remote(event, ...args);
    }
    return localHandler(event, ...args);
  });
}

export function registerRemoteIpcHandlers(): void {
  registerRemoteHandler("employee:list", () => remoteBackend.listEmployees());
  registerRemoteHandler("employee:get", (_, name) => remoteBackend.getEmployee(String(name)));
  registerRemoteHandler("employee:create", (_, config) => remoteBackend.createEmployee(config as Record<string, unknown>));
  registerRemoteHandler("employee:update", (_, name, changes) =>
    remoteBackend.updateEmployee(String(name), changes as Record<string, unknown>));
  registerRemoteHandler("employee:delete", (_, name) => remoteBackend.deleteEmployee(String(name)));
  registerRemoteHandler("employee:wake-up", (_, name) => remoteBackend.wakeUpEmployee(String(name)));
  registerRemoteHandler("employee:sleep", (_, name) => remoteBackend.sleepEmployee(String(name)));
  registerRemoteHandler("employee:restart", (_, name) => remoteBackend.restartEmployee(String(name)));
  registerRemoteHandler("restart-all-engines", () => remoteBackend.restartAllEngines());
  registerRemoteHandler("employee:install-skill", (_, name, url) =>
    remoteBackend.installSkill(String(url), String(name)));
  registerRemoteHandler("employee:status", (_, name) => remoteBackend.getEmployeeStatus(String(name)));
  registerRemoteHandler("employee:reset-web-token", (_, name) => remoteBackend.resetWebToken(String(name)));
  registerRemoteHandler("employee:rename", (_, oldName, newName) =>
    remoteBackend.renameEmployee(String(oldName), String(newName)));
  registerRemoteHandler("employee:set-pet", (_, name, petSlug) =>
    remoteBackend.updateEmployee(String(name), { petSlug: String(petSlug) }));
  registerRemoteHandler("employee:get-soul", (_, name) => remoteBackend.getSoul(String(name)));
  registerRemoteHandler("employee:set-soul", (_, name, content) =>
    remoteBackend.setSoul(String(name), String(content)));
  registerRemoteHandler("employee:reset-soul", (_, name) => remoteBackend.resetSoul(String(name)));
  registerRemoteHandler("employee:get-config", (_, name) => remoteBackend.getConfig(String(name)));
  registerRemoteHandler("employee:set-config", (_, name, config) =>
    remoteBackend.setConfig(String(name), config as Record<string, unknown>));
  registerRemoteHandler("employee:get-env", (_, name) => remoteBackend.getEnv(String(name)));
  registerRemoteHandler("employee:set-env", (_, name, env) =>
    remoteBackend.setEnv(String(name), env as Record<string, string>));
  registerRemoteHandler("employee:get-tools", (_, name) => remoteBackend.getTools(String(name)));
  registerRemoteHandler("employee:set-tools", (_, name, tools) =>
    remoteBackend.setTools(String(name), tools as string[]));
  registerRemoteHandler("employee:toggle-tool", (_, name, toolKey, enabled) =>
    remoteBackend.toggleTool(String(name), String(toolKey), enabled === true));
  registerRemoteHandler("employee:get-memory", (_, name) => remoteBackend.getMemory(String(name)));
  registerRemoteHandler("employee:add-memory", (_, name, content) =>
    remoteBackend.addMemory(String(name), String(content)));
  registerRemoteHandler("employee:delete-memory", (_, name, index) =>
    remoteBackend.deleteMemory(String(name), Number(index)));
  registerRemoteHandler("employee:generate-soul-draft", (_, input) =>
    remoteBackend.generateEmployeeSoulDraft(input as Record<string, unknown>));
  registerRemoteHandler("employee:get-sessions", (_, name) => remoteBackend.getEmployeeSessions(String(name)));
  registerRemoteHandler("employee:export", (_, name) => remoteBackend.exportEmployee(String(name)));
  registerRemoteHandler("employee:get-skills", (_, name) => remoteBackend.getEmployeeSkillsDir(String(name)));
  registerRemoteHandler("employee:remove-skill", (_, name, skillName) =>
    remoteBackend.removeEmployeeSkill(String(name), String(skillName)));

  registerRemoteHandler("skills:listInstalled", (_, profile) => remoteBackend.listInstalledSkills(profile as string | undefined));
  registerRemoteHandler("skills:listBundled", (_, profile) => remoteBackend.listBundledSkills(profile as string | undefined));
  registerRemoteHandler("skills:getContent", (_, skillPath) => remoteBackend.getSkillContent(String(skillPath)));
  registerRemoteHandler("skills:install", (_, identifier, profile) =>
    remoteBackend.installSkill(String(identifier), profile as string | undefined));
  registerRemoteHandler("skills:uninstall", (_, name, profile) =>
    remoteBackend.uninstallSkill(String(name), profile as string | undefined));
  registerRemoteHandler("skills:getConfig", (_, profile) => remoteBackend.getSkillConfig(profile as string | undefined));
  registerRemoteHandler("skills:setEnabled", (_, skillId, enabled, profile) =>
    remoteBackend.setSkillEnabled(String(skillId), enabled === true, profile as string | undefined));
  registerRemoteHandler("skills:recordUsage", (_, skillId, success, profile) =>
    remoteBackend.recordSkillUsage(String(skillId), success === true, profile as string | undefined));

  registerRemoteHandler("tools:mcp-list", () => remoteBackend.listMcpServers());
  registerRemoteHandler("tools:mcp-save", (_, input) => remoteBackend.saveMcpServer(input as Record<string, unknown>));
  registerRemoteHandler("tools:mcp-delete", (_, name) => remoteBackend.deleteMcpServer(String(name)));
  registerRemoteHandler("tools:mcp-test", (_, name) => remoteBackend.testMcpServer(String(name)));
  registerRemoteHandler("tools:mcp-parse", (_, description) => remoteBackend.parseMcpDescription(String(description)));

  registerRemoteHandler("get-session-messages", (_, sessionId, profileName) =>
    remoteBackend.getSessionMessages(String(sessionId), profileName as string | undefined));
  registerRemoteHandler("get-sessions", (_, limit, offset) =>
    remoteBackend.getSessions(Number(limit), Number(offset)));
  registerRemoteHandler("delete-session", (_, sessionId, profileName) =>
    remoteBackend.deleteSession(String(sessionId), profileName as string | undefined));
  registerRemoteHandler("delete-session-message", (_, sessionId, messageId, profileName) =>
    remoteBackend.deleteSessionMessage(String(sessionId), Number(messageId), profileName as string | undefined));
  registerRemoteHandler("search-sessions", (_, query, profileName) =>
    remoteBackend.searchSessions(String(query), profileName as string | undefined));
  registerRemoteHandler("get-usage-stats", (_, days) => remoteBackend.getUsageStats(Number(days)));
  registerRemoteHandler("get-token-stats", (_, days) => remoteBackend.getTokenStats(Number(days)));
  registerRemoteHandler("get-cron-jobs", (_, profile) => remoteBackend.getCronJobs(profile as string | undefined));
  registerRemoteHandler("create-cron-job", (_, job) => remoteBackend.createCronJob(job as Record<string, unknown>));
  registerRemoteHandler("pause-cron-job", (_, jobId, profile) =>
    remoteBackend.pauseCronJob(String(jobId), profile as string | undefined));
  registerRemoteHandler("resume-cron-job", (_, jobId, profile) =>
    remoteBackend.resumeCronJob(String(jobId), profile as string | undefined));
  registerRemoteHandler("trigger-cron-job", (_, jobId, profile) =>
    remoteBackend.triggerCronJob(String(jobId), profile as string | undefined));
  registerRemoteHandler("update-cron-job-deliver", (_, jobId, deliver, profile) =>
    remoteBackend.updateCronJobDeliver(String(jobId), String(deliver), profile as string | undefined));
  registerRemoteHandler("update-cron-job", (_, jobId, updates, profile) =>
    remoteBackend.updateCronJob(String(jobId), updates as Record<string, string>, profile as string | undefined));
  registerRemoteHandler("delete-cron-job", (_, jobId, profile) =>
    remoteBackend.deleteCronJob(String(jobId), profile as string | undefined));
  registerRemoteHandler("get-cron-history", (_, limit, offset) =>
    remoteBackend.getCronHistory(Number(limit), Number(offset)));

  registerRemoteHandler("stage-attachment", (_, sessionId, filename, base64Bytes) =>
    remoteBackend.stageAttachment(String(sessionId), String(filename), String(base64Bytes)));
  registerRemoteHandler("abort-chat", (_, profileName) => remoteBackend.abortChat(String(profileName)));
}
