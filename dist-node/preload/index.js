"use strict";
const electron = require("electron");
const preload = require("@electron-toolkit/preload");
const hermesAPI = {
  authLogin: (password) => electron.ipcRenderer.invoke("auth-login", password),
  authLogout: () => electron.ipcRenderer.invoke("auth-logout"),
  authGetCurrent: () => electron.ipcRenderer.invoke("auth-get-current"),
  authChangePassword: (oldPassword, newPassword) => electron.ipcRenderer.invoke("auth-change-password", oldPassword, newPassword),
  authSetupPassword: (password) => electron.ipcRenderer.invoke("auth-setup-password", password),
  checkInitialized: () => electron.ipcRenderer.invoke("check-initialized"),
  listEmployees: () => electron.ipcRenderer.invoke("employee:list"),
  getEmployee: (name) => electron.ipcRenderer.invoke("employee:get", name),
  createEmployee: (name, options) => electron.ipcRenderer.invoke("employee:create", { name, ...options }),
  updateEmployee: (name, changes) => electron.ipcRenderer.invoke("employee:update", name, changes),
  deleteEmployee: (name) => electron.ipcRenderer.invoke("employee:delete", name),
  wakeUpEmployee: (name) => electron.ipcRenderer.invoke("employee:wake-up", name),
  sleepEmployee: (name) => electron.ipcRenderer.invoke("employee:sleep", name),
  restartEmployee: (name) => electron.ipcRenderer.invoke("employee:restart", name),
  getEmployeeStatus: (name) => electron.ipcRenderer.invoke("employee:status", name),
  renameEmployee: (oldName, newName) => electron.ipcRenderer.invoke("employee:rename", oldName, newName),
  setEmployeePet: (name, petSlug) => electron.ipcRenderer.invoke("employee:set-pet", name, petSlug),
  exportEmployee: (name) => electron.ipcRenderer.invoke("employee:export", name),
  getEmployeeSoul: (name) => electron.ipcRenderer.invoke("employee:get-soul", name),
  setEmployeeSoul: (name, content) => electron.ipcRenderer.invoke("employee:set-soul", name, content),
  resetEmployeeSoul: (name) => electron.ipcRenderer.invoke("employee:reset-soul", name),
  getEmployeeConfig: (name) => electron.ipcRenderer.invoke("employee:get-config", name),
  setEmployeeConfig: (name, configObj) => electron.ipcRenderer.invoke("employee:set-config", name, configObj),
  getEmployeeEnv: (name) => electron.ipcRenderer.invoke("employee:get-env", name),
  setEmployeeEnv: (name, envObj) => electron.ipcRenderer.invoke("employee:set-env", name, envObj),
  getEmployeeSkills: (name) => electron.ipcRenderer.invoke("employee:get-skills", name),
  removeSkill: (name, skillName) => electron.ipcRenderer.invoke("employee:remove-skill", name, skillName),
  getEmployeeTools: (name) => electron.ipcRenderer.invoke("employee:get-tools", name),
  setEmployeeTools: (name, tools) => electron.ipcRenderer.invoke("employee:set-tools", name, tools),
  toggleTool: (name, toolKey, enabled) => electron.ipcRenderer.invoke("employee:toggle-tool", name, toolKey, enabled),
  getEmployeeMemory: (name) => electron.ipcRenderer.invoke("employee:get-memory", name),
  addMemory: (name, content) => electron.ipcRenderer.invoke("employee:add-memory", name, content),
  deleteMemory: (name, index) => electron.ipcRenderer.invoke("employee:delete-memory", name, index),
  listInstalledSkills: (profile) => electron.ipcRenderer.invoke("skills:listInstalled", profile),
  listBundledSkills: (profile) => electron.ipcRenderer.invoke("skills:listBundled", profile),
  getSkillContent: (skillPath) => electron.ipcRenderer.invoke("skills:getContent", skillPath),
  installSkill: (identifier, profile) => electron.ipcRenderer.invoke("skills:install", identifier, profile),
  uninstallSkill: (name, profile) => electron.ipcRenderer.invoke("skills:uninstall", name, profile),
  getEmployeeSessions: (name) => electron.ipcRenderer.invoke("employee:get-sessions", name),
  sendMessage: (profileName, message, history) => electron.ipcRenderer.invoke("send-message", profileName, message, history),
  abortChat: (profileName) => electron.ipcRenderer.invoke("abort-chat", profileName),
  sendApproval: (profileName, approvalId, approved) => electron.ipcRenderer.invoke("send-approval", profileName, approvalId, approved),
  healthCheck: (profileName) => electron.ipcRenderer.invoke("health-check", profileName),
  getSessions: (limit, offset) => electron.ipcRenderer.invoke("get-sessions", limit ?? 50, offset ?? 0),
  getSessionMessages: (sessionId, profileName) => electron.ipcRenderer.invoke("get-session-messages", sessionId, profileName),
  deleteSession: (sessionId, profileName) => electron.ipcRenderer.invoke("delete-session", sessionId, profileName),
  searchSessions: (query) => electron.ipcRenderer.invoke("search-sessions", query),
  getUsageStats: (days) => electron.ipcRenderer.invoke("get-usage-stats", days ?? 30),
  getCronJobs: (profile) => electron.ipcRenderer.invoke("get-cron-jobs", profile),
  createCronJob: (job) => electron.ipcRenderer.invoke("create-cron-job", job),
  pauseCronJob: (jobId, profile) => electron.ipcRenderer.invoke("pause-cron-job", jobId, profile),
  resumeCronJob: (jobId, profile) => electron.ipcRenderer.invoke("resume-cron-job", jobId, profile),
  triggerCronJob: (jobId, profile) => electron.ipcRenderer.invoke("trigger-cron-job", jobId, profile),
  deleteCronJob: (jobId, profile) => electron.ipcRenderer.invoke("delete-cron-job", jobId, profile),
  getCronHistory: (limit, offset) => electron.ipcRenderer.invoke("get-cron-history", limit ?? 50, offset ?? 0),
  runHermesBackup: () => electron.ipcRenderer.invoke("run-hermes-backup"),
  runHermesImport: (filePath) => electron.ipcRenderer.invoke("run-hermes-import", filePath),
  getConfig: () => electron.ipcRenderer.invoke("get-config"),
  getEnv: () => electron.ipcRenderer.invoke("get-env"),
  getHermesHome: () => electron.ipcRenderer.invoke("get-hermes-home"),
  checkHermesInstall: () => electron.ipcRenderer.invoke("check-hermes-install"),
  checkInstall: () => electron.ipcRenderer.invoke("check-install"),
  verifyInstall: () => electron.ipcRenderer.invoke("verify-install"),
  startInstall: () => electron.ipcRenderer.invoke("start-install"),
  getModelConfig: () => electron.ipcRenderer.invoke("get-model-config"),
  getAvailableModels: () => electron.ipcRenderer.invoke("get-available-models"),
  setModel: (modelName) => electron.ipcRenderer.invoke("set-model", modelName),
  setModelConfig: (modelConfig) => electron.ipcRenderer.invoke("set-model-config", modelConfig),
  listSavedModels: () => electron.ipcRenderer.invoke("list-saved-models"),
  addSavedModel: (name, provider, model, baseUrl, apiKey) => electron.ipcRenderer.invoke("add-saved-model", name, provider, model, baseUrl, apiKey),
  removeSavedModel: (id) => electron.ipcRenderer.invoke("remove-saved-model", id),
  updateSavedModel: (id, name, provider, model, baseUrl, apiKey) => electron.ipcRenderer.invoke("update-saved-model", id, name, provider, model, baseUrl, apiKey),
  applySavedModel: (id, profileName) => electron.ipcRenderer.invoke("apply-saved-model", id, profileName),
  getPlugins: () => electron.ipcRenderer.invoke("get-plugins"),
  getPluginInfo: (name) => electron.ipcRenderer.invoke("get-plugin-info", name),
  getTheme: () => electron.ipcRenderer.invoke("get-theme"),
  setTheme: (theme) => electron.ipcRenderer.invoke("set-theme", theme),
  getAppConfig: () => electron.ipcRenderer.invoke("get-app-config"),
  setAppConfig: (config) => electron.ipcRenderer.invoke("set-app-config", config),
  saveWallpaperFile: (dataUrl) => electron.ipcRenderer.invoke("save-wallpaper-file", dataUrl),
  getHermesVersion: () => electron.ipcRenderer.invoke("get-hermes-version"),
  refreshHermesVersion: () => electron.ipcRenderer.invoke("refresh-hermes-version"),
  runHermesDoctor: () => electron.ipcRenderer.invoke("run-hermes-doctor"),
  runHermesUpdate: () => electron.ipcRenderer.invoke("run-hermes-update"),
  checkAppUpdate: () => electron.ipcRenderer.invoke("check-app-update"),
  downloadAppUpdate: () => electron.ipcRenderer.invoke("download-app-update"),
  installAppUpdate: () => electron.ipcRenderer.invoke("install-app-update"),
  getAppVersion: () => electron.ipcRenderer.invoke("get-app-version"),
  onInstallProgress: (callback) => {
    const handler = (_event, progress) => callback(progress);
    electron.ipcRenderer.on("install-progress", handler);
    return () => electron.ipcRenderer.removeListener("install-progress", handler);
  },
  onChatChunk: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-chunk", handler);
    return () => electron.ipcRenderer.removeListener("chat-chunk", handler);
  },
  onChatDone: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-done", handler);
    return () => electron.ipcRenderer.removeListener("chat-done", handler);
  },
  onChatError: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-error", handler);
    return () => electron.ipcRenderer.removeListener("chat-error", handler);
  },
  onChatToolProgress: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-tool-progress", handler);
    return () => electron.ipcRenderer.removeListener("chat-tool-progress", handler);
  },
  onChatToolStart: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-tool-start", handler);
    return () => electron.ipcRenderer.removeListener("chat-tool-start", handler);
  },
  onChatToolEnd: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-tool-end", handler);
    return () => electron.ipcRenderer.removeListener("chat-tool-end", handler);
  },
  onChatApprovalRequest: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-approval-request", handler);
    return () => electron.ipcRenderer.removeListener("chat-approval-request", handler);
  },
  onChatThinking: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-thinking", handler);
    return () => electron.ipcRenderer.removeListener("chat-thinking", handler);
  },
  onChatUsage: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("chat-usage", handler);
    return () => electron.ipcRenderer.removeListener("chat-usage", handler);
  },
  onEmployeeStatusChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("employee-status-changed", handler);
    return () => electron.ipcRenderer.removeListener("employee-status-changed", handler);
  },
  onEmployeeListChanged: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("employee-list-changed", handler);
    return () => electron.ipcRenderer.removeListener("employee-list-changed", handler);
  },
  onEmployeeIdleTimeout: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("employee-idle-timeout", handler);
    return () => electron.ipcRenderer.removeListener("employee-idle-timeout", handler);
  },
  onNewConversation: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("new-conversation", handler);
    return () => electron.ipcRenderer.removeListener("new-conversation", handler);
  },
  onUpdateStatus: (callback) => {
    const handler = (_event, data) => callback(data);
    electron.ipcRenderer.on("update-status", handler);
    return () => electron.ipcRenderer.removeListener("update-status", handler);
  },
  windowMinimize: () => electron.ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => electron.ipcRenderer.invoke("window-maximize"),
  windowClose: () => electron.ipcRenderer.invoke("window-close"),
  windowIsMaximized: () => electron.ipcRenderer.invoke("window-is-maximized"),
  listPets: () => electron.ipcRenderer.invoke("pets:list"),
  getPetSpritesheet: (slug) => electron.ipcRenderer.invoke("pets:get-spritesheet", slug),
  refreshPetManifest: () => electron.ipcRenderer.invoke("pets:refresh-manifest")
};
if (process.contextIsolated) {
  try {
    electron.contextBridge.exposeInMainWorld("electronAPI", preload.electronAPI);
    electron.contextBridge.exposeInMainWorld("hermesAPI", hermesAPI);
  } catch (error) {
    console.error(error);
  }
} else {
  window.electronAPI = preload.electronAPI;
  window.hermesAPI = hermesAPI;
}
