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

export function statusText(s: string): string {
  if (s === 'awake') return '在线'
  if (s === 'busy') return '忙碌...'
  if (s === 'sleeping') return '离线'
  if (s === 'error') return '异常'
  return s || '未知'
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

export const CONFIG_FIELDS: ConfigFieldDef[] = [
  { key: 'model.temperature', label: '温度', type: 'number', placeholder: '0.7', desc: '控制回复的随机性 (0-2)，越高越随机', group: '模型' },
  { key: 'model.max_tokens', label: '最大令牌数', type: 'number', placeholder: '4096', desc: '单次回复的最大长度', group: '模型' },

  { key: 'agent.max_turns', label: '最大轮次', type: 'number', placeholder: '60', desc: '单次对话最大工具调用轮次', group: '对话行为' },
  { key: 'agent.reasoning_effort', label: '推理力度', type: 'select', desc: '模型推理深度', group: '对话行为', options: [
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' },
  ]},
  { key: 'agent.verbose', label: '详细日志', type: 'toggle', desc: '是否输出详细运行日志', group: '对话行为' },

  { key: 'memory.memory_enabled', label: '启用记忆', type: 'toggle', desc: '是否启用长期记忆功能', group: '记忆' },
  { key: 'memory.memory_char_limit', label: '记忆上限', type: 'number', placeholder: '2200', desc: '长期记忆字符上限', group: '记忆' },
  { key: 'memory.user_char_limit', label: '用户画像上限', type: 'number', placeholder: '1375', desc: '用户画像字符上限', group: '记忆' },
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

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    apiKeyLabel: 'DeepSeek API 密钥',
    models: [
      { id: 'deepseek-chat', label: 'DeepSeek Chat' },
      { id: 'deepseek-reasoner', label: 'DeepSeek Reasoner' },
    ],
  },
  {
    id: 'qwen',
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    apiKeyLabel: '通义千问 API 密钥',
    models: [
      { id: 'qwen-turbo', label: 'Qwen Turbo' },
      { id: 'qwen-plus', label: 'Qwen Plus' },
      { id: 'qwen-max', label: 'Qwen Max' },
      { id: 'qwen-long', label: 'Qwen Long' },
      { id: 'qwq-32b', label: 'QwQ-32B' },
      { id: 'qwen3-235b-a22b', label: 'Qwen3 235B' },
    ],
  },
  {
    id: 'zhipu',
    label: '智谱 AI',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    apiKeyEnv: 'GLM_API_KEY',
    apiKeyLabel: '智谱 API 密钥',
    models: [
      { id: 'glm-4-plus', label: 'GLM-4 Plus' },
      { id: 'glm-4-flash', label: 'GLM-4 Flash' },
      { id: 'glm-4-air', label: 'GLM-4 Air' },
      { id: 'glm-4-long', label: 'GLM-4 Long' },
      { id: 'glm-4v-plus', label: 'GLM-4V Plus' },
    ],
  },
  {
    id: 'moonshot',
    label: '月之暗面 (Kimi)',
    baseUrl: 'https://api.moonshot.cn/v1',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    apiKeyLabel: 'Moonshot API 密钥',
    models: [
      { id: 'moonshot-v1-8k', label: 'Moonshot V1 8K' },
      { id: 'moonshot-v1-32k', label: 'Moonshot V1 32K' },
      { id: 'moonshot-v1-128k', label: 'Moonshot V1 128K' },
    ],
  },
  {
    id: 'yi',
    label: '零一万物 (Yi)',
    baseUrl: 'https://api.lingyiwanwu.com/v1',
    apiKeyEnv: 'YI_API_KEY',
    apiKeyLabel: '零一万物 API 密钥',
    models: [
      { id: 'yi-lightning', label: 'Yi Lightning' },
      { id: 'yi-large', label: 'Yi Large' },
    ],
  },
  {
    id: 'minimax',
    label: 'MiniMax',
    baseUrl: 'https://api.minimax.chat/v1',
    apiKeyEnv: 'MINIMAX_API_KEY',
    apiKeyLabel: 'MiniMax API 密钥',
    models: [
      { id: 'MiniMax-Text-01', label: 'MiniMax Text 01' },
      { id: 'abab6.5s-chat', label: 'ABAB 6.5S' },
    ],
  },
  {
    id: 'spark',
    label: '讯飞星火',
    baseUrl: 'https://spark-api-open.xf-yun.com/v1',
    apiKeyEnv: 'SPARK_API_KEY',
    apiKeyLabel: '讯飞星火 API 密钥',
    models: [
      { id: '4.0Ultra', label: '星火 4.0 Ultra' },
      { id: 'generalv3.5', label: '星火 3.5' },
      { id: 'generalv3', label: '星火 3.0' },
    ],
  },
  {
    id: 'siliconflow',
    label: '硅基流动',
    baseUrl: 'https://api.siliconflow.cn/v1',
    apiKeyEnv: 'SILICONFLOW_API_KEY',
    apiKeyLabel: '硅基流动 API 密钥',
    models: [
      { id: 'deepseek-ai/DeepSeek-V3', label: 'DeepSeek V3' },
      { id: 'deepseek-ai/DeepSeek-R1', label: 'DeepSeek R1' },
      { id: 'Qwen/Qwen2.5-72B-Instruct', label: 'Qwen2.5 72B' },
      { id: 'THUDM/glm-4-9b-chat', label: 'GLM-4 9B' },
    ],
  },
  {
    id: 'ernie',
    label: '百度文心',
    baseUrl: 'https://qianfan.baidubce.com/v2',
    apiKeyEnv: 'QIANFAN_API_KEY',
    apiKeyLabel: '百度千帆 API 密钥',
    models: [
      { id: 'ernie-4.0-8k', label: 'ERNIE 4.0' },
      { id: 'ernie-3.5-8k', label: 'ERNIE 3.5' },
      { id: 'ernie-speed-8k', label: 'ERNIE Speed' },
    ],
  },
]

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
