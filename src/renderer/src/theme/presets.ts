import type { AccentColor, UiTheme } from '../../../preload/index'

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
    noData: string
  }
  appearance: {
    themePack: string
    themePackDesc: string
  }
}

export interface ThemePreset {
  id: UiTheme
  label: string
  desc: string
  swatch: string[]
  defaultAccent: AccentColor
  lexicon: ThemeLexicon
}

export const THEME_PRESETS: Record<UiTheme, ThemePreset> = {
  classic: {
    id: 'classic',
    label: '专业工作台',
    desc: '保留 Hermes 当前的清爽桌面工作站体验',
    swatch: ['#0d0d0f', '#7c6aef', '#5b8def'],
    defaultAccent: 'violet',
    lexicon: {
      appSubtitle: '多智能体 AI 工作站',
      nav: {
        chat: '对话',
        manage: '管理',
        schedule: '日程',
        tools: '工具',
        tokenStats: '用量',
        appearance: '外观',
        settings: '设置',
        logs: '日志',
        about: '关于',
      },
      entities: {
        employee: '员工',
        employeePlural: '员工',
        employeeList: '员工列表',
        virtualEmployee: '虚拟员工',
        createEmployee: '创建员工',
        selectEmployee: '选择员工',
        searchEmployee: '搜索员工...',
        noEmployees: '暂无员工',
        noEmployeeMatches: '未找到匹配员工',
        defaultRole: '员工',
        employeeInfo: '员工信息',
        employeeDetail: '员工详情',
        deleteEmployeeConfirm: '确认删除此员工？',
      },
      concepts: {
        soul: '灵魂',
        soulSetting: '灵魂设定',
        soulEmpty: '暂无灵魂设定',
        tools: '工具',
        enabledTools: '已启用工具',
        otherEnabledTools: '其他已启用工具',
        noTools: '暂无已启用工具',
        skills: '技能',
        skillLibrary: '技能库',
        noSkills: '暂无技能',
        memory: '记忆',
        memoryCapacity: '记忆容量',
        systemMemory: '系统记忆',
        noMemory: '暂无记忆',
        userProfile: '用户档案',
        config: '配置',
      },
      chat: {
        startTitle: '开始对话',
        startHint: (name) => `向 ${name} 发送消息开始对话，或使用 / 命令执行操作`,
        chooseEmployee: '选择左侧的员工开始对话',
        statusLabel: '员工',
        usageTitle: 'Token 用量',
        noUsage: '暂无用量数据',
      },
      schedule: {
        title: '日程',
        newSchedule: '新建日程',
        createSchedule: '创建日程',
        unnamed: '未命名日程',
        empty: '暂无日程任务',
        emptyForEmployee: '该员工暂无日程',
        emptyHint: '创建日程让虚拟员工自动执行定时任务',
        deleteConfirm: '确认删除此日程？',
        scheduleName: '日程名称',
        promptPlaceholder: '描述虚拟员工需要执行的任务...',
        success: '日程创建成功',
      },
      usage: {
        title: 'Token 使用统计',
        subtitle: '查看 Token 消耗分布',
        input: '输入 Token',
        output: '输出 Token',
        cache: '缓存读取',
        cost: '预估费用',
        byAgent: '按 Agent',
        noData: '暂无数据',
      },
      appearance: {
        themePack: '界面主题',
        themePackDesc: '主题会同时切换视觉风格和界面命名',
      },
    },
  },
  cultivation: {
    id: 'cultivation',
    label: '落云谷修仙',
    desc: '把工作台变成宗门中枢：门人、功法、法器、识海与灵力账簿',
    swatch: ['#14120d', '#b88a3d', '#6f8f75'],
    defaultAccent: 'orange',
    lexicon: {
      appSubtitle: 'AI 宗门中枢',
      nav: {
        chat: '传音',
        manage: '门人',
        schedule: '法旨',
        tools: '法器',
        tokenStats: '灵账',
        appearance: '天象',
        settings: '阵枢',
        logs: '天机录',
        about: '宗门',
      },
      entities: {
        employee: '门人',
        employeePlural: '门人',
        employeeList: '门人名册',
        virtualEmployee: '门人',
        createEmployee: '点化门人',
        selectEmployee: '选择门人',
        searchEmployee: '搜寻门人...',
        noEmployees: '暂无门人',
        noEmployeeMatches: '未找到匹配门人',
        defaultRole: '门人',
        employeeInfo: '门人命格',
        employeeDetail: '门人详情',
        deleteEmployeeConfirm: '确认逐出此门人？',
      },
      concepts: {
        soul: '道心',
        soulSetting: '道心设定',
        soulEmpty: '暂无道心设定',
        tools: '法器',
        enabledTools: '已启用法器',
        otherEnabledTools: '其他已启用法器',
        noTools: '暂无已启用法器',
        skills: '功法',
        skillLibrary: '藏经阁',
        noSkills: '暂无功法',
        memory: '识海',
        memoryCapacity: '识海容量',
        systemMemory: '识海玉简',
        noMemory: '识海暂无玉简',
        userProfile: '掌门档案',
        config: '阵法',
      },
      chat: {
        startTitle: '开始传音',
        startHint: (name) => `向 ${name} 传音，或使用 / 命令施展操作`,
        chooseEmployee: '选择左侧门人开始传音',
        statusLabel: '门人',
        usageTitle: '灵力消耗',
        noUsage: '暂无灵力消耗记录',
      },
      schedule: {
        title: '法旨',
        newSchedule: '新建法旨',
        createSchedule: '颁布法旨',
        unnamed: '未命名法旨',
        empty: '暂无宗门法旨',
        emptyForEmployee: '该门人暂无法旨',
        emptyHint: '颁布法旨，让门人按时闭关执行任务',
        deleteConfirm: '确认废止此法旨？',
        scheduleName: '法旨名称',
        promptPlaceholder: '描述门人需要闭关完成的任务...',
        success: '法旨已颁布',
      },
      usage: {
        title: '灵力账簿',
        subtitle: '查看灵力消耗与灵石估算',
        input: '纳入灵力',
        output: '吐纳灵力',
        cache: '灵脉回流',
        cost: '灵石估算',
        byAgent: '按门人',
        noData: '暂无账簿记录',
      },
      appearance: {
        themePack: '界面主题',
        themePackDesc: '切换宗门皮肤会同步改变视觉气质和命名体系',
      },
    },
  },
}

export const DEFAULT_UI_THEME: UiTheme = 'classic'

export function getThemePreset(theme: UiTheme): ThemePreset {
  return THEME_PRESETS[theme] || THEME_PRESETS[DEFAULT_UI_THEME]
}
