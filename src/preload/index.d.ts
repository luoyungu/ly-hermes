import type { ElectronAPI } from '@electron-toolkit/preload'

export type ThemeName =
  | 'dark'
  | 'light'
  | 'ocean'
  | 'ocean-light'
  | 'forest'
  | 'forest-light'
  | 'sunset'
  | 'sunset-light'
  | 'lavender'
  | 'lavender-light'
  | 'midnight'
  | 'rose'
  | 'rose-light'
  | 'slate'

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
  name: string
  category: string
  description: string
  path: string
}

export interface BundledSkill {
  name: string
  description: string
  category: string
  source: string
  installed: boolean
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

export interface SessionMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  timestamp: number
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

interface HermesAPI {
  authLogin: (password: string) => Promise<{ success: boolean; error?: string; user?: { id: string; username: string; displayName: string } }>
  authLogout: () => Promise<{ success: boolean }>
  authGetCurrent: () => Promise<{ id: string; username: string; displayName: string } | null>
  authChangePassword: (oldPassword: string, newPassword: string) => Promise<{ success: boolean; error?: string }>

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
    wakeUp?: boolean
  }) => Promise<{ success: boolean; name?: string; error?: string }>
  updateEmployee: (name: string, changes: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
  deleteEmployee: (name: string) => Promise<{ success: boolean; error?: string }>
  wakeUpEmployee: (name: string) => Promise<{ success: boolean; status?: string; error?: string }>
  sleepEmployee: (name: string) => Promise<{ success: boolean }>
  restartEmployee: (name: string) => Promise<{ success: boolean; status?: string; error?: string }>
  getEmployeeStatus: (name: string) => Promise<string>
  renameEmployee: (oldName: string, newName: string) => Promise<{ success: boolean; error?: string }>
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

  getEmployeeTools: (name: string) => Promise<string[]>
  setEmployeeTools: (name: string, tools: string[]) => Promise<{ success: boolean; error?: string }>
  toggleTool: (name: string, toolKey: string, enabled: boolean) => Promise<{ success: boolean; tools?: string[]; error?: string }>

  getEmployeeMemory: (name: string) => Promise<MemoryData>
  addMemory: (name: string, content: string) => Promise<{ success: boolean; error?: string }>
  deleteMemory: (name: string, index: number) => Promise<{ success: boolean; error?: string }>

  getEmployeeSessions: (name: string) => Promise<Array<Record<string, unknown>>>

  sendMessage: (profileName: string, message: string, history?: Array<{ role: string; content: string }>) => Promise<void>
  abortChat: (profileName: string) => Promise<{ success: boolean }>
  sendApproval: (profileName: string, approvalId: string, approved: boolean) => Promise<{ success: boolean; error?: string }>
  healthCheck: (profileName: string) => Promise<{ online: boolean }>

  getSessions: (limit?: number, offset?: number) => Promise<Array<Record<string, unknown>>>
  getSessionMessages: (sessionId: string, profileName?: string) => Promise<Array<Record<string, unknown>>>
  deleteSession: (sessionId: string, profileName?: string) => Promise<{ success: boolean; error?: string }>
  searchSessions: (query: string) => Promise<Array<Record<string, unknown>>>
  getUsageStats: (days?: number) => Promise<UsageStats>

  getCronJobs: (profile?: string) => Promise<unknown[]>
  createCronJob: (job: { name?: string; schedule: string; prompt: string; deliver?: string; profile?: string }) => Promise<{ success: boolean; output?: string }>
  pauseCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean }>
  resumeCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean }>
  triggerCronJob: (jobId: string, profile?: string) => Promise<{ success: boolean }>
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
  getModelConfig: () => Promise<{ provider: string; model: string; baseUrl: string }>
  getAvailableModels: () => Promise<{ models: Array<Record<string, unknown>> }>
  setModel: (modelName: string) => Promise<{ success: boolean; error?: string }>
  listSavedModels: () => Promise<SavedModel[]>
  addSavedModel: (name: string, provider: string, model: string, baseUrl: string, apiKey: string) => Promise<SavedModel>
  removeSavedModel: (id: string) => Promise<boolean>
  updateSavedModel: (id: string, name: string, provider: string, model: string, baseUrl: string, apiKey: string) => Promise<{ success: boolean; entry?: SavedModel; error?: string }>
  applySavedModel: (id: string, profileName?: string) => Promise<{ success: boolean; error?: string }>
  getPlugins: () => Promise<Array<{ name: string; path: string }>>
  getPluginInfo: (name: string) => Promise<Record<string, unknown>>
  getTheme: () => Promise<string>
  setTheme: (theme: string) => Promise<{ success: boolean }>
  getAppConfig: () => Promise<Record<string, unknown>>
  setAppConfig: (config: Record<string, unknown>) => Promise<{ success: boolean }>
  saveWallpaperFile: (dataUrl: string) => Promise<{ success: boolean; path?: string; error?: string }>
  getHermesVersion: () => Promise<string | null>
  refreshHermesVersion: () => Promise<string | null>
  runHermesDoctor: () => Promise<string>
  runHermesUpdate: () => Promise<{ success: boolean; error?: string }>
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
  onEmployeeIdleTimeout: (callback: (data: { profileName: string }) => void) => () => void
  onNewConversation: (callback: (data: { employeeId: string; sessionId: string }) => void) => () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
    hermesAPI: HermesAPI
  }
}
