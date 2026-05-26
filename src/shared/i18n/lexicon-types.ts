export interface ThemeLexicon {
  appSubtitle: string
  nav: {
    chat: string
    manage: string
    schedule: string
    tools: string
    tokenStats: string
    appearance: string
    settings: string
    logs: string
    about: string
  }
  entities: {
    employee: string
    employeePlural: string
    employeeList: string
    virtualEmployee: string
    createEmployee: string
    selectEmployee: string
    searchEmployee: string
    noEmployees: string
    noEmployeeMatches: string
    defaultRole: string
    employeeInfo: string
    employeeDetail: string
    deleteEmployeeConfirm: string
  }
  concepts: {
    soul: string
    soulSetting: string
    soulEmpty: string
    tools: string
    enabledTools: string
    otherEnabledTools: string
    noTools: string
    skills: string
    skillLibrary: string
    noSkills: string
    memory: string
    memoryCapacity: string
    systemMemory: string
    noMemory: string
    userProfile: string
    config: string
  }
  chat: {
    startTitle: string
    startHint: (name: string) => string
    chooseEmployee: string
    statusLabel: string
    usageTitle: string
    noUsage: string
  }
  schedule: {
    title: string
    newSchedule: string
    createSchedule: string
    unnamed: string
    empty: string
    emptyForEmployee: string
    emptyHint: string
    deleteConfirm: string
    scheduleName: string
    promptPlaceholder: string
    success: string
  }
  usage: {
    title: string
    subtitle: string
    input: string
    output: string
    cache: string
    cost: string
    byAgent: string
    byModel: string
    dailyTrend: string
    days7: string
    days30: string
    days90: string
    noData: string
  }
  appearance: {
    themePack: string
    themePackDesc: string
  }
}
