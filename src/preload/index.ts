import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

export interface ChatUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  cost?: number
}

export interface EmployeeInfo {
  name: string
  displayName: string
  role: string
  avatar: string
  color: string
  tags: string[]
  petSlug: string
  model: string
  provider: string
  isActive: boolean
  hasSoul: boolean
  hasEnv: boolean
  gateway_port: number
  idle_timeout: number
  created_at: string
  status?: string
}

export interface SkillInfo {
  name: string;
  path: string;
}

export interface InstalledSkill {
  id: string;
  name: string;
  category: string;
  description: string;
  path: string;
  type: 'prompt' | 'tool' | 'workflow';
  enabled: boolean;
  source: 'official' | 'custom';
  version?: string;
  requiredTools?: string[];
  stats?: SkillUsageStats;
}

export interface BundledSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  source: string;
  installed: boolean;
  type: 'prompt' | 'tool' | 'workflow';
  version?: string;
  requiredTools?: string[];
}

export interface SkillUsageStats {
  uses: number;
  successes: number;
  failures: number;
  xp: number;
  lastUsedAt: number | null;
}

export interface SkillConfig {
  enabled: Record<string, boolean>;
  stats: Record<string, SkillUsageStats>;
  updatedAt?: number;
}

export interface ToolsetInfo {
  key: string
  label: string
  description: string
  enabled: boolean
}

export interface SessionInfo {
  id: string
  title: string | null
  startedAt: number
  source: string
  messageCount: number
  model: string
  preview: string
}

export interface SearchResult {
  sessionId: string
  title: string | null
  startedAt: number
  source: string
  messageCount: number
  model: string
  snippet: string
}

export interface ApprovalRequest {
  id: string
  employeeId: string
  tool: string
  args: Record<string, unknown>
  riskLevel: 'low' | 'medium' | 'high'
}

export interface EmployeeStatusEvent {
  employeeId: string
  status: 'awake' | 'sleeping' | 'busy' | 'error'
  previousStatus?: string
}

export interface MemoryEntry {
  index: number
  content: string
}

export interface MemoryData {
  memory: MemoryEntry[]
  user: string
  stats: Record<string, unknown>
  memoryCharCount?: number
  memoryCharLimit?: number
  userCharCount?: number
  userCharLimit?: number
}

export interface CronJob {
  id: string
  name: string
  employeeId: string
  schedule: string
  prompt: string
  enabled: boolean
  lastRun: number | null
  nextRun: number | null
}

export interface CronHistoryEntry {
  id: string
  jobId: string
  employeeId: string
  triggeredAt: number
  completedAt: number | null
  status: 'running' | 'completed' | 'failed'
  error?: string
}

export interface ModelConfig {
  provider: string
  model: string
  baseUrl?: string
  apiKey?: string
  temperature?: number
  maxTokens?: number
}

export interface SavedModel {
  id: string
  name: string
  provider: string
  model: string
  baseUrl: string
  apiKey: string
  createdAt: number
}

export interface PetInfo {
  slug: string
  name: string
  spritesheetUrl: string
  tags?: string[]
  vibes?: string[]
  kind?: string
  frameWidth?: number
  frameHeight?: number
  states?: string[]
}

export interface AvailableModel {
  id: string
  name: string
  provider: string
  contextLength?: number
}

export interface PluginInfo {
  name: string
  version: string
  description: string
  enabled: boolean
  config?: Record<string, unknown>
}

export interface UsageStats {
  totals: Record<string, unknown>
  by_model: Array<Record<string, unknown>>
  daily: Array<Record<string, unknown>>
}

export interface TokenStats {
  totals: Record<string, unknown>
  byModel: Array<Record<string, unknown>>
  byAgent: Array<Record<string, unknown>>
  daily: Array<Record<string, unknown>>
  agents: string[]
}

export type ThemeMode = 'dark' | 'light' | 'auto'
export type AccentColor = 'violet' | 'indigo' | 'blue' | 'green' | 'orange' | 'lavender' | 'rose' | 'slate'
export type UiTheme = 'classic' | 'cultivation'

const hermesAPI = {
  authLogin: (password: string): Promise<{ success: boolean; error?: string; user?: { id: string; username: string; displayName: string } }> =>
    ipcRenderer.invoke('auth-login', password),

  authLogout: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('auth-logout'),

  authGetCurrent: (): Promise<{ id: string; username: string; displayName: string } | null> =>
    ipcRenderer.invoke('auth-get-current'),

  authChangePassword: (
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('auth-change-password', oldPassword, newPassword),

  authSetupPassword: (password: string): Promise<{ success: boolean; error?: string; user?: { id: string; username: string; displayName: string } }> =>
    ipcRenderer.invoke('auth-setup-password', password),

  checkInitialized: (): Promise<boolean> =>
    ipcRenderer.invoke('check-initialized'),

  listEmployees: (): Promise<EmployeeInfo[]> =>
    ipcRenderer.invoke('employee:list'),

  getEmployee: (name: string): Promise<EmployeeInfo | null> =>
    ipcRenderer.invoke('employee:get', name),

  createEmployee: (
    name: string,
    options?: {
      displayName?: string
      role?: string
      avatar?: string
      model?: string
      provider?: string
      base_url?: string
      api_key?: string
      soul?: string
      petSlug?: string
      wakeUp?: boolean
    }
  ): Promise<{ success: boolean; name?: string; error?: string }> =>
    ipcRenderer.invoke('employee:create', { name, ...options }),

  updateEmployee: (
    name: string,
    changes: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:update', name, changes),

  deleteEmployee: (name: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:delete', name),

  wakeUpEmployee: (name: string): Promise<{ success: boolean; status?: string; error?: string }> =>
    ipcRenderer.invoke('employee:wake-up', name),

  sleepEmployee: (name: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('employee:sleep', name),

  restartEmployee: (name: string): Promise<{ success: boolean; status?: string; error?: string }> =>
    ipcRenderer.invoke('employee:restart', name),

  getEmployeeStatus: (name: string): Promise<string> =>
    ipcRenderer.invoke('employee:status', name),

  renameEmployee: (oldName: string, newName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:rename', oldName, newName),

  setEmployeePet: (name: string, petSlug: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:set-pet', name, petSlug),

  exportEmployee: (name: string): Promise<{ success: boolean; output?: string; error?: string }> =>
    ipcRenderer.invoke('employee:export', name),

  getEmployeeSoul: (name: string): Promise<string> =>
    ipcRenderer.invoke('employee:get-soul', name),

  setEmployeeSoul: (name: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:set-soul', name, content),

  resetEmployeeSoul: (name: string): Promise<{ success: boolean; soul?: string; error?: string }> =>
    ipcRenderer.invoke('employee:reset-soul', name),

  getEmployeeConfig: (name: string): Promise<Record<string, unknown> | null> =>
    ipcRenderer.invoke('employee:get-config', name),

  setEmployeeConfig: (name: string, configObj: Record<string, unknown>): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:set-config', name, configObj),

  getEmployeeEnv: (name: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('employee:get-env', name),

  setEmployeeEnv: (name: string, envObj: Record<string, string>): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:set-env', name, envObj),

  getEmployeeSkills: (name: string): Promise<SkillInfo[]> =>
    ipcRenderer.invoke('employee:get-skills', name),

  removeSkill: (name: string, skillName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:remove-skill', name, skillName),

  getEmployeeTools: (name: string): Promise<string[]> =>
    ipcRenderer.invoke('employee:get-tools', name),

  setEmployeeTools: (name: string, tools: string[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('employee:set-tools', name, tools),

  toggleTool: (name: string, toolKey: string, enabled: boolean): Promise<{ success: boolean; tools?: string[]; error?: string }> =>
    ipcRenderer.invoke('employee:toggle-tool', name, toolKey, enabled),

  getEmployeeMemory: (name: string): Promise<MemoryData> =>
    ipcRenderer.invoke("employee:get-memory", name),

  addMemory: (name: string, content: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("employee:add-memory", name, content),

  deleteMemory: (name: string, index: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("employee:delete-memory", name, index),

  listInstalledSkills: (profile?: string): Promise<InstalledSkill[]> =>
    ipcRenderer.invoke("skills:listInstalled", profile),

  listBundledSkills: (profile?: string): Promise<BundledSkill[]> =>
    ipcRenderer.invoke("skills:listBundled", profile),

  getSkillContent: (skillPath: string): Promise<string> =>
    ipcRenderer.invoke("skills:getContent", skillPath),

  installSkill: (identifier: string, profile?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("skills:install", identifier, profile),

  uninstallSkill: (name: string, profile?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("skills:uninstall", name, profile),

  getSkillConfig: (profile?: string): Promise<SkillConfig> =>
    ipcRenderer.invoke("skills:getConfig", profile),

  setSkillEnabled: (skillId: string, enabled: boolean, profile?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke("skills:setEnabled", skillId, enabled, profile),

  recordSkillUsage: (skillId: string, success: boolean, profile?: string): Promise<{ success: boolean; stats?: SkillUsageStats; error?: string }> =>
    ipcRenderer.invoke("skills:recordUsage", skillId, success, profile),

  getEmployeeSessions: (name: string): Promise<Array<Record<string, unknown>>> =>
    ipcRenderer.invoke('employee:get-sessions', name),

  sendMessage: (profileName: string, message: string, history?: Array<{ role: string; content: string }>, resumeSessionId?: string): Promise<void> =>
    ipcRenderer.invoke('send-message', profileName, message, history, resumeSessionId),

  abortChat: (profileName: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('abort-chat', profileName),

  sendApproval: (profileName: string, approvalId: string, approved: boolean): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('send-approval', profileName, approvalId, approved),

  healthCheck: (profileName: string): Promise<{ online: boolean }> =>
    ipcRenderer.invoke('health-check', profileName),

  getSessions: (limit?: number, offset?: number): Promise<Array<Record<string, unknown>>> =>
    ipcRenderer.invoke('get-sessions', limit ?? 50, offset ?? 0),

  deleteSession: (sessionId: string, profileName?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('delete-session', sessionId, profileName),

  getSessionMessages: (sessionId: string, profileName?: string): Promise<Array<Record<string, unknown>>> =>
    ipcRenderer.invoke('get-session-messages', sessionId, profileName),

  searchSessions: (query: string, profileName?: string): Promise<Array<Record<string, unknown>>> =>
    ipcRenderer.invoke('search-sessions', query, profileName),

  getUsageStats: (days?: number): Promise<UsageStats> =>
    ipcRenderer.invoke('get-usage-stats', days ?? 30),

  getTokenStats: (days?: number): Promise<TokenStats> =>
    ipcRenderer.invoke('get-token-stats', days ?? 30),

  getCronJobs: (profile?: string): Promise<unknown[]> =>
    ipcRenderer.invoke('get-cron-jobs', profile),

  createCronJob: (job: {
    name?: string
    schedule: string
    prompt: string
    deliver?: string
    profile?: string
  }): Promise<{ success: boolean; output?: string }> =>
    ipcRenderer.invoke('create-cron-job', job),

  pauseCronJob: (jobId: string, profile?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('pause-cron-job', jobId, profile),

  resumeCronJob: (jobId: string, profile?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('resume-cron-job', jobId, profile),

  triggerCronJob: (jobId: string, profile?: string): Promise<{ success: boolean; output?: string }> =>
    ipcRenderer.invoke('trigger-cron-job', jobId, profile),

  updateCronJobDeliver: (jobId: string, deliver: string, profile?: string): Promise<{ success: boolean; output?: string }> =>
    ipcRenderer.invoke('update-cron-job-deliver', jobId, deliver, profile),

  updateCronJob: (jobId: string, updates: Record<string, string>, profile?: string): Promise<{ success: boolean; output?: string }> =>
    ipcRenderer.invoke('update-cron-job', jobId, updates, profile),

  deleteCronJob: (jobId: string, profile?: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('delete-cron-job', jobId, profile),

  getCronHistory: (limit?: number, offset?: number): Promise<Array<Record<string, unknown>>> =>
    ipcRenderer.invoke('get-cron-history', limit ?? 50, offset ?? 0),

  runHermesBackup: (): Promise<{ success: boolean; output?: string }> =>
    ipcRenderer.invoke('run-hermes-backup'),

  runHermesImport: (filePath: string): Promise<{ success: boolean; output?: string }> =>
    ipcRenderer.invoke('run-hermes-import', filePath),

  getConfig: (): Promise<Record<string, unknown> | null> =>
    ipcRenderer.invoke('get-config'),

  getEnv: (): Promise<Record<string, string>> =>
    ipcRenderer.invoke('get-env'),

  getHermesHome: (): Promise<string> =>
    ipcRenderer.invoke('get-hermes-home'),

  checkHermesInstall: (): Promise<{
    installed: boolean
    configured: boolean
    hasApiKey: boolean
    version: string | null
  }> =>
    ipcRenderer.invoke('check-hermes-install'),

  checkInstall: (): Promise<{ installed: boolean; configured: boolean; hasApiKey: boolean }> =>
    ipcRenderer.invoke('check-install'),

  verifyInstall: (): Promise<{ installed: boolean; version?: string; error?: string }> =>
    ipcRenderer.invoke('verify-install'),

  startInstall: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('start-install'),

  getModelConfig: (): Promise<{ provider: string; model: string; baseUrl: string }> =>
    ipcRenderer.invoke('get-model-config'),

  getAvailableModels: (): Promise<{ models: Array<Record<string, unknown>> }> =>
    ipcRenderer.invoke('get-available-models'),

  setModel: (modelName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('set-model', modelName),

  setModelConfig: (modelConfig: { model?: string; provider?: string; baseUrl?: string }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('set-model-config', modelConfig),

  listSavedModels: (): Promise<SavedModel[]> =>
    ipcRenderer.invoke('list-saved-models'),

  addSavedModel: (
    name: string,
    provider: string,
    model: string,
    baseUrl: string,
    apiKey: string
  ): Promise<SavedModel> =>
    ipcRenderer.invoke('add-saved-model', name, provider, model, baseUrl, apiKey),

  removeSavedModel: (id: string): Promise<boolean> =>
    ipcRenderer.invoke('remove-saved-model', id),

  updateSavedModel: (
    id: string,
    name: string,
    provider: string,
    model: string,
    baseUrl: string,
    apiKey: string
  ): Promise<{ success: boolean; entry?: SavedModel; error?: string }> =>
    ipcRenderer.invoke('update-saved-model', id, name, provider, model, baseUrl, apiKey),

  applySavedModel: (id: string, profileName?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('apply-saved-model', id, profileName),

  getPlugins: (): Promise<Array<{ name: string; path: string }>> =>
    ipcRenderer.invoke('get-plugins'),

  getPluginInfo: (name: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('get-plugin-info', name),

  getThemeMode: (): Promise<string> =>
    ipcRenderer.invoke('get-theme-mode'),

  setThemeMode: (mode: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('set-theme-mode', mode),

  getAccentColor: (): Promise<string> =>
    ipcRenderer.invoke('get-accent-color'),

  setAccentColor: (accent: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('set-accent-color', accent),

  getUiTheme: (): Promise<string> =>
    ipcRenderer.invoke('get-ui-theme'),

  setUiTheme: (theme: string): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('set-ui-theme', theme),

  readLogs: (logFile?: string, lines?: number): Promise<{ content: string; path: string }> =>
    ipcRenderer.invoke('read-logs', logFile, lines ?? 300),

  clearLogs: (logFile?: string): Promise<{ success: boolean; path?: string }> =>
    ipcRenderer.invoke('clear-logs', logFile),

  getAppConfig: (): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke('get-app-config'),

  setAppConfig: (config: Record<string, unknown>): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('set-app-config', config),

  saveWallpaperFile: (dataUrl: string): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke('save-wallpaper-file', dataUrl),

  getHermesVersion: (): Promise<string | null> =>
    ipcRenderer.invoke('get-hermes-version'),

  refreshHermesVersion: (): Promise<string | null> =>
    ipcRenderer.invoke('refresh-hermes-version'),

  runHermesDoctor: (): Promise<string> =>
    ipcRenderer.invoke('run-hermes-doctor'),

  runHermesUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('run-hermes-update'),

  checkAppUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('check-app-update'),

  downloadAppUpdate: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('download-app-update'),

  installAppUpdate: (): Promise<void> =>
    ipcRenderer.invoke('install-app-update'),

  getAppVersion: (): Promise<string> =>
    ipcRenderer.invoke('get-app-version'),

  onInstallProgress: (callback: (progress: { step: number; totalSteps: number; title: string; detail: string; log: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, progress: unknown): void =>
      callback(progress as { step: number; totalSteps: number; title: string; detail: string; log: string })
    ipcRenderer.on('install-progress', handler)
    return () => ipcRenderer.removeListener('install-progress', handler)
  },

  onChatChunk: (callback: (data: { profileName: string; chunk: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { profileName: string; chunk: string }): void =>
      callback(data)
    ipcRenderer.on('chat-chunk', handler)
    return () => ipcRenderer.removeListener('chat-chunk', handler)
  },

  onChatDone: (callback: (data: { profileName: string; sessionId?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { profileName: string; sessionId?: string }): void =>
      callback(data)
    ipcRenderer.on('chat-done', handler)
    return () => ipcRenderer.removeListener('chat-done', handler)
  },

  onChatError: (callback: (data: { profileName: string; error: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: { profileName: string; error: string }): void =>
      callback(data)
    ipcRenderer.on('chat-error', handler)
    return () => ipcRenderer.removeListener('chat-error', handler)
  },

  onChatToolProgress: (callback: (data: { profileName: string; tool: string; toolName: string; args: unknown; result: unknown; error: unknown; status: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; tool: string; toolName: string; args: unknown; result: unknown; error: unknown; status: string })
    ipcRenderer.on('chat-tool-progress', handler)
    return () => ipcRenderer.removeListener('chat-tool-progress', handler)
  },

  onChatToolStart: (callback: (data: { profileName: string; toolName: string; args: unknown }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; toolName: string; args: unknown })
    ipcRenderer.on('chat-tool-start', handler)
    return () => ipcRenderer.removeListener('chat-tool-start', handler)
  },

  onChatToolEnd: (callback: (data: { profileName: string; toolName: string; result: unknown; error: unknown }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; toolName: string; result: unknown; error: unknown })
    ipcRenderer.on('chat-tool-end', handler)
    return () => ipcRenderer.removeListener('chat-tool-end', handler)
  },

  onChatApprovalRequest: (callback: (data: { profileName: string; approvalId: string; tool: string; command: string; risk: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; approvalId: string; tool: string; command: string; risk: string })
    ipcRenderer.on('chat-approval-request', handler)
    return () => ipcRenderer.removeListener('chat-approval-request', handler)
  },

  onChatThinking: (callback: (data: { profileName: string; chunk: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; chunk: string })
    ipcRenderer.on('chat-thinking', handler)
    return () => ipcRenderer.removeListener('chat-thinking', handler)
  },

  onChatUsage: (callback: (data: { profileName: string; promptTokens: number; completionTokens: number; totalTokens: number }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; promptTokens: number; completionTokens: number; totalTokens: number })
    ipcRenderer.on('chat-usage', handler)
    return () => ipcRenderer.removeListener('chat-usage', handler)
  },

  onEmployeeStatusChanged: (callback: (data: { profileName: string; status: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string; status: string })
    ipcRenderer.on('employee-status-changed', handler)
    return () => ipcRenderer.removeListener('employee-status-changed', handler)
  },

  onEmployeeListChanged: (callback: (data: { action: string; name: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { action: string; name: string })
    ipcRenderer.on('employee-list-changed', handler)
    return () => ipcRenderer.removeListener('employee-list-changed', handler)
  },

  onEmployeeIdleTimeout: (callback: (data: { profileName: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { profileName: string })
    ipcRenderer.on('employee-idle-timeout', handler)
    return () => ipcRenderer.removeListener('employee-idle-timeout', handler)
  },

  onNewConversation: (callback: (data: { employeeId: string; sessionId: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { employeeId: string; sessionId: string })
    ipcRenderer.on('new-conversation', handler)
    return () => ipcRenderer.removeListener('new-conversation', handler)
  },

  onUpdateStatus: (callback: (data: { status: string; version?: string; percent?: number; error?: string }) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: unknown): void =>
      callback(data as { status: string; version?: string; percent?: number; error?: string })
    ipcRenderer.on('update-status', handler)
    return () => ipcRenderer.removeListener('update-status', handler)
  },

  windowMinimize: (): Promise<void> =>
    ipcRenderer.invoke('window-minimize'),

  windowMaximize: (): Promise<void> =>
    ipcRenderer.invoke('window-maximize'),

  windowClose: (): Promise<void> =>
    ipcRenderer.invoke('window-close'),

  windowIsMaximized: (): Promise<boolean> =>
    ipcRenderer.invoke('window-is-maximized'),

  listPets: (): Promise<PetInfo[]> =>
    ipcRenderer.invoke('pets:list'),

  getPetSpritesheet: (slug: string): Promise<string | null> =>
    ipcRenderer.invoke('pets:get-spritesheet', slug),

  refreshPetManifest: (): Promise<PetInfo[]> =>
    ipcRenderer.invoke('pets:refresh-manifest'),

  getAppLogs: (options?: { level?: string; lines?: number }): Promise<Array<{ timestamp: string; level: string; module: string; message: string; data?: unknown }>> =>
    ipcRenderer.invoke('get-app-logs', options),

  clearAppLogs: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('clear-app-logs'),

  getLogFilePath: (): Promise<string> =>
    ipcRenderer.invoke('get-log-file-path'),
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electronAPI', electronAPI)
    contextBridge.exposeInMainWorld('hermesAPI', hermesAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  ;(window as unknown as Record<string, unknown>).electronAPI = electronAPI
  ;(window as unknown as Record<string, unknown>).hermesAPI = hermesAPI
}
