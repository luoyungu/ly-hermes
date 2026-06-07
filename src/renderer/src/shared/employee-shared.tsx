import { useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import {
  Globe,
  Terminal,
  FileText,
  Code,
  Eye,
  Image,
  Mic,
  Puzzle,
  Brain,
  Search,
  MessageSquare,
  UserPlus,
  Calendar,
  Zap,
  ListTodo,
} from 'lucide-react'

export function mapStatus(status: string): string {
  if (status === 'online') return 'awake'
  if (status === 'idle') return 'sleeping'
  if (status === 'starting') return 'busy'
  if (status === 'error') return 'error'
  return status || 'unknown'
}

const STATUS_KEYS: Record<string, string> = {
  awake: 'employee.status.awake',
  busy: 'employee.status.busy',
  sleeping: 'employee.status.sleeping',
  error: 'employee.status.error',
}

export function statusText(s: string, t?: TFunction): string {
  const key = STATUS_KEYS[s]
  if (key) return t ? t(key) : ({ awake: '在线', busy: '忙碌...', sleeping: '离线', error: '异常' } as Record<string, string>)[s]
  return s || (t ? t('employee.status.unknown') : '未知')
}

export function statusColor(s: string): string {
  if (s === 'awake') return 'var(--success)'
  if (s === 'busy') return 'var(--accent)'
  if (s === 'sleeping') return 'var(--text-dim)'
  if (s === 'error') return 'var(--danger)'
  return 'var(--text-dim)'
}

export function statusDotClass(s: string): string {
  if (s === 'awake') return 'bg-[var(--success)] shadow-[0_0_8px_rgba(34,197,94,0.4)]'
  if (s === 'busy') return 'bg-[var(--accent)] animate-pulse-custom'
  if (s === 'sleeping') return 'bg-[var(--text-dim)]'
  if (s === 'error') return 'bg-[var(--danger)] shadow-[0_0_8px_rgba(239,68,68,0.4)]'
  return 'bg-[var(--text-dim)]'
}

export const AVATARS = ['🧑‍💼', '👩‍💻', '🧑‍🔬', '👨‍🎨', '👩‍🏫', '🧑‍🍳', '👨‍🚀', '👩‍⚕️', '🧑‍🎤', '🤖', '🦊', '🐱', '🐶', '🦁', '🐼', '🐸']

export const TOOL_META: Record<string, { icon: React.ReactElement; label: string; desc: string }> = {
  web: { icon: <Globe size={18} />, label: '网页搜索', desc: '搜索互联网获取实时信息' },
  browser: { icon: <Globe size={18} />, label: '浏览器', desc: '浏览网页内容' },
  terminal: { icon: <Terminal size={18} />, label: '终端', desc: '执行终端命令' },
  file: { icon: <FileText size={18} />, label: '文件操作', desc: '读写文件系统' },
  code_execution: { icon: <Code size={18} />, label: '代码执行', desc: '运行代码片段' },
  vision: { icon: <Eye size={18} />, label: '视觉', desc: '识别和理解图片' },
  image_gen: { icon: <Image size={18} />, label: '图片生成', desc: '生成图片' },
  tts: { icon: <Mic size={18} />, label: '语音合成', desc: '文字转语音' },
  skills: { icon: <Puzzle size={18} />, label: '技能管理', desc: '安装和管理技能' },
  memory: { icon: <Brain size={18} />, label: '记忆', desc: '长期记忆存储' },
  session_search: { icon: <Search size={18} />, label: '会话搜索', desc: '搜索历史会话' },
  clarify: { icon: <MessageSquare size={18} />, label: '澄清', desc: '向用户提问澄清意图' },
  delegation: { icon: <UserPlus size={18} />, label: '委派', desc: '委派任务给其他员工' },
  cronjob: { icon: <Calendar size={18} />, label: '定时任务', desc: '创建定时执行任务' },
  moa: { icon: <Zap size={18} />, label: '混合专家', desc: '多模型混合推理' },
  todo: { icon: <ListTodo size={18} />, label: '待办', desc: '管理待办事项' },
}

export const ALL_TOOLS = Object.keys(TOOL_META)

export type ConfigFieldType = 'text' | 'number' | 'select' | 'toggle'

export interface ConfigFieldDef {
  key: string
  label: string
  type: ConfigFieldType
  placeholder?: string
  desc: string
  group: string
  options?: { value: string; label: string }[]
}

export const AGENT_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: 'model.temperature', label: '温度', type: 'number', placeholder: '0.7', desc: '控制回复的随机性 (0-2)，越高越随机', group: '模型' },
  { key: 'model.max_tokens', label: '最大令牌数', type: 'number', placeholder: '4096', desc: '单次回复的最大长度', group: '模型' },

  { key: 'agent.max_turns', label: '最大轮次', type: 'number', placeholder: '60', desc: '单次对话最大工具调用轮次', group: '对话行为' },
  { key: 'agent.reasoning_effort', label: '推理力度', type: 'select', desc: '模型推理深度', group: '对话行为', options: [
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' },
  ]},
  { key: 'agent.verbose', label: '详细日志', type: 'toggle', desc: '是否输出详细运行日志', group: '对话行为' },
]

export const GLOBAL_CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: 'memory.memory_enabled', label: '启用记忆', type: 'toggle', desc: '是否启用长期记忆功能', group: '记忆' },
  { key: 'memory.memory_char_limit', label: '记忆上限', type: 'number', placeholder: '12200', desc: '长期记忆字符上限', group: '记忆' },
  { key: 'memory.user_char_limit', label: '用户画像上限', type: 'number', placeholder: '5375', desc: '用户画像字符上限', group: '记忆' },
  { key: 'memory.flush_min_turns', label: '写入间隔', type: 'number', placeholder: '6', desc: '至少多少轮对话后才写入记忆', group: '记忆' },

  { key: 'compression.enabled', label: '启用压缩', type: 'toggle', desc: '是否启用对话历史自动压缩', group: '对话压缩' },
  { key: 'compression.target_ratio', label: '压缩比', type: 'number', placeholder: '0.2', desc: '压缩到原始长度的比例 (0-1)', group: '对话压缩' },
  { key: 'compression.threshold', label: '触发阈值', type: 'number', placeholder: '0.5', desc: '对话长度达到此比例时触发压缩', group: '对话压缩' },
  { key: 'compression.protect_last_n', label: '保护轮数', type: 'number', placeholder: '20', desc: '保护最近 N 轮对话不被压缩', group: '对话压缩' },

  { key: 'terminal.timeout', label: '命令超时', type: 'number', placeholder: '180', desc: '终端命令执行超时（秒）', group: '终端' },
  { key: 'terminal.lifetime_seconds', label: '会话存活', type: 'number', placeholder: '300', desc: '终端会话存活时间（秒）', group: '终端' },

  { key: 'code_execution.max_tool_calls', label: '最大调用次数', type: 'number', placeholder: '50', desc: '代码执行最大工具调用次数', group: '代码执行' },
  { key: 'code_execution.timeout', label: '执行超时', type: 'number', placeholder: '300', desc: '代码执行超时（秒）', group: '代码执行' },

  { key: 'browser.inactivity_timeout', label: '页面超时', type: 'number', placeholder: '120', desc: '浏览器页面无操作超时（秒）', group: '浏览器' },

  { key: 'session_reset.idle_minutes', label: '空闲重置', type: 'number', placeholder: '1440', desc: '空闲多少分钟后重置会话', group: '会话重置' },
  { key: 'session_reset.at_hour', label: '定时重置', type: 'number', placeholder: '4', desc: '每天几点重置会话 (0-23)', group: '会话重置' },
]

export const CONFIG_FIELDS: ConfigFieldDef[] = [...AGENT_CONFIG_FIELDS, ...GLOBAL_CONFIG_FIELDS]

const CONFIG_FIELD_I18N: Record<string, { field: string; group: string }> = {
  'model.temperature': { field: 'temperature', group: 'model' },
  'model.max_tokens': { field: 'maxTokens', group: 'model' },
  'agent.max_turns': { field: 'maxTurns', group: 'behavior' },
  'agent.reasoning_effort': { field: 'reasoningEffort', group: 'behavior' },
  'agent.verbose': { field: 'verbose', group: 'behavior' },
  'memory.memory_enabled': { field: 'memoryEnabled', group: 'memory' },
  'memory.memory_char_limit': { field: 'memoryCharLimit', group: 'memory' },
  'memory.user_char_limit': { field: 'userCharLimit', group: 'memory' },
  'memory.flush_min_turns': { field: 'flushMinTurns', group: 'memory' },
  'compression.enabled': { field: 'compressionEnabled', group: 'compression' },
  'compression.target_ratio': { field: 'targetRatio', group: 'compression' },
  'compression.threshold': { field: 'threshold', group: 'compression' },
  'compression.protect_last_n': { field: 'protectLastN', group: 'compression' },
  'terminal.timeout': { field: 'terminalTimeout', group: 'terminal' },
  'terminal.lifetime_seconds': { field: 'terminalLifetime', group: 'terminal' },
  'code_execution.max_tool_calls': { field: 'codeMaxCalls', group: 'codeExecution' },
  'code_execution.timeout': { field: 'codeTimeout', group: 'codeExecution' },
  'browser.inactivity_timeout': { field: 'browserTimeout', group: 'browser' },
  'session_reset.idle_minutes': { field: 'idleMinutes', group: 'sessionReset' },
  'session_reset.at_hour': { field: 'atHour', group: 'sessionReset' },
}

function buildConfigFields(t: TFunction, source: ConfigFieldDef[]): ConfigFieldDef[] {
  return source.map(field => {
    const i18n = CONFIG_FIELD_I18N[field.key]
    if (!i18n) return field
    const base = `employee.configFields.${i18n.field}`
    const groupKey = `employee.configGroups.${i18n.group}`
    return {
      ...field,
      label: t(`${base}.label`),
      desc: t(`${base}.desc`),
      placeholder: field.placeholder ? t(`${base}.placeholder`, { defaultValue: field.placeholder }) : undefined,
      group: t(groupKey),
      options: field.options?.map(o => ({
        value: o.value,
        label: t(`employee.reasoningLevels.${o.value}`, { defaultValue: o.label }),
      })),
    }
  })
}

function buildToolMeta(t: TFunction): Record<string, { icon: React.ReactElement; label: string; desc: string }> {
  const result: Record<string, { icon: React.ReactElement; label: string; desc: string }> = {}
  for (const key of ALL_TOOLS) {
    result[key] = {
      icon: TOOL_META[key].icon,
      label: t(`employee.tools.${key}.label`),
      desc: t(`employee.tools.${key}.desc`),
    }
  }
  return result
}

export function useEmployeeShared() {
  const { t } = useTranslation()

  const statusTextFn = useCallback((s: string) => statusText(s, t), [t])

  const toolMeta = useMemo(() => buildToolMeta(t), [t])
  const agentConfigFields = useMemo(() => buildConfigFields(t, AGENT_CONFIG_FIELDS), [t])
  const globalConfigFields = useMemo(() => buildConfigFields(t, GLOBAL_CONFIG_FIELDS), [t])
  const configFields = useMemo(() => [...agentConfigFields, ...globalConfigFields], [agentConfigFields, globalConfigFields])

  const soulStyles = useMemo(() => [
    { value: 'balanced', label: t('employee.soulStyles.balanced') },
    { value: 'detailed', label: t('employee.soulStyles.detailed') },
    { value: 'expert', label: t('employee.soulStyles.expert') },
    { value: 'companion', label: t('employee.soulStyles.companion') },
    { value: 'executor', label: t('employee.soulStyles.executor') },
  ], [t])

  const soulPrompts = useMemo(() => [
    { label: t('employee.soulPrompts.detailed.label'), value: t('employee.soulPrompts.detailed.value') },
    { label: t('employee.soulPrompts.professional.label'), value: t('employee.soulPrompts.professional.value') },
    { label: t('employee.soulPrompts.warm.label'), value: t('employee.soulPrompts.warm.value') },
    { label: t('employee.soulPrompts.executor.label'), value: t('employee.soulPrompts.executor.value') },
  ], [t])

  return {
    t,
    statusText: statusTextFn,
    toolMeta,
    agentConfigFields,
    globalConfigFields,
    configFields,
    soulStyles,
    soulPrompts,
  }
}

export function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.')
  let current: unknown = obj
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[key]
  }
  return current
}

export function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.')
  const result = JSON.parse(JSON.stringify(obj))
  let current = result as Record<string, unknown>
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof current[keys[i]] !== 'object' || current[keys[i]] === null) {
      current[keys[i]] = {}
    }
    current = current[keys[i]] as Record<string, unknown>
  }
  if (value === '' || value === undefined) {
    delete current[keys[keys.length - 1]]
  } else {
    current[keys[keys.length - 1]] = value
  }
  return result
}

export interface ProviderPreset {
  id: string
  label: string
  baseUrl: string
  models: { id: string; label: string }[]
  apiKeyEnv: string
  apiKeyLabel: string
}

import {
  PROVIDER_DEFINITIONS,
  type ProviderDefinition,
} from "../../../shared/provider-registry";

export const PROVIDER_PRESETS: ProviderPreset[] = PROVIDER_DEFINITIONS.map((item: ProviderDefinition) => ({
  id: item.id,
  label: item.label,
  baseUrl: item.baseUrl,
  models: item.models,
  apiKeyEnv: item.envKey,
  apiKeyLabel: item.apiKeyLabel,
}))

export const PROVIDER_API_KEY_MAP: Record<string, { envKey: string; label: string; baseUrl: string }> = {}
for (const p of PROVIDER_PRESETS) {
  PROVIDER_API_KEY_MAP[p.id] = { envKey: p.apiKeyEnv, label: p.apiKeyLabel, baseUrl: p.baseUrl }
}

export interface EnvField {
  key: string
  label: string
  type: 'text' | 'password'
  placeholder: string
  desc: string
}

export function getEnvFieldsForProvider(provider: string): EnvField[] {
  const preset = PROVIDER_PRESETS.find(p => p.id === provider)
  if (preset) {
    return [{
      key: preset.apiKeyEnv,
      label: preset.apiKeyLabel,
      type: 'password',
      placeholder: 'sk-...',
      desc: `${preset.label} API 密钥，用于访问模型服务`,
    }]
  }
  return [{
    key: 'OPENAI_API_KEY',
    label: 'API 密钥',
    type: 'password',
    placeholder: 'sk-...',
    desc: 'OpenAI 兼容 API 密钥',
  }]
}

export const ALL_ENV_KEYS: string[] = PROVIDER_PRESETS.map(p => p.apiKeyEnv).concat(['OPENAI_API_KEY'])

export const EMPLOYEE_NAME_RE = /^[a-z0-9_][a-z0-9_-]{0,63}$/
