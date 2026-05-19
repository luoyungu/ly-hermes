import type { ThemeMode, AccentColor, UiTheme } from '../../preload/index'

interface ImportMetaEnvVite {
  readonly MAIN_WINDOW_VITE_DEV_SERVER_URL: string
  readonly MAIN_WINDOW_VITE_NAME: string
}

interface ImportMetaVite {
  readonly env: ImportMetaEnvVite
}

declare global {
  interface HermesAPI {
    getConnectionConfig: () => Promise<import('../../preload/index').ConnectionConfig>
    setConnectionConfig: (
      mode: 'local' | 'remote' | 'ssh',
      remoteUrl: string,
      apiKey?: string
    ) => Promise<boolean>
    isRemoteMode: () => Promise<boolean>
    authLogin: (password: string) => Promise<{ success: boolean; error?: string }>
    authLogout: () => Promise<void>
    authGetCurrent: () => Promise<{ authenticated: boolean; user?: string } | null>
    sendMessage: (
      message: string,
      employeeId?: string,
      resumeSessionId?: string,
      history?: Array<{ role: string; content: string }>
    ) => Promise<{ response: string; sessionId?: string }>
    abortChat: () => Promise<void>
    onChatChunk: (callback: (chunk: string) => void) => () => void
    onChatDone: (callback: (sessionId?: string) => void) => () => void
    onChatError: (callback: (error: string) => void) => () => void
    onChatToolProgress: (callback: (tool: string) => void) => () => void
    onChatUsage: (callback: (usage: import('../../preload/index').ChatUsage) => void) => () => void
    listEmployees: () => Promise<import('../../preload/index').EmployeeInfo[]>
    employeeWakeUp: (employeeId: string) => Promise<boolean>
    employeeSleep: (employeeId: string) => Promise<boolean>
    employeeDelete: (employeeId: string) => Promise<{ success: boolean; error?: string }>
    employeeCreate: (
      name: string,
      clone?: string
    ) => Promise<{ success: boolean; employeeId?: string; error?: string }>
    employeeRename: (employeeId: string, name: string) => Promise<boolean>
    employeeGetSoul: (employeeId: string) => Promise<string>
    employeeSetSoul: (employeeId: string, content: string) => Promise<boolean>
    employeeGetTools: (employeeId: string) => Promise<import('../../preload/index').ToolsetInfo[]>
    employeeSetTools: (employeeId: string, key: string, enabled: boolean) => Promise<boolean>
    employeeGetSkills: (employeeId: string) => Promise<import('../../preload/index').SkillInfo[]>
    employeeInstallSkill: (
      employeeId: string,
      identifier: string
    ) => Promise<{ success: boolean; error?: string }>
    employeeRemoveSkill: (
      employeeId: string,
      name: string
    ) => Promise<{ success: boolean; error?: string }>
    employeeGetMemory: (
      employeeId: string
    ) => Promise<{
      memory: { content: string; exists: boolean; lastModified: number | null }
      user: { content: string; exists: boolean; lastModified: number | null }
    }>
    employeeGetConfig: (employeeId: string) => Promise<Record<string, string>>
    employeeSetConfig: (employeeId: string, key: string, value: string) => Promise<boolean>
    employeeGetEnv: (employeeId: string) => Promise<Record<string, string>>
    employeeSetEnv: (employeeId: string, key: string, value: string) => Promise<boolean>
    employeeExport: (employeeId: string) => Promise<string>
    employeeGetSessions: (
      employeeId: string,
      limit?: number,
      offset?: number
    ) => Promise<import('../../preload/index').SessionInfo[]>
    getSessionMessages: (
      sessionId: string
    ) => Promise<import('../../preload/index').SessionMessage[]>
    searchSessions: (
      query: string,
      limit?: number
    ) => Promise<import('../../preload/index').SearchResult[]>
    deleteSession: (sessionId: string) => Promise<boolean>
    getAppConfig: () => Promise<Record<string, string>>
    setAppConfig: (key: string, value: string) => Promise<boolean>
    getThemeMode: () => Promise<ThemeMode>
    setThemeMode: (mode: ThemeMode) => Promise<boolean>
    getAccentColor: () => Promise<AccentColor>
    setAccentColor: (accent: AccentColor) => Promise<boolean>
    getUiTheme: () => Promise<UiTheme>
    setUiTheme: (theme: UiTheme) => Promise<boolean>
    startGateway: (employeeId?: string) => Promise<boolean>
    stopGateway: (employeeId?: string) => Promise<boolean>
    gatewayStatus: (employeeId?: string) => Promise<boolean>
    healthCheck: () => Promise<{ ok: boolean; latency?: number; error?: string }>
    sendApproval: (approvalId: string, approved: boolean) => Promise<boolean>
    onApprovalRequest: (
      callback: (request: import('../../preload/index').ApprovalRequest) => void
    ) => () => void
    onEmployeeStatusChanged: (
      callback: (event: import('../../preload/index').EmployeeStatusEvent) => void
    ) => () => void
    onEmployeeIdleTimeout: (callback: (employeeId: string) => void) => () => void
    onNewConversation: (
      callback: (info: { employeeId: string; sessionId: string }) => void
    ) => () => void
  }
}
