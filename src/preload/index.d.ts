import type { ElectronAPI } from '@electron-toolkit/preload'
import type { Attachment } from '../shared/attachments'
export type { Attachment, AttachmentKind } from '../shared/attachments'

export type ThemeMode = 'dark' | 'light' | 'auto'
export type AccentColor = 'violet' | 'indigo' | 'blue' | 'green' | 'orange' | 'lavender' | 'rose' | 'slate'
export type UiTheme = 'classic' | 'cultivation'

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
  name: string
  path: string
}

export interface InstalledSkill {
  id: string
  name: string
  category: string
  description: string
  path: string
  type: 'prompt' | 'tool' | 'workflow'
  enabled: boolean
  source: 'official' | 'custom'
  version?: string
  requiredTools?: string[]
  stats?: SkillUsageStats
}

export interface BundledSkill {
  id: string
  name: string
  description: string
  category: string
  source: string
  installed: boolean
  type: 'prompt' | 'tool' | 'workflow'
  version?: string
  requiredTools?: string[]
}

export interface SkillUsageStats {
  uses: number
  successes: number
  failures: number
  xp: number
  lastUsedAt: number | null
}

export interface SkillConfig {
  enabled: Record<string, boolean>
  stats: Record<string, SkillUsageStats>
  updatedAt?: number
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

interface HermesAPI {
  authLogin: (password: string) => Promise<{ success: boolean; error?: string; user?: { id: string; username: string; displayName: string } }>
  authLogout: () => Promise<{ success: boolean }>
  authGetCurrent: () => Promise<{ id: string; username: string; displayName: string } | null>
  authChangePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>
  authSetupPassword: (password: string) => Promise<{ success: boolean; error?: string; user?: { id: string; username: string; displayName: string } }>
  checkInitialized: () => Promise<boolean>

  listEmployees: () => Promise<EmployeeInfo[]>
  getEmployee: (name: string) => Promise<EmployeeInfo | null>
  createEmployee: (name: string, options?: {
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
  }) => Promise<{ success: boolean; name?: string; error?: string }>
  updateEmployee: (name: string, changes: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  deleteEmployee: (name: string) => Promise<{ success: boolean; error?: string }>
  wakeUpEmployee: (name: string) => Promise<{ success: boolean; status?: string; error?: string }>
  sleepEmployee: (name: string) => Promise<{ success: boolean }>
  restartEmployee: (name: string) => Promise<{ success: boolean; status?: string; error?: string }>
  getEmployeeStatus: (name: string) => Promise<string>
  renameEmployee: (oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>
  setEmployeePet: (name: string, petSlug: string) => Promise<{ success: boolean; error?: string }>
  exportEmployee: (name: string) => Promise<{ success: boolean; output?: string; error?: string }>

  getEmployeeSoul: (name: string) => Promise<string>
  setEmployeeSoul: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
  resetEmployeeSoul: (name: string) => Promise<{ success: boolean; soul?: string; error?: string }>

  getEmployeeConfig: (name: string) => Promise<Record<string, unknown> | null>
  setEmployeeConfig: (name: string, configObj: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  getEmployeeEnv: (name: string) => Promise<Record<string, string>>
  setEmployeeEnv: (name: string, envObj: Record<string, string>) => Promise<{ success: boolean; error?: string }>

  getEmployeeSkills: (name: string) => Promise<SkillInfo[]>
  removeSkill: (name: string, skillName: string) => Promise<{ success: boolean; error?: string }>

  listInstalledSkills: (profile?: string) => Promise<InstalledSkill[]>
  listBundledSkills: (profile?: string) => Promise<BundledSkill[]>
  getSkillContent: (skillPath: string) => Promise<string>
  installSkill: (identifier: string, profile?: string) => Promise<{ success: boolean; error?: string }>
  uninstallSkill: (name: string, profile?: string) => Promise<{ success: boolean; error?: string }>
  getSkillConfig: (profile?: string) => Promise<SkillConfig>
  setSkillEnabled: (skillId: string, enabled: boolean, profile?: string) => Promise<{ success: boolean; error?: string }>
  recordSkillUsage: (skillId: string, success: boolean, profile?: string) => Promise<{ success: boolean; stats?: SkillUsageStats; error?: string }>

  getEmployeeTools: (name: string) => Promise<string[]>
  setEmployeeTools: (name: string, tools: string[]) => Promise<{ success: boolean; error?: string }>
  toggleTool: (name: string, toolKey: string, enabled: boolean) => Promise<{ success: boolean; tools?: string[]; error?: string }>

  getEmployeeMemory: (name: string) => Promise<MemoryData>
  addMemory: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
  deleteMemory: (name: string, index: number) => Promise<{ success: boolean; error?: string }>

  getEmployeeSessions: (name: string) => Promise<Array<Record<string, unknown>>>

  sendMessage: (profileName: string, message: string, history?: Array<{ role: string; content: string }>, resumeSessionId?: string, attachments?: Attachment[]) => Promise<void>
  getPathForFile: (file: File) => string
  stageAttachment: (sessionId: string, filename: string, base64Bytes: string) => Promise<string>
  abortChat: (profileName: string) => Promise<{ success: boolean }>
  sendApproval: (profileName: string, approvalId: string, approved: boolean) => Promise<{ success: boolean; error?: string }>
  healthCheck: (profileName: string) => Promise<{ online: boolean }>

  getSessions: (limit?: number, offset?: number) => Promise<Array<Record<string, unknown>>>
  deleteSession: (sessionId: string, profileName?: string) => Promise<{ success: boolean; error?: string }>
  getSessionMessages: (sessionId: string, profileName?: string) => Promise<Array<Record<string, unknown>>>
  searchSessions: (query: string, profileName?: string) => Promise<Array<Record<string, unknown>>>
  getUsageStats: (days?: number) => Promise<UsageStats>

  getTokenStats: (days?: number) => Promise<TokenStats>

  getCronJobs: (profile?: string) => Promise<unknown[]>
  createCronJob: (job: { name?: string; schedule: string; prompt: string; deliver?: string; profile?: string }) => Promise<{ success: boolean; output?: string }>
  pauseCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean }>
  resumeCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean }>
  triggerCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean; output?: string }>
  updateCronJobDeliver: (jobId: string, deliver: string, profile?: string) => Promise<{ success: boolean; output?: string }>
  updateCronJob: (jobId: string, updates: Record<string, string>, profile?: string) => Promise<{ success: boolean; output?: string }>
  deleteCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean }>
  runHermesBackup: () => Promise<{ success: boolean; output?: string }>
  runHermesImport: (filePath: string) => Promise<{ success: boolean; output?: string }>
  getCronHistory: (limit?: number, offset?: number) => Promise<Array<Record<string, unknown>>>

  getConfig: () => Promise<Record<string, unknown> | null>
  getEnv: () => Promise<Record<string, string>>
  getHermesHome: () => Promise<string>
  checkHermesInstall: () => Promise<{
    installed: boolean
    configured: boolean
    hasApiKey: boolean
    version: string | null
  }>
  checkInstall: () => Promise<{ installed: boolean; configured: boolean; hasApiKey: boolean }>
  verifyInstall: () => Promise<{ installed: boolean; version?: string; error?: string }>
  startInstall: () => Promise<{ success: boolean; error?: string }>
  getModelConfig: () => Promise<{ provider: string; model: string; baseUrl: string }>
  getAvailableModels: () => Promise<{ models: Array<Record<string, unknown>> }>
  setModel: (modelName: string) => Promise<{ success: boolean; error?: string }>
  setModelConfig: (modelConfig: { model?: string; provider?: string; baseUrl?: string }) => Promise<{ success: boolean; error?: string }>
  listSavedModels: () => Promise<SavedModel[]>
  addSavedModel: (name: string, provider: string, model: string, baseUrl: string, apiKey: string) => Promise<SavedModel>
  removeSavedModel: (id: string) => Promise<boolean>
  updateSavedModel: (id: string, name: string, provider: string, model: string, baseUrl: string, apiKey: string) => Promise<{ success: boolean; entry?: SavedModel; error?: string }>
  applySavedModel: (id: string, profileName?: string) => Promise<{ success: boolean; error?: string }>
  getPlugins: () => Promise<Array<{ name: string; path: string }>>
  getPluginInfo: (name: string) => Promise<Record<string, unknown>>
  getThemeMode: () => Promise<ThemeMode>
  setThemeMode: (mode: ThemeMode) => Promise<{ success: boolean }>
  getAccentColor: () => Promise<AccentColor>
  setAccentColor: (accent: AccentColor) => Promise<{ success: boolean }>
  getUiTheme: () => Promise<UiTheme>
  setUiTheme: (theme: UiTheme) => Promise<{ success: boolean }>
  readLogs: (logFile?: string, lines?: number) => Promise<{ content: string; path: string }>
  clearLogs: (logFile?: string) => Promise<{ success: boolean; path?: string }>
  getAppConfig: () => Promise<Record<string, unknown>>
  setAppConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>
  getRuntimeConfig: () => Promise<Record<string, unknown>>
  setRuntimeConfig: (runtime: Record<string, unknown>) => Promise<{ success: boolean }>
  restartAllEngines: () => Promise<{ success: boolean; restarted: number; total?: number }>
  saveWallpaperFile: (dataUrl: string) => Promise<{ success: boolean; path?: string; error?: string }>
  getHermesVersion: () => Promise<string | null>
  refreshHermesVersion: () => Promise<string | null>
  runHermesDoctor: () => Promise<string>
  runHermesUpdate: () => Promise<{ success: boolean; error?: string }>
  checkAppUpdate: () => Promise<{ success: boolean; error?: string }>
  downloadAppUpdate: () => Promise<{ success: boolean; error?: string }>
  installAppUpdate: () => Promise<void>
  getAppVersion: () => Promise<string>
  onInstallProgress: (callback: (progress: { step: number; totalSteps: number; title: string; detail: string; log: string }) => void) => () => void

  onChatChunk: (callback: (data: { profileName: string; chunk: string }) => void) => () => void
  onChatDone: (callback: (data: { profileName: string; sessionId?: string }) => void) => () => void
  onChatError: (callback: (data: { profileName: string; error: string }) => void) => () => void
  onChatToolProgress: (callback: (data: { profileName: string; tool: string; toolName: string; args: unknown; result: unknown; error: unknown; status: string }) => void) => () => void
  onChatToolStart: (callback: (data: { profileName: string; toolName: string; args: unknown }) => void) => () => void
  onChatToolEnd: (callback: (data: { profileName: string; toolName: string; result: unknown; error: unknown }) => void) => () => void
  onChatApprovalRequest: (callback: (data: { profileName: string; approvalId: string; tool: string; command: string; risk: string }) => void) => () => void
  onChatThinking: (callback: (data: { profileName: string; chunk: string }) => void) => () => void
  onChatUsage: (callback: (data: { profileName: string; promptTokens: number; completionTokens: number; totalTokens: number }) => void) => () => void
  onEmployeeStatusChanged: (callback: (data: { profileName: string; status: string }) => void) => () => void
  onEmployeeListChanged: (callback: (data: { action: string; name: string }) => void) => () => void
  onEmployeeIdleTimeout: (callback: (data: { profileName: string }) => void) => () => void
  onNewConversation: (callback: (data: { employeeId: string; sessionId: string }) => void) => () => void
  onCronSessionCreated: (callback: (data: { profileName: string; sessionId: string; title: string; startedAt: number }) => void) => () => void
  onUpdateStatus: (callback: (data: { status: string; version?: string; percent?: number; error?: string }) => void) => () => void

  windowMinimize: () => Promise<void>
  windowMaximize: () => Promise<void>
  windowClose: () => Promise<void>
  windowIsMaximized: () => Promise<boolean>

  listPets: () => Promise<PetInfo[]>
  getPetSpritesheet: (slug: string) => Promise<string | null>
  refreshPetManifest: () => Promise<PetInfo[]>

  getAppLogs: (options?: { level?: string; lines?: number }) => Promise<Array<{ timestamp: string; level: string; module: string; message: string; data?: unknown }>>
  clearAppLogs: () => Promise<{ success: boolean }>
  getLogFilePath: () => Promise<string>
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    hermesAPI: HermesAPI
  }
}
