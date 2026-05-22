import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { usePlatform } from '../../hooks/usePlatform'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Send, Square, History, UserCircle,
  ChevronDown, Copy, Check, X,
  ArrowLeft, Trash2, Puzzle, Wrench, Paperclip, FileText
} from 'lucide-react'
import type { EmployeeInfo, SkillInfo, ChatUsage, ApprovalRequest, MemoryData, SavedModel } from '../../../../preload/index'
import type { Attachment } from '../../../../shared/attachments'
import { showToast } from '../../App'
import logoImg from '../../assets/logo.png'
import { mapStatus, TOOL_META, ALL_TOOLS } from '../../shared/employee-shared'
import InteractivePet from '../../components/InteractivePet'
import Popconfirm from '../../components/Popconfirm'
import { useTheme } from '../../components/ThemeProvider'
import { MAX_ATTACHMENTS_PER_MESSAGE, MAX_IMAGE_BYTES, MAX_TEXT_BYTES, isImageMime, isTextFile } from '../../../../shared/attachments'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  toolCalls?: ToolCallInfo[]
  thinking?: string
  attachments?: Attachment[]
}

interface ToolCallInfo {
  name: string
  args?: string
  result?: string
  error?: string
  status: 'running' | 'done' | 'error'
}

interface EmployeeStreamState {
  isStreaming: boolean
  streamingThinking: string
  streamingUsage: ChatUsage | null
  streamingCurrentTool: string | null
  messageQueue: string[]
}

interface ContextMenu {
  x: number
  y: number
  employeeName: string
  confirmDelete?: boolean
}

interface SessionDisplay {
  id: string
  title: string
  startedAt: number
  messageCount: number
  source?: string
}

function attachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsDataURL(file)
  })
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('read failed'))
    reader.readAsText(file, 'utf-8')
  })
}

async function readFileAsBase64(file: File): Promise<string> {
  const dataUrl = await readFileAsDataUrl(file)
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : ''
}

function formatAttachmentSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function getMessageKey(m: Record<string, unknown>): string {
  if (m.id !== undefined && m.id !== null && String(m.id) !== '') {
    return String(m.id)
  }
  return [
    String(m.role || ''),
    String(m.timestamp || ''),
    String(m.content || ''),
    String(m.tool_call_id || ''),
    String(m.tool_calls || '')
  ].join('\u001f')
}

function extractToolResultSnippet(raw: string): string {
  if (!raw) return '已完成'
  try {
    const p = JSON.parse(raw)
    if (p.success === true) {
      if (p.result) return typeof p.result === 'string' ? p.result : JSON.stringify(p.result, null, 2)
      if (p.url) return p.title ? `${p.title} (${p.url})` : p.url
      if (p.output !== undefined) {
        const out = typeof p.output === 'string' ? p.output : JSON.stringify(p.output)
        return out.length > 300 ? out.substring(0, 300) + '...' : out || '(no output)'
      }
      if (p.clicked) return `Clicked: ${p.clicked}`
      if (p.scrolled) return `Scrolled: ${p.scrolled}`
      if (p.snapshot) {
        const snap = typeof p.snapshot === 'string' ? p.snapshot : JSON.stringify(p.snapshot)
        return snap.length > 300 ? snap.substring(0, 300) + '...' : snap
      }
    }
    if (p.output !== undefined) {
      const out = typeof p.output === 'string' ? p.output : JSON.stringify(p.output)
      if (p.error) return `❌ ${p.error}\n${out.substring(0, 200)}`
      return out.length > 300 ? out.substring(0, 300) + '...' : out || '(no output)'
    }
    if (p.error) return `❌ ${p.error}`
    if (p.success === false) return `❌ ${p.error || p.message || 'Failed'}`
    if (p.message) return String(p.message)
    if (p.job_id) return `${p.name || p.job_id}: ${p.message || 'created'}`
    return raw.length > 500 ? raw.substring(0, 500) + '...' : raw
  } catch {
    return raw.length > 300 ? raw.substring(0, 300) + '...' : raw
  }
}

function isLowValueToolResult(result?: string): boolean {
  const text = (result || '').trim()
  if (!text) return true
  return ['已完成', '等待中...', '(no output)', 'null', 'undefined'].includes(text)
}

function summarizeToolCalls(toolCalls: ToolCallInfo[]): string {
  const counts = new Map<string, number>()
  for (const toolCall of toolCalls) {
    counts.set(toolCall.name, (counts.get(toolCall.name) || 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([name, count]) => count > 1 ? `${name} x${count}` : name)
    .join('、')
}

function shouldCompactToolCalls(toolCalls: ToolCallInfo[]): boolean {
  if (toolCalls.length <= 1) return false
  return toolCalls.every(tc => tc.status === 'done' && !tc.error && isLowValueToolResult(tc.result))
}

function isMarkdownTableSeparator(line: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function isMarkdownTableLike(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed || !trimmed.includes('|')) return false
  if (trimmed.startsWith('```')) return false
  const cells = trimmed.split('|').filter(cell => cell.trim().length > 0)
  return cells.length >= 2
}

function markdownTableSeparatorFor(line: string): string {
  const cellCount = Math.max(2, line.split('|').filter(cell => cell.trim().length > 0).length)
  return `| ${Array.from({ length: cellCount }, () => '---').join(' | ')} |`
}

function normalizeMarkdown(content: string): string {
  if (!content) return content

  const sourceLines = content.replace(/\r\n/g, '\n').split('\n')
  const normalizedLines: string[] = []
  let inFence = false

  for (const rawLine of sourceLines) {
    const fenceLine = rawLine.trim().startsWith('```')
    if (fenceLine) {
      inFence = !inFence
      normalizedLines.push(rawLine)
      continue
    }

    if (!inFence && rawLine.includes('|') && rawLine.includes('||')) {
      normalizedLines.push(...rawLine.split(/\|\|+/).map((part, index, parts) => {
        const trimmed = part.trim()
        if (!trimmed) return ''
        const prefix = index === 0 && trimmed.startsWith('|') ? '' : '| '
        const suffix = index === parts.length - 1 && trimmed.endsWith('|') ? '' : ' |'
        return `${prefix}${trimmed}${suffix}`
      }).filter(Boolean))
      continue
    }

    normalizedLines.push(rawLine)
  }

  const out: string[] = []
  inFence = false

  for (let i = 0; i < normalizedLines.length; i += 1) {
    const line = normalizedLines[i]
    const trimmed = line.trim()
    const fenceLine = trimmed.startsWith('```')
    if (fenceLine) {
      inFence = !inFence
      out.push(line)
      continue
    }

    if (!inFence && isMarkdownTableLike(line)) {
      const prev = out[out.length - 1]
      if (prev && prev.trim() !== '' && !isMarkdownTableLike(prev)) out.push('')
      out.push(line)

      const next = normalizedLines[i + 1] || ''
      const startsTableBlock = !prev || prev.trim() === '' || !isMarkdownTableLike(prev)
      if (startsTableBlock && !isMarkdownTableSeparator(next) && !isMarkdownTableSeparator(line)) {
        out.push(markdownTableSeparatorFor(line))
      }

      const following = normalizedLines[i + 1] || ''
      if (following && !isMarkdownTableLike(following)) out.push('')
      continue
    }

    out.push(line)
  }

  return out.join('\n')
}

function extractThinkingFromContent(content: string): { thinking: string | undefined; content: string } {
  if (!content || typeof content !== 'string') return { thinking: undefined, content }
  const thinkMatch = content.match(/^\s*<think[^>]*>([\s\S]*?)<\/think[^>]*>\s*/)
  if (thinkMatch) {
    const thinking = thinkMatch[1].trim()
    const cleaned = content.replace(/^\s*<think[^>]*>[\s\S]*?<\/think[^>]*>\s*/, '').trimStart()
    return { thinking: thinking || undefined, content: cleaned || '' }
  }
  const mmMatch = content.match(/^\s*<\|channel\|>thought\n?([\s\S]*?)<\|channel\|>\s*/)
  if (mmMatch) {
    const thinking = mmMatch[1].trim()
    const cleaned = content.replace(/^\s*<\|channel\|>thought[\s\S]*?<\|channel\|>\s*/, '').trimStart()
    return { thinking: thinking || undefined, content: cleaned || '' }
  }
  return { thinking: undefined, content }
}

function parseSessionMessages(messages: Array<Record<string, unknown>>, sessionId?: string): ChatMessage[] {
  const uniqueMessages: Record<string, unknown>[] = []
  const seenMessages = new Set<string>()
  for (const m of messages) {
    const key = getMessageKey(m)
    if (seenMessages.has(key)) continue
    seenMessages.add(key)
    uniqueMessages.push(m)
  }

  const toolResultMap = new Map<string, string>()
  for (const m of uniqueMessages) {
    if (m.role === 'tool' && m.tool_call_id) {
      toolResultMap.set(String(m.tool_call_id), String(m.content || ''))
    }
  }

  const parsedMessages = uniqueMessages
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .map((m) => {
      const rawContent = String(m.content || '')
      let thinking = m.reasoning_content ? String(m.reasoning_content) : undefined
      const { thinking: contentThinking, content: cleanedContent } = extractThinkingFromContent(rawContent)
      if (!thinking && contentThinking) thinking = contentThinking

      const toolCallsStr = m.tool_calls as string | null
      let toolCalls: ToolCallInfo[] | undefined
      if (toolCallsStr) {
        try {
          const parsed = JSON.parse(toolCallsStr)
          if (Array.isArray(parsed)) {
            toolCalls = parsed.map((tc: Record<string, unknown>) => {
              const fn = tc.function && typeof tc.function === 'object'
                ? tc.function as Record<string, unknown>
                : {}
              const callId = String(tc.id || tc.call_id || '')
              const rawResult = callId ? toolResultMap.get(callId) : undefined
              return {
                name: String(fn.name || tc.name || 'unknown'),
                args: fn.arguments ? String(fn.arguments) : undefined,
                status: 'done' as const,
                result: rawResult ? extractToolResultSnippet(rawResult) : '已完成',
              }
            })
          }
        } catch { /* ignore */ }
      }

      return {
        id: `history-${m.id ?? getMessageKey(m)}`,
        role: m.role as 'user' | 'assistant',
        content: cleanedContent,
        timestamp: Number(m.timestamp) * 1000,
        toolCalls,
        thinking,
      }
    })

  if (sessionId?.startsWith('cron_')) {
    const reportMessages = parsedMessages.filter(m => m.role === 'assistant' && m.content.trim())
    if (reportMessages.length > 0) {
      return reportMessages.map(m => ({
        ...m,
        toolCalls: undefined,
        thinking: undefined,
      }))
    }
  }

  const mergedMessages: ChatMessage[] = []
  for (const msg of parsedMessages) {
    if (msg.role === 'user') {
      mergedMessages.push(msg)
      continue
    }
    const last = mergedMessages[mergedMessages.length - 1]
    if (last && last.role === 'assistant') {
      const prevHasToolCalls = last.toolCalls && last.toolCalls.length > 0
      const prevHasContent = !!last.content
      const curHasToolCalls = msg.toolCalls && msg.toolCalls.length > 0
      const curHasContent = !!msg.content
      if (prevHasToolCalls && !prevHasContent && curHasContent && !curHasToolCalls) {
        last.content = msg.content
        if (msg.thinking && !last.thinking) last.thinking = msg.thinking
        continue
      }
      if (!prevHasContent && !prevHasToolCalls && curHasToolCalls) {
        last.toolCalls = msg.toolCalls
        last.content = msg.content || last.content
        last.thinking = msg.thinking || last.thinking
        continue
      }
      if (!prevHasContent && !prevHasToolCalls && curHasContent) {
        last.content = msg.content
        if (msg.toolCalls) last.toolCalls = msg.toolCalls
        if (msg.thinking && !last.thinking) last.thinking = msg.thinking
        continue
      }
    }
    mergedMessages.push(msg)
  }

  return mergedMessages.filter(m =>
    m.role === 'user' || m.content || (m.toolCalls && m.toolCalls.length > 0) || m.thinking
  )
}

const DEFAULT_STREAM: EmployeeStreamState = {
  isStreaming: false,
  streamingThinking: '',
  streamingUsage: null,
  streamingCurrentTool: null,
  messageQueue: []
}

const SLASH_COMMANDS = [
  { cmd: '/new', desc: '开始新对话' },
  { cmd: '/clear', desc: '清空当前对话' },
  { cmd: '/help', desc: '显示帮助信息' },
  { cmd: '/web', desc: '搜索互联网' },
  { cmd: '/image', desc: '生成图片' },
  { cmd: '/code', desc: '执行代码' },
  { cmd: '/shell', desc: '执行终端命令' },
  { cmd: '/model', desc: '查看/切换模型' },
  { cmd: '/memory', desc: '查看记忆' },
  { cmd: '/tools', desc: '查看工具列表' },
  { cmd: '/skills', desc: '查看技能列表' },
  { cmd: '/usage', desc: '查看用量统计' },
  { cmd: '/compact', desc: '压缩对话上下文' },
  { cmd: '/undo', desc: '撤销上一轮对话' },
  { cmd: '/retry', desc: '重试上一条消息' },
  { cmd: '/status', desc: '查看员工状态' },
]

function mapSession(r: Record<string, unknown>): SessionDisplay {
  const source = String(r.source || '')
  const rawStartedAt = Number(r.started_at || r.startedAt || 0)
  const startedAt = rawStartedAt > 0 && rawStartedAt < 100000000000 ? rawStartedAt * 1000 : rawStartedAt
  return {
    id: String(r.id || ''),
    title: String(r.title || (source === 'cron' ? '日程执行结果' : '未命名会话')),
    startedAt,
    messageCount: Number(r.message_count || r.messageCount || 0),
    source
  }
}

function sessionSourceLabel(source?: string): string {
  const value = (source || '').toLowerCase()
  if (!value) return ''
  if (value === 'cron' || value.includes('cron')) return '日程'
  if (value.includes('feishu') || value.includes('lark')) return '飞书'
  if (value.includes('weixin') || value.includes('wechat')) return '微信'
  if (value.includes('dingtalk')) return '钉钉'
  if (value.includes('platform') || value.includes('external')) return '外部'
  return ''
}

function isExternalSessionSource(source?: string): boolean {
  const label = sessionSourceLabel(source)
  return !!label && label !== '日程'
}

function formatMessageTime(date: number | Date): string {
  const d = new Date(date)
  const now = new Date()
  const h = d.getHours().toString().padStart(2, '0')
  const m = d.getMinutes().toString().padStart(2, '0')
  const isToday = d.toDateString() === now.toDateString()
  if (isToday) return h + ':' + m
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const day = d.getDate().toString().padStart(2, '0')
  return month + '/' + day + ' ' + h + ':' + m
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '0'
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K'
  return n.toString()
}

function formatDate(ts: number): string {
  if (!ts) return '--'
  const d = new Date(ts)
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function statusText(s: string): string {
  if (s === 'awake') return '在线'
  if (s === 'busy') return '忙碌...'
  if (s === 'sleeping') return '离线'
  if (s === 'error') return '异常'
  return s || '未知'
}

function statusColor(s: string): string {
  if (s === 'awake') return 'var(--success)'
  if (s === 'busy') return 'var(--accent)'
  if (s === 'sleeping') return 'var(--text-dim)'
  if (s === 'error') return 'var(--danger)'
  return 'var(--text-dim)'
}

function statusDotClass(s: string): string {
  if (s === 'awake') return 'bg-[var(--success)] shadow-[0_0_8px_rgba(34,197,94,0.4)]'
  if (s === 'busy') return 'bg-[var(--accent)] animate-pulse-custom'
  if (s === 'sleeping') return 'bg-[var(--text-dim)]'
  if (s === 'error') return 'bg-[var(--danger)] shadow-[0_0_8px_rgba(239,68,68,0.4)]'
  return 'bg-[var(--text-dim)]'
}

function CopyButton({ text }: { text: string }): React.ReactElement {
  const [copied, setCopied] = useState(false)
  const handleCopy = (): void => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      showToast('已复制到剪贴板', 'success')
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => showToast('复制失败', 'error'))
  }
  return (
    <button onClick={handleCopy} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-0.5" title="复制">
      {copied ? <Check size={14} /> : <Copy size={14} />}
    </button>
  )
}

function ToolCard({ toolCall }: { toolCall: ToolCallInfo }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const hasUsefulResult = !isLowValueToolResult(toolCall.result) || !!toolCall.error || toolCall.status !== 'done'
  return (
    <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] overflow-hidden text-xs">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors gap-2"
      >
        <span className="flex items-center gap-2 font-medium text-[var(--accent)] text-[12px]">
          <Wrench size={13} />
          {toolCall.name}
        </span>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] px-2.5 py-0.5 rounded-xl font-medium ${
            toolCall.status === 'running' ? 'bg-[var(--accent-glow)] text-[var(--accent)] animate-pulse-custom' :
            toolCall.status === 'done' ? 'bg-[rgba(34,197,94,0.12)] text-[var(--success)]' :
            'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]'
          }`}>
            {toolCall.status === 'running' ? '执行中' : toolCall.status === 'done' ? '完成' : '失败'}
          </span>
          {(toolCall.args || hasUsefulResult) && (
            <ChevronDown size={10} className={`text-[var(--text-dim)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
          )}
        </div>
      </button>
      {expanded && (
        <div className="px-3.5 py-3 border-t border-[var(--border)]">
          {toolCall.args && (
            <div className="mb-2.5">
              <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">参数</div>
              <pre className="bg-[rgba(0,0,0,0.25)] backdrop-blur-sm p-2.5 rounded-lg font-mono text-xs whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto text-[var(--text-secondary)] border border-[var(--border)]">
                {toolCall.args}
              </pre>
            </div>
          )}
          <div>
            <div className="text-[11px] font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-1.5">结果</div>
            <pre className="bg-[rgba(0,0,0,0.25)] backdrop-blur-sm p-2.5 rounded-lg font-mono text-xs whitespace-pre-wrap break-all max-h-[200px] overflow-y-auto text-[var(--text-secondary)] border border-[var(--border)]">
              {toolCall.error ? <span style={{ color: 'var(--danger)' }}>{toolCall.error}</span> : toolCall.result || (toolCall.status === 'done' ? '已完成' : '等待中...')}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolActivity({ toolCalls }: { toolCalls: ToolCallInfo[] }): React.ReactElement {
  const [expanded, setExpanded] = useState(false)
  const compact = shouldCompactToolCalls(toolCalls)
  const hasErrors = toolCalls.some(tc => tc.status === 'error' || tc.error)
  const runningCount = toolCalls.filter(tc => tc.status === 'running').length

  if (!compact) {
    return (
      <>
        {toolCalls.map((tc, i) => (
          <ToolCard key={`${tc.name}-${i}`} toolCall={tc} />
        ))}
      </>
    )
  }

  return (
    <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] overflow-hidden text-xs">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full px-3 py-2 text-left hover:bg-[var(--bg-hover)] transition-colors gap-2"
      >
        <span className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)] min-w-0">
          <Wrench size={13} className="text-[var(--accent)] shrink-0" />
          <span className="truncate">
            已执行 {toolCalls.length} 个工具：{summarizeToolCalls(toolCalls)}
          </span>
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[11px] px-2.5 py-0.5 rounded-xl font-medium ${
            hasErrors ? 'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]' :
            runningCount > 0 ? 'bg-[var(--accent-glow)] text-[var(--accent)] animate-pulse-custom' :
            'bg-[rgba(34,197,94,0.12)] text-[var(--success)]'
          }`}>
            {hasErrors ? '有异常' : runningCount > 0 ? '执行中' : '完成'}
          </span>
          <ChevronDown size={10} className={`text-[var(--text-dim)] transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </div>
      </button>
      {expanded && (
        <div className="flex flex-col gap-2 p-2 border-t border-[var(--border)]">
          {toolCalls.map((tc, i) => (
            <ToolCard key={`${tc.name}-${i}`} toolCall={tc} />
          ))}
        </div>
      )}
    </div>
  )
}

function AttachmentChip({ attachment, onRemove }: { attachment: Attachment; onRemove?: () => void }): React.ReactElement {
  const isImage = attachment.kind === 'image' && attachment.dataUrl
  return (
    <div className="flex items-center gap-2 max-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)]">
      {isImage ? (
        <img src={attachment.dataUrl} alt="" className="h-7 w-7 rounded object-cover border border-[var(--border)]" />
      ) : (
        <FileText size={14} className="shrink-0 text-[var(--text-dim)]" />
      )}
      <span className="truncate" title={`${attachment.name} (${formatAttachmentSize(attachment.size)})`}>
        {attachment.name}
      </span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="shrink-0 rounded p-0.5 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
          aria-label={`移除 ${attachment.name}`}
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function MessageBubble({ msg, empName, empAvatar, isStreaming, thinking, showActivityDetails = false }: {
  msg: ChatMessage
  empName: string
  empAvatar: string
  isStreaming?: boolean
  thinking?: string
  showActivityDetails?: boolean
}): React.ReactElement {
  const isUser = msg.role === 'user'
  const hasToolCalls = showActivityDetails && msg.toolCalls && msg.toolCalls.length > 0
  const hasThinking = showActivityDetails && !!thinking
  const hasContent = !!msg.content
  const hasAttachments = !!msg.attachments && msg.attachments.length > 0
  const [expandedThinking, setExpandedThinking] = useState(false)

  return (
    <div className={`flex gap-3 max-w-[85%] animate-fade-in ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}>
      <div className={`w-7 h-7 rounded-md flex items-center justify-center text-sm shrink-0 mt-0.5 ${isUser ? 'bg-[var(--bg-surface)] border border-[var(--border)]' : 'bg-[var(--accent-glow)] border border-[rgba(124,106,239,0.2)]'}`}>
        {isUser ? '👤' : empAvatar}
      </div>
      <div className="flex-1 min-w-0">
        {!isUser && <div className="text-xs font-semibold text-[var(--text-dim)] mb-1">{empName}</div>}
        <div className={`py-2.5 px-4 rounded-[var(--radius-lg)] text-sm leading-relaxed break-words overflow-wrap-break-word ${
          isUser
            ? 'bg-[var(--user-bubble)] text-[var(--user-bubble-text)] rounded-br-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.15)]'
            : 'glass-medium border border-[var(--border)] text-[var(--agent-bubble-text)] rounded-bl-[4px]'
        }`}>
          {hasThinking && (
            <div className="mb-2 glass-medium border border-[rgba(234,179,8,0.15)] rounded-[var(--radius)] overflow-hidden">
              <button
                onClick={() => setExpandedThinking(!expandedThinking)}
                className="flex items-center justify-between w-full px-3.5 py-2.5 text-left hover:bg-[rgba(234,179,8,0.04)] transition-colors"
              >
                <span className="flex items-center gap-2 text-[13px] font-medium text-[var(--warning)]">💭 思考过程</span>
                <ChevronDown size={12} className={`text-[var(--text-dim)] transition-transform ${expandedThinking ? 'rotate-180' : ''}`} />
              </button>
              {expandedThinking && (
                <div className="px-3.5 py-3 border-t border-[rgba(234,179,8,0.1)] text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                  {thinking}
                </div>
              )}
            </div>
          )}
          {hasToolCalls && (
            <div className={`flex flex-col gap-2 ${hasContent ? 'mb-3 border-b border-[var(--border)] pb-3' : ''}`}>
              <ToolActivity toolCalls={msg.toolCalls!} />
            </div>
          )}
          {hasAttachments && (
            <div className={`flex flex-wrap gap-2 ${hasContent ? 'mb-2.5' : ''}`}>
              {msg.attachments!.map(att => (
                <AttachmentChip key={att.id} attachment={att} />
              ))}
            </div>
          )}
          {hasContent && (
            <div className={`message-content ${!isUser ? 'agent-markdown' : ''}`}>
              {isUser ? (
                <p className="whitespace-pre-wrap">{msg.content}</p>
              ) : (
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{normalizeMarkdown(msg.content)}</ReactMarkdown>
              )}
              {isStreaming && <span className="inline-block w-[2px] h-[1em] bg-[var(--accent)] animate-blink align-text-bottom ml-0.5" />}
            </div>
          )}
          {!hasContent && isStreaming && !hasToolCalls && !hasThinking && (
            <span className="inline-block w-[2px] h-[1em] bg-[var(--accent)] animate-blink align-text-bottom ml-0.5" />
          )}
        </div>
        <div className={`flex items-center gap-2 mt-1 px-1 text-[11px] text-[var(--text-dim)] opacity-60 ${isUser ? 'justify-end' : ''}`}>
          <span>{formatMessageTime(msg.timestamp)}</span>
          {!isUser && hasContent && <CopyButton text={msg.content} />}
        </div>
      </div>
    </div>
  )
}

function ApprovalModal({ request, onApprove, onDeny }: {
  request: ApprovalRequest
  onApprove: () => void
  onDeny: () => void
}): React.ReactElement {
  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={onDeny} />
      <div className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[520px] max-h-[85vh] overflow-y-auto animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)]">
        <div className="flex justify-between items-center px-6 border-b border-[var(--border)] h-14 sticky top-0 glass-heavy z-[1]">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px]">审批请求</h3>
        </div>
        <div className="p-6">
          <div className="text-[15px] font-semibold text-[var(--accent)] mb-2.5">工具: {request.tool}</div>
          <pre className="bg-[rgba(0,0,0,0.25)] backdrop-blur-sm p-3.5 rounded-[var(--radius)] font-mono text-[13px] whitespace-pre-wrap break-all text-[var(--text-primary)] mb-2.5 max-h-[200px] overflow-y-auto border border-[var(--border)]">
            {JSON.stringify(request.args, null, 2)}
          </pre>
          <span className={`text-xs px-3 py-1 rounded-xl font-medium inline-block ${
            request.riskLevel === 'high' ? 'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]' :
            request.riskLevel === 'medium' ? 'bg-[rgba(234,179,8,0.12)] text-[var(--warning)]' :
            'bg-[rgba(34,197,94,0.12)] text-[var(--success)]'
          }`}>
            风险: {request.riskLevel === 'high' ? '高' : request.riskLevel === 'medium' ? '中' : '低'}
          </span>
        </div>
        <div className="flex justify-end gap-2.5 px-6 py-4 border-t border-[var(--border)] glass-heavy">
          <button onClick={onDeny} className="glass-medium border border-[var(--border)] text-[var(--text-primary)] px-4 py-2 rounded-[var(--radius)] text-sm cursor-pointer transition-all hover:bg-[var(--bg-hover)] font-medium">拒绝</button>
          <button onClick={onApprove} className="bg-accent-gradient text-white border-none px-4 py-2 rounded-[var(--radius)] text-sm cursor-pointer transition-all hover:opacity-90 font-medium">批准</button>
        </div>
      </div>
    </div>
  )
}

type DetailTab = 'soul' | 'tools' | 'skills' | 'memory'

function EmployeeDetail({ employee, onBack }: { employee: EmployeeInfo; onBack: () => void }): React.ReactElement {
  const { isMac } = usePlatform()
  const { lexicon } = useTheme()
  const [tab, setTab] = useState<DetailTab>('soul')
  const [soulContent, setSoulContent] = useState('')
  const [tools, setTools] = useState<string[]>([])
  const [skills, setSkills] = useState<SkillInfo[]>([])
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null)

  useEffect(() => {
    const ename = employee.name
    window.hermesAPI.getEmployeeSoul(ename).then((s) => { setSoulContent(s || '') }).catch(() => {})
    window.hermesAPI.getEmployeeTools(ename).then(setTools).catch(() => {})
    window.hermesAPI.getEmployeeSkills(ename).then(setSkills).catch(() => {})
    window.hermesAPI.getEmployeeMemory(ename).then(setMemoryData).catch(() => {})
  }, [employee.name])

  const tabs: { id: DetailTab; label: string }[] = [
    { id: 'soul', label: lexicon.concepts.soul },
    { id: 'tools', label: lexicon.concepts.tools },
    { id: 'skills', label: lexicon.concepts.skills },
    { id: 'memory', label: lexicon.concepts.memory },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="screen-header drag-region flex items-center gap-3 border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}>
        <button onClick={onBack} className="no-drag text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"><ArrowLeft size={20} /></button>
        <h2 className="screen-header-title">{employee.displayName || employee.name}</h2>
      </div>
      <div className="flex flex-col items-center py-7 px-5 border-b border-[var(--border)]">
        <div className="w-[72px] h-[72px] rounded-[18px] glass-medium flex items-center justify-center text-[36px] mb-3 border border-[var(--border)]">{employee.avatar || '🧑‍💼'}</div>
        <div className="text-[20px] font-semibold tracking-[-0.3px]">{employee.displayName || employee.name}</div>
        <div className="text-sm text-[var(--text-dim)]">{employee.model} · <span style={{ color: statusColor(employee.status || '') }}>{statusText(employee.status || '')}</span></div>
      </div>
      <div className="flex border-b border-[var(--border)] px-4">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${tab === t.id ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-primary)]'}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'soul' && (
          <pre className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5 text-[13px] text-[var(--text-primary)] min-h-[300px] font-mono leading-relaxed whitespace-pre-wrap">{soulContent || lexicon.concepts.soulEmpty}</pre>
        )}
        {tab === 'tools' && (
          <div className="grid grid-cols-2 gap-3">
            {ALL_TOOLS.filter(t => tools.includes(t)).map(t => {
              const meta = TOOL_META[t]
              return (
                <div
                  key={t}
                  className="glass-medium border border-[rgba(124,106,239,0.2)] rounded-[var(--radius-lg)] p-4 transition-all"
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-[var(--accent-glow)] text-[var(--accent)]">
                      {meta?.icon || <Wrench size={18} />}
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{meta?.label || t}</span>
                  </div>
                  {meta && <div className="text-xs text-[var(--text-dim)] leading-relaxed">{meta.desc}</div>}
                </div>
              )
            })}
            {tools.filter(t => !ALL_TOOLS.includes(t)).length > 0 && (
              <div className="col-span-2 glass-medium border border-[var(--border)] rounded-[var(--radius)] p-4">
                <div className="text-sm font-medium text-[var(--text-primary)] mb-2">{lexicon.concepts.otherEnabledTools}</div>
                <div className="flex flex-wrap gap-2">
                  {tools.filter(t => !ALL_TOOLS.includes(t)).map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 glass-medium rounded-xl text-[13px] text-[var(--text-primary)] border border-[var(--border)]">
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {tools.length === 0 && (
              <span className="text-[13px] text-[var(--text-dim)] col-span-2">{lexicon.concepts.noTools}</span>
            )}
          </div>
        )}
        {tab === 'skills' && (
          <div className="grid grid-cols-2 gap-3">
            {skills.length > 0 ? skills.map(s => (
              <div key={s.name} className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-lg bg-[rgba(34,197,94,0.1)] text-[var(--success)] flex items-center justify-center">
                      <Puzzle size={18} />
                    </div>
                    <span className="text-sm font-medium text-[var(--text-primary)]">{s.name}</span>
                  </div>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-xl bg-[rgba(34,197,94,0.1)] text-[var(--success)] font-medium">已安装</span>
                </div>
              </div>
            )) : <span className="text-[13px] text-[var(--text-dim)] col-span-2">{lexicon.concepts.noSkills}</span>}
          </div>
        )}
        {tab === 'memory' && (
          <div className="flex flex-col gap-4">
            {memoryData ? (
              <>
                <div className="flex items-center gap-4 text-[13px]">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 glass-medium rounded-[var(--radius)] border border-[var(--border)]">
                    <span className="text-[var(--accent)]">📝</span>
                    <span className="text-[var(--text-primary)] font-medium">{memoryData.memory.length}</span>
                    <span className="text-[var(--text-dim)]">条{lexicon.concepts.memory}</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 glass-medium rounded-[var(--radius)] border border-[var(--border)]">
                    <span className="text-[var(--accent)]">👤</span>
                    <span className="text-[var(--text-primary)] font-medium">{memoryData.userCharCount ?? 0}</span>
                    <span className="text-[var(--text-dim)]">字符用户档案</span>
                  </div>
                  {memoryData.stats && Object.keys(memoryData.stats).length > 0 && (
                    <div className="flex items-center gap-1.5 px-3 py-1.5 glass-medium rounded-[var(--radius)] border border-[var(--border)]">
                      <span className="text-[var(--accent)]">📊</span>
                      <span className="text-[var(--text-primary)] font-medium">{Object.keys(memoryData.stats).length}</span>
                      <span className="text-[var(--text-dim)]">项统计</span>
                    </div>
                  )}
                </div>

                {(memoryData.memoryCharCount != null && memoryData.memoryCharLimit != null) && (
                  <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5">
                    <div className="flex items-center justify-between text-[12px] mb-2">
                      <span className="text-[var(--text-secondary)]">{lexicon.concepts.memoryCapacity}</span>
                      <span className="text-[var(--text-dim)]">{memoryData.memoryCharCount} / {memoryData.memoryCharLimit}</span>
                    </div>
                    <div className="w-full h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (memoryData.memoryCharCount / memoryData.memoryCharLimit) * 100)}%`,
                          backgroundColor: (memoryData.memoryCharCount / memoryData.memoryCharLimit) > 0.9 ? 'var(--danger)' : (memoryData.memoryCharCount / memoryData.memoryCharLimit) > 0.7 ? 'var(--warning)' : 'var(--success)'
                        }}
                      />
                    </div>
                  </div>
                )}

                {(memoryData.userCharCount != null && memoryData.userCharLimit != null) && (
                  <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5">
                    <div className="flex items-center justify-between text-[12px] mb-2">
                      <span className="text-[var(--text-secondary)]">用户档案容量</span>
                      <span className="text-[var(--text-dim)]">{memoryData.userCharCount} / {memoryData.userCharLimit}</span>
                    </div>
                    <div className="w-full h-1 bg-[var(--bg-surface)] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, (memoryData.userCharCount / memoryData.userCharLimit) * 100)}%`,
                          backgroundColor: (memoryData.userCharCount / memoryData.userCharLimit) > 0.9 ? 'var(--danger)' : (memoryData.userCharCount / memoryData.userCharLimit) > 0.7 ? 'var(--warning)' : 'var(--success)'
                        }}
                      />
                    </div>
                  </div>
                )}

                {memoryData.memory.length > 0 && (
                  <div>
                    <div className="text-[13px] font-medium text-[var(--accent)] mb-2.5">{lexicon.concepts.systemMemory}</div>
                    <div className="flex flex-col gap-2">
                      {memoryData.memory.map((entry, i) => (
                        <div key={i} className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5">
                          <div className="text-[12px] text-[var(--text-dim)] mb-1.5">#{entry.index ?? i}</div>
                          <pre className="text-[var(--text-secondary)] whitespace-pre-wrap text-[13px] leading-relaxed max-h-[200px] overflow-y-auto">{entry.content}</pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {memoryData.user && (
                  <div>
                    <div className="text-[13px] font-medium text-[var(--accent)] mb-2.5">{lexicon.concepts.userProfile}</div>
                    <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5">
                      <pre className="text-[var(--text-secondary)] whitespace-pre-wrap text-[13px] leading-relaxed max-h-[200px] overflow-y-auto">{memoryData.user}</pre>
                    </div>
                  </div>
                )}

                {memoryData.memory.length === 0 && !memoryData.user && (
                  <div className="text-center py-12 text-[var(--text-dim)]">
                    <div className="text-4xl mb-3 opacity-30">🧠</div>
                    <p className="text-sm">{lexicon.concepts.noMemory}</p>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-12 text-[var(--text-dim)]">
                <div className="text-4xl mb-3 opacity-30">⏳</div>
                <p className="text-sm">加载中...</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function HistoryPanel({ employeeName, refreshKey = 0, highlightedSessionIds = [], onClose, onViewSession }: {
  employeeName: string
  refreshKey?: number
  highlightedSessionIds?: string[]
  onClose: () => void
  onViewSession: (sessionId: string, messages: ChatMessage[]) => void
}): React.ReactElement {
  const [sessions, setSessions] = useState<SessionDisplay[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadSessions(searchQuery.trim() || undefined)
  }, [employeeName, refreshKey])

  const loadSessions = async (query?: string): Promise<void> => {
    setLoading(true)
    try {
      if (query) {
        const results = await window.hermesAPI.searchSessions(query, employeeName)
        const mapped = (results || []).map(mapSession)
        setSessions(mapped)
      } else {
        const results = await window.hermesAPI.getEmployeeSessions(employeeName)
        const mapped = (results || []).map(mapSession)
        setSessions(mapped)
      }
    } catch { setSessions([]) }
    finally { setLoading(false) }
  }

  const handleSearch = (q: string): void => {
    setSearchQuery(q)
    if (q.trim()) {
      setTimeout(() => loadSessions(q.trim()), 300)
    } else {
      loadSessions()
    }
  }

  const handleDelete = async (sessionId: string): Promise<void> => {
    try {
      await window.hermesAPI.deleteSession(sessionId, employeeName)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      showToast('会话已删除', 'success')
    } catch { showToast('删除失败', 'error') }
  }

  const handleViewSession = async (sessionId: string): Promise<void> => {
    try {
      const messages = await window.hermesAPI.getSessionMessages(sessionId, employeeName)
      if (!messages || messages.length === 0) {
        showToast('此会话暂无消息', 'info')
        return
      }

      const finalMessages = parseSessionMessages(messages as Record<string, unknown>[], sessionId)

      if (finalMessages.length === 0) {
        showToast('此会话暂无消息', 'info')
        return
      }

      onViewSession(sessionId, finalMessages)
    } catch {
      showToast('加载会话失败', 'error')
    }
  }

  return (
    <div className="no-drag absolute right-0 top-0 bottom-0 w-[340px] glass-heavy border-l border-[var(--border)] z-50 flex flex-col animate-slide-in-right shadow-[-8px_0_40px_rgba(0,0,0,0.2)]">
      <div className="flex items-center justify-between px-4 h-[52px] border-b border-[var(--border)] text-[15px] font-semibold">
        <span>历史会话</span>
        <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors"><X size={18} /></button>
      </div>
      <div className="px-3 py-2.5 border-b border-[var(--border)]">
        <input
          value={searchQuery}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="搜索会话..."
          className="w-full glass-medium border border-[var(--border)] rounded-lg py-2 px-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
        />
      </div>
      <div className="flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="text-center py-12 text-[var(--text-dim)] text-sm">加载中...</div>
        ) : sessions.length === 0 ? (
          <div className="text-center py-12 text-[var(--text-dim)] text-sm">暂无历史会话</div>
        ) : (
          sessions.map(s => (
            <div
              key={s.id}
              onClick={() => handleViewSession(s.id)}
              className={`px-3.5 py-3 rounded-[var(--radius)] transition-all hover:bg-[var(--bg-hover)] mb-0.5 cursor-pointer ${
                highlightedSessionIds.includes(s.id) ? 'bg-[var(--accent-glow)] border border-[rgba(124,106,239,0.22)]' : 'border border-transparent'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                {sessionSourceLabel(s.source) && (
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    isExternalSessionSource(s.source)
                      ? 'bg-[rgba(34,197,94,0.12)] text-[var(--success)]'
                      : 'bg-[var(--accent-glow)] text-[var(--accent)]'
                  }`}>
                    {sessionSourceLabel(s.source)}
                  </span>
                )}
                {highlightedSessionIds.includes(s.id) && (
                  <span className="shrink-0 rounded bg-[rgba(234,179,8,0.14)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--warning)]">新</span>
                )}
                <div className="text-sm font-medium text-[var(--text-primary)] truncate">{s.title || '未命名会话'}</div>
              </div>
              <div className="text-xs text-[var(--text-dim)] mt-0.5">{formatDate(s.startedAt)} · {s.source === 'cron' ? '执行结果' : `${s.messageCount} 条消息`}</div>
              <div className="flex gap-1.5 mt-2">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleViewSession(s.id) }}
                  className="bg-[var(--accent)] text-white border-none px-2.5 py-1 rounded-[var(--radius)] text-xs cursor-pointer hover:opacity-85"
                >查看</button>
                <Popconfirm title="确认删除此会话？" onConfirm={() => handleDelete(s.id)}>
                  <button
                    className="bg-[var(--danger)] text-white border-none px-2.5 py-1 rounded-[var(--radius)] text-xs cursor-pointer hover:opacity-85"
                  >删除</button>
                </Popconfirm>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default function Chat(): React.ReactElement {
  const { isMac } = usePlatform()
  const { lexicon } = useTheme()
  const [employees, setEmployees] = useState<EmployeeInfo[]>([])
  const [currentEmployeeName, setCurrentEmployeeName] = useState<string | null>(null)
  const [chatHistories, setChatHistories] = useState<Record<string, ChatMessage[]>>({})
  const [sessionIds, setSessionIds] = useState<Record<string, string | null>>({})
  const [streamStates, setStreamStates] = useState<Record<string, EmployeeStreamState>>({})
  const [petHidden, setPetHidden] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [input, setInput] = useState('')
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const [showDetail, setShowDetail] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [approvalRequest, setApprovalRequest] = useState<ApprovalRequest | null>(null)
  const [slashPopupVisible, setSlashPopupVisible] = useState(false)
  const [slashItems, setSlashItems] = useState(SLASH_COMMANDS)
  const [slashActiveIndex, setSlashActiveIndex] = useState(0)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [isComposing, setIsComposing] = useState(false)
  const [savedModels, setSavedModels] = useState<SavedModel[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)
  const [externalSessionUpdates, setExternalSessionUpdates] = useState<Record<string, string[]>>({})
  const [showActivityDetails, setShowActivityDetails] = useState(() => {
    try {
      return localStorage.getItem('hermes:show-activity-details') === 'true'
    } catch {
      return false
    }
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const messageQueueRef = useRef<Record<string, string[]>>({})
  const streamingThinkingMapRef = useRef<Record<string, string>>({})
  const chunkBufferRef = useRef<Record<string, string[]>>({})
  const chunkFlushScheduledRef = useRef<Record<string, boolean>>({})

  const flushChunks = useCallback((profileName: string) => {
    const chunks = chunkBufferRef.current[profileName]
    if (!chunks || chunks.length === 0) {
      chunkFlushScheduledRef.current[profileName] = false
      return
    }
    chunkBufferRef.current[profileName] = []
    chunkFlushScheduledRef.current[profileName] = false
    const combined = chunks.join('')
    setChatHistories(prev => {
      const history = prev[profileName] || []
      const last = history[history.length - 1]
      if (last && last.role === 'assistant') {
        return { ...prev, [profileName]: [...history.slice(0, -1), { ...last, content: last.content + combined }] }
      }
      if (!combined.trim()) return prev
      return { ...prev, [profileName]: [...history, { id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'assistant' as const, content: combined, timestamp: Date.now() }] }
    })
  }, [])

  const currentEmployeeNameRef = useRef(currentEmployeeName)
  currentEmployeeNameRef.current = currentEmployeeName
  const sessionIdsRef = useRef(sessionIds)
  sessionIdsRef.current = sessionIds
  const streamStatesRef = useRef(streamStates)
  streamStatesRef.current = streamStates
  const chatHistoriesRef = useRef(chatHistories)
  chatHistoriesRef.current = chatHistories
  const externalSessionUpdatesRef = useRef(externalSessionUpdates)
  externalSessionUpdatesRef.current = externalSessionUpdates
  const showHistoryRef = useRef(showHistory)
  showHistoryRef.current = showHistory
  const loadingLatestSessionRef = useRef<Record<string, boolean>>({})

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  const scrollToBottomRef = useRef(scrollToBottom)
  scrollToBottomRef.current = scrollToBottom

  const currentStream = useMemo(() => {
    const name = currentEmployeeName || ''
    return streamStates[name] || DEFAULT_STREAM
  }, [streamStates, currentEmployeeName])

  const isStreaming = currentStream.isStreaming
  const currentExternalSessionUpdates = currentEmployeeName ? (externalSessionUpdates[currentEmployeeName] || []) : []

  useEffect(() => {
    try {
      localStorage.setItem('hermes:show-activity-details', String(showActivityDetails))
    } catch { /* ignore */ }
  }, [showActivityDetails])

  const currentEmployee = useMemo(() =>
    employees.find(e => e.name === currentEmployeeName) || null
  , [employees, currentEmployeeName])

  const currentMessages = useMemo(() =>
    chatHistories[currentEmployeeName || ''] || []
  , [chatHistories, currentEmployeeName])

  const visibleMessages = useMemo(() => {
    if (showActivityDetails) return currentMessages
    return currentMessages.filter((msg) => {
      if (msg.role === 'user') return true
      return !!msg.content
    })
  }, [currentMessages, showActivityDetails])

  const petActivity = useMemo(() => {
    if (currentStream.streamingCurrentTool) {
      return { type: 'tool' as const, label: currentStream.streamingCurrentTool }
    }
    if (currentStream.streamingThinking.trim()) {
      return { type: 'thinking' as const }
    }
    return null
  }, [currentStream.streamingCurrentTool, currentStream.streamingThinking])

  const filteredEmployees = useMemo(() => {
    if (!searchQuery) return employees
    const q = searchQuery.toLowerCase()
    return employees.filter(e =>
      (e.name || '').toLowerCase().includes(q) ||
      (e.displayName || '').toLowerCase().includes(q) ||
      (e.model || '').toLowerCase().includes(q)
    )
  }, [employees, searchQuery])

  const refreshEmployeeStatus = useCallback(async (employeeName: string): Promise<void> => {
    try {
      const status = await window.hermesAPI.getEmployeeStatus(employeeName)
      setEmployees(prev => prev.map(e =>
        e.name === employeeName ? { ...e, status: mapStatus(status) } : e
      ))
    } catch {
      try {
        const list = await window.hermesAPI.listEmployees()
        const emp = (list || []).find((e: EmployeeInfo) => e.name === employeeName)
        if (emp) {
          setEmployees(prev => prev.map(e =>
            e.name === employeeName ? { ...e, status: mapStatus(emp.status || '') } : e
          ))
        }
      } catch {
        /* ignore */
      }
    }
  }, [])

  const addAttachmentFiles = useCallback(async (files: File[] | FileList): Promise<void> => {
    const list = Array.from(files)
    if (list.length === 0) return
    const next: Attachment[] = []
    for (const file of list) {
      if (attachments.length + next.length >= MAX_ATTACHMENTS_PER_MESSAGE) {
        showToast(`每条消息最多 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件`, 'error')
        break
      }

      const mime = file.type || ''
      const name = file.name || 'untitled'
      try {
        if (isImageMime(mime)) {
          if (file.size > MAX_IMAGE_BYTES) {
            showToast(`${name} 图片超过 20MB`, 'error')
            continue
          }
          next.push({
            id: attachmentId(),
            kind: 'image',
            name,
            mime,
            size: file.size,
            dataUrl: await readFileAsDataUrl(file)
          })
          continue
        }

        if (isTextFile(mime, name)) {
          if (file.size > MAX_TEXT_BYTES) {
            showToast(`${name} 文本文件超过 256KB`, 'error')
            continue
          }
          next.push({
            id: attachmentId(),
            kind: 'text-file',
            name,
            mime: mime || 'text/plain',
            size: file.size,
            text: await readFileAsText(file)
          })
          continue
        }

        let filePath = ''
        try {
          filePath = window.hermesAPI.getPathForFile(file) || ''
        } catch {
          filePath = ''
        }
        if (!filePath) {
          const base64 = await readFileAsBase64(file)
          filePath = await window.hermesAPI.stageAttachment(sessionIds[currentEmployeeName || ''] || currentEmployeeName || 'default', name, base64)
        }
        next.push({
          id: attachmentId(),
          kind: 'path-ref',
          name,
          mime: mime || 'application/octet-stream',
          size: file.size,
          path: filePath
        })
      } catch {
        showToast(`${name} 读取失败`, 'error')
      }
    }
    if (next.length > 0) {
      setAttachments(prev => [...prev, ...next])
    }
  }, [attachments.length, currentEmployeeName, sessionIds])

  useEffect(() => {
    loadEmployees()
  }, [])

  useEffect(() => {
    window.hermesAPI.listSavedModels().then(setSavedModels).catch(() => {})
  }, [])

  useEffect(() => {
    if (!modelDropdownOpen) return
    const handler = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      if (!target.closest('.model-dropdown-container')) {
        setModelDropdownOpen(false)
      }
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [modelDropdownOpen])

  useEffect(() => {
    const unsubChunk = window.hermesAPI.onChatChunk((data) => {
      if (!data.chunk) return
      if (!chunkBufferRef.current[data.profileName]) {
        chunkBufferRef.current[data.profileName] = []
      }
      chunkBufferRef.current[data.profileName].push(data.chunk)
      if (!chunkFlushScheduledRef.current[data.profileName]) {
        chunkFlushScheduledRef.current[data.profileName] = true
        requestAnimationFrame(() => flushChunks(data.profileName))
      }
      setStreamStates(prev => ({ ...prev, [data.profileName]: { ...(prev[data.profileName] || DEFAULT_STREAM), isStreaming: true } }))
    })

    const unsubDone = window.hermesAPI.onChatDone((data) => {
      const empName = data.profileName
      if (data.sessionId) setSessionIds(prev => ({ ...prev, [data.profileName]: data.sessionId || null }))

      flushChunks(empName)

      const thinkingContent = streamingThinkingMapRef.current[empName] || undefined

      setChatHistories(prev => {
        const history = prev[empName] || []
        const last = history[history.length - 1]
        if (last && last.role === 'assistant') {
          const updatedToolCalls = last.toolCalls?.map(tc =>
            tc.status === 'running' ? { ...tc, status: 'done' as const, result: tc.result || '已完成' } : tc
          )
          return { ...prev, [empName]: [...history.slice(0, -1), { ...last, toolCalls: updatedToolCalls, thinking: thinkingContent }] }
        }
        return prev
      })

      streamingThinkingMapRef.current = { ...streamingThinkingMapRef.current, [empName]: '' }

      const remainingQueue = messageQueueRef.current[empName] || []
      if (remainingQueue.length > 0) {
        const next = remainingQueue[0]
        messageQueueRef.current = { ...messageQueueRef.current, [empName]: remainingQueue.slice(1) }
        setStreamStates(prev => ({ ...prev, [empName]: { ...DEFAULT_STREAM, isStreaming: true, messageQueue: remainingQueue.slice(1) } }))
        setTimeout(() => doSend(empName, next, true), 100)
      } else {
        messageQueueRef.current = { ...messageQueueRef.current, [empName]: [] }
        setStreamStates(prev => ({ ...prev, [empName]: DEFAULT_STREAM }))
        void refreshEmployeeStatus(empName)
      }
    })

    const unsubError = window.hermesAPI.onChatError((data) => {
      flushChunks(data.profileName)
      const thinkingContent = streamingThinkingMapRef.current[data.profileName] || undefined
      setStreamStates(prev => ({ ...prev, [data.profileName]: DEFAULT_STREAM }))
      setChatHistories(prev => {
        const history = prev[data.profileName] || []
        const last = history[history.length - 1]
        if (last && last.role === 'assistant') {
          const updatedToolCalls = last.toolCalls?.map(tc =>
            tc.status === 'running' ? { ...tc, status: 'error' as const, error: data.error } : tc
          )
          return { ...prev, [data.profileName]: [...history.slice(0, -1), { ...last, toolCalls: updatedToolCalls, thinking: thinkingContent }] }
        }
        return { ...prev, [data.profileName]: [...history, { id: `error-${Date.now()}`, role: 'assistant' as const, content: `❌ ${data.error || '发生错误'}`, timestamp: Date.now() }] }
      })
      streamingThinkingMapRef.current = { ...streamingThinkingMapRef.current, [data.profileName]: '' }
      void refreshEmployeeStatus(data.profileName)
      showToast(data.error || '发生错误', 'error')
    })

    const unsubToolProgress = window.hermesAPI.onChatToolProgress((data) => {
      const status = data.status || 'running'
      const isCompleted = status === 'completed' || status === 'done'

      if (isCompleted) {
        setChatHistories(prev => {
          const history = prev[data.profileName] || []
          const last = history[history.length - 1]
          if (last && last.role === 'assistant' && last.toolCalls) {
            let toolIdx = -1
            for (let i = last.toolCalls.length - 1; i >= 0; i--) {
              if (last.toolCalls[i].name === data.toolName && last.toolCalls[i].status === 'running') {
                toolIdx = i
                break
              }
            }
            if (toolIdx >= 0) {
              const newToolCalls = [...last.toolCalls]
              newToolCalls[toolIdx] = {
                ...newToolCalls[toolIdx],
                result: data.result ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)) : '已完成',
                error: data.error ? String(data.error) : undefined,
                status: (data.error ? 'error' : 'done') as 'done' | 'error'
              }
              return { ...prev, [data.profileName]: [...history.slice(0, -1), { ...last, toolCalls: newToolCalls }] }
            }
          }
          return prev
        })
      } else {
        setChatHistories(prev => {
          const history = prev[data.profileName] || []
          const last = history[history.length - 1]
          const newToolCall: ToolCallInfo = {
            name: data.toolName || data.tool,
            args: data.args ? (typeof data.args === 'string' ? data.args : JSON.stringify(data.args)) : undefined,
            status: 'running' as const
          }
          if (last && last.role === 'assistant') {
            return { ...prev, [data.profileName]: [...history.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls || []), newToolCall] }] }
          }
          return { ...prev, [data.profileName]: [...history, { id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'assistant' as const, content: '', timestamp: Date.now(), toolCalls: [newToolCall] }] }
        })
      }

      setStreamStates(prev => {
        const emp = prev[data.profileName] || DEFAULT_STREAM
        return { ...prev, [data.profileName]: { ...emp, isStreaming: true, streamingCurrentTool: isCompleted ? null : (data.toolName || data.tool) } }
      })
      setTimeout(() => scrollToBottomRef.current(), 10)
    })

    const unsubToolStart = window.hermesAPI.onChatToolStart((data) => {
      setChatHistories(prev => {
        const history = prev[data.profileName] || []
        const last = history[history.length - 1]
        const newToolCall: ToolCallInfo = {
          name: data.toolName,
          args: data.args ? (typeof data.args === 'string' ? data.args : JSON.stringify(data.args)) : undefined,
          status: 'running' as const
        }
        if (last && last.role === 'assistant') {
          return { ...prev, [data.profileName]: [...history.slice(0, -1), { ...last, toolCalls: [...(last.toolCalls || []), newToolCall] }] }
        }
        return { ...prev, [data.profileName]: [...history, { id: `agent-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'assistant' as const, content: '', timestamp: Date.now(), toolCalls: [newToolCall] }] }
      })
      setStreamStates(prev => {
        const emp = prev[data.profileName] || DEFAULT_STREAM
        return { ...prev, [data.profileName]: { ...emp, isStreaming: true, streamingCurrentTool: data.toolName } }
      })
      setTimeout(() => scrollToBottomRef.current(), 10)
    })

    const unsubToolEnd = window.hermesAPI.onChatToolEnd((data) => {
      setChatHistories(prev => {
        const history = prev[data.profileName] || []
        const last = history[history.length - 1]
        if (last && last.role === 'assistant' && last.toolCalls) {
          let toolIdx = -1
          for (let i = last.toolCalls.length - 1; i >= 0; i--) {
            if (last.toolCalls[i].name === data.toolName && last.toolCalls[i].status === 'running') {
              toolIdx = i
              break
            }
          }
          if (toolIdx >= 0) {
            const newToolCalls = [...last.toolCalls]
            newToolCalls[toolIdx] = {
              ...newToolCalls[toolIdx],
              result: data.result ? (typeof data.result === 'string' ? data.result : JSON.stringify(data.result)) : '已完成',
              error: data.error ? String(data.error) : undefined,
              status: (data.error ? 'error' : 'done') as 'done' | 'error'
            }
            return { ...prev, [data.profileName]: [...history.slice(0, -1), { ...last, toolCalls: newToolCalls }] }
          }
        }
        return prev
      })
    })

    const unsubThinking = window.hermesAPI.onChatThinking((data) => {
      streamingThinkingMapRef.current = {
        ...streamingThinkingMapRef.current,
        [data.profileName]: (streamingThinkingMapRef.current[data.profileName] || '') + data.chunk
      }
      setStreamStates(prev => {
        const emp = prev[data.profileName] || DEFAULT_STREAM
        return { ...prev, [data.profileName]: { ...emp, streamingThinking: emp.streamingThinking + data.chunk } }
      })
    })

    const unsubNewConv = window.hermesAPI.onNewConversation(() => {
      const empName = currentEmployeeNameRef.current
      if (empName) {
        setChatHistories(prev => ({ ...prev, [empName]: [] }))
        setSessionIds(prev => ({ ...prev, [empName]: null }))
        setStreamStates(prev => ({ ...prev, [empName]: DEFAULT_STREAM }))
        inputRef.current?.focus()
      }
    })

    const unsubUsage = window.hermesAPI.onChatUsage((data) => {
      setStreamStates(prev => {
        const emp = prev[data.profileName] || DEFAULT_STREAM
        return { ...prev, [data.profileName]: { ...emp, streamingUsage: { promptTokens: data.promptTokens, completionTokens: data.completionTokens, totalTokens: data.totalTokens } } }
      })
    })

    const unsubApproval = window.hermesAPI.onChatApprovalRequest((data) => {
      setApprovalRequest({ id: data.approvalId, employeeId: data.profileName, tool: data.tool, args: { command: data.command }, riskLevel: data.risk as 'low' | 'medium' | 'high' })
    })

    const unsubStatus = window.hermesAPI.onEmployeeStatusChanged((data) => {
      setEmployees(prev => prev.map(e =>
        e.name === data.profileName ? { ...e, status: mapStatus(data.status) } : e
      ))
    })

    const unsubListChanged = window.hermesAPI.onEmployeeListChanged(() => {
      loadEmployees()
    })

    return () => {
      unsubChunk()
      unsubDone()
      unsubError()
      unsubToolProgress()
      unsubToolStart()
      unsubToolEnd()
      unsubThinking()
      unsubNewConv()
      unsubUsage()
      unsubApproval()
      unsubStatus()
      unsubListChanged()
    }
  }, [])

  useEffect(() => {
    if (currentMessages.length > 0 || isStreaming) {
      scrollToBottom()
    }
  }, [currentMessages.length, isStreaming, scrollToBottom])

  const loadEmployees = async (): Promise<void> => {
    try {
      const list = await window.hermesAPI.listEmployees()
      const mapped = (list || []).map(e => ({ ...e, status: mapStatus(e.status || '') }))
      setEmployees(mapped)
      if (mapped.length > 0 && !currentEmployeeName) {
        const firstAwake = mapped.find((e: EmployeeInfo) => e.status === 'awake')
        selectEmployee((firstAwake || mapped[0]).name)
      }
    } catch {
      /* ignore */
    }
  }

  const loadSessionIntoChat = useCallback(async (employeeName: string, sessionId: string): Promise<boolean> => {
    try {
      const rawMessages = await window.hermesAPI.getSessionMessages(sessionId, employeeName)
      const parsedMessages = parseSessionMessages(rawMessages as Record<string, unknown>[], sessionId)
      setChatHistories(prev => ({ ...prev, [employeeName]: parsedMessages }))
      setSessionIds(prev => ({ ...prev, [employeeName]: sessionId }))
      setExternalSessionUpdates(prev => {
        const current = prev[employeeName] || []
        if (!current.includes(sessionId)) return prev
        return { ...prev, [employeeName]: current.filter(id => id !== sessionId) }
      })
      return true
    } catch {
      showToast('加载会话失败', 'error')
      return false
    }
  }, [])

  const loadLatestSession = useCallback(async (employeeName: string): Promise<void> => {
    if (loadingLatestSessionRef.current[employeeName]) return
    const localHistory = chatHistories[employeeName] || []
    if (localHistory.length > 0) return
    loadingLatestSessionRef.current = { ...loadingLatestSessionRef.current, [employeeName]: true }
    try {
      const sessions = await window.hermesAPI.getEmployeeSessions(employeeName)
      const latest = (sessions || []).map(mapSession)[0]
      if (!latest?.id) {
        setChatHistories(prev => ({ ...prev, [employeeName]: [] }))
        setSessionIds(prev => ({ ...prev, [employeeName]: null }))
        return
      }
      await loadSessionIntoChat(employeeName, latest.id)
    } finally {
      loadingLatestSessionRef.current = { ...loadingLatestSessionRef.current, [employeeName]: false }
    }
  }, [chatHistories, loadSessionIntoChat])

  useEffect(() => {
    const refreshIncomingSession = async (
      employeeName: string,
      sessionId: string,
      source?: string,
      title?: string,
    ): Promise<void> => {
      const markExternalUpdate = (): void => {
        setExternalSessionUpdates(prev => {
          const current = prev[employeeName] || []
          if (current.includes(sessionId)) return prev
          return { ...prev, [employeeName]: [sessionId, ...current].slice(0, 20) }
        })
      }

      const streamState = streamStatesRef.current[employeeName] || DEFAULT_STREAM
      if (streamState.isStreaming || streamState.messageQueue.length > 0) {
        markExternalUpdate()
        return
      }

      const isCurrentEmployee = currentEmployeeNameRef.current === employeeName
      const isScheduleSession = sessionSourceLabel(source) === '日程'

      if (isScheduleSession) {
        const alreadyLoaded =
          sessionIdsRef.current[employeeName] === sessionId &&
          (chatHistoriesRef.current[employeeName] || []).length > 0
        if (alreadyLoaded) {
          if (!isCurrentEmployee) markExternalUpdate()
          return
        }
        const loaded = await loadSessionIntoChat(employeeName, sessionId)
        if (!loaded) return
        if (isCurrentEmployee) {
          setTimeout(() => scrollToBottomRef.current(), 20)
          showToast(`日程有新消息${title ? `：${title}` : ''}`, 'info')
        } else {
          markExternalUpdate()
        }
        if (showHistoryRef.current) {
          setHistoryRefreshKey(value => value + 1)
        }
        return
      }

      const activeSessionId = sessionIdsRef.current[employeeName]
      const loadedHistory = chatHistoriesRef.current[employeeName] || []
      const shouldRefreshVisibleSession =
        activeSessionId === sessionId ||
        (isCurrentEmployee && (!activeSessionId || loadedHistory.length === 0))

      if (shouldRefreshVisibleSession) {
        await loadSessionIntoChat(employeeName, sessionId)
        if (isCurrentEmployee) {
          setTimeout(() => scrollToBottomRef.current(), 20)
          if (sessionSourceLabel(source)) {
            showToast(`${sessionSourceLabel(source)}有新消息${title ? `：${title}` : ''}`, 'info')
          }
        }
        return
      }

      markExternalUpdate()

      if (isCurrentEmployee && showHistoryRef.current) {
        setHistoryRefreshKey(value => value + 1)
      }
    }

    const unsubSessionUpdated = window.hermesAPI.onSessionUpdated(async (data) => {
      const employeeName = data.profileName
      if (!employeeName || !data.sessionId) return
      await refreshIncomingSession(employeeName, data.sessionId, data.source, data.title)
    })

    const unsubCronSessionCreated = window.hermesAPI.onCronSessionCreated(async (data) => {
      if (!data.profileName || !data.sessionId) return
      await refreshIncomingSession(data.profileName, data.sessionId, 'cron', data.title)
    })

    return () => {
      unsubSessionUpdated()
      unsubCronSessionCreated()
    }
  }, [loadSessionIntoChat])

  const selectEmployee = useCallback(async (employeeName: string) => {
    setCurrentEmployeeName(employeeName)
    setPetHidden(false)
    setShowDetail(false)
    setShowHistory(false)

    const emp = employees.find(e => e.name === employeeName)
    if (emp && (emp.status === 'sleeping' || emp.status === 'error')) {
      wakeUpEmployee(employeeName)
    }

    const pendingExternalSession = externalSessionUpdatesRef.current[employeeName]?.[0]
    if (pendingExternalSession) {
      await loadSessionIntoChat(employeeName, pendingExternalSession)
    } else {
      loadLatestSession(employeeName)
    }
    inputRef.current?.focus()
  }, [employees, loadLatestSession, loadSessionIntoChat])

  const deleteCurrentSession = useCallback(async (): Promise<void> => {
    if (!currentEmployeeName) return
    const sid = sessionIds[currentEmployeeName]
    if (!sid) {
      setChatHistories(prev => ({ ...prev, [currentEmployeeName]: [] }))
      showToast('当前没有可删除的历史会话', 'info')
      return
    }
    try {
      const result = await window.hermesAPI.deleteSession(sid, currentEmployeeName)
      if (result.success) {
        setChatHistories(prev => ({ ...prev, [currentEmployeeName]: [] }))
        setSessionIds(prev => ({ ...prev, [currentEmployeeName]: null }))
        setShowHistory(false)
        showToast('会话已彻底删除', 'success')
      } else {
        showToast(result.error || '删除失败', 'error')
      }
    } catch {
      showToast('删除失败', 'error')
    }
  }, [currentEmployeeName, sessionIds])

  const wakeUpEmployee = async (employeeName: string): Promise<void> => {
    setEmployees(prev => prev.map(e => e.name === employeeName ? { ...e, status: 'busy' as const } : e))
    try {
      await window.hermesAPI.wakeUpEmployee(employeeName)
      const pollStatus = async (retries: number): Promise<boolean> => {
        if (retries <= 0) return false
        await new Promise(r => setTimeout(r, 2000))
        try {
          const list = await window.hermesAPI.listEmployees()
          const emp = (list || []).find((e: EmployeeInfo) => e.name === employeeName)
          if (emp) {
            const mapped = mapStatus(emp.status || '')
            if (mapped === 'awake') {
              setEmployees(prev => prev.map(e => e.name === employeeName ? { ...e, status: 'awake' as const } : e))
              return true
            }
            if (mapped === 'error') {
              setEmployees(prev => prev.map(e => e.name === employeeName ? { ...e, status: 'error' as const } : e))
              return true
            }
          }
          return pollStatus(retries - 1)
        } catch { return pollStatus(retries - 1) }
      }
      const resolved = await pollStatus(10)
      if (!resolved) {
        await refreshEmployeeStatus(employeeName)
      }
    } catch {
      setEmployees(prev => prev.map(e => e.name === employeeName ? { ...e, status: 'error' as const } : e))
    }
  }

  const sleepEmployee = async (employeeName: string): Promise<void> => {
    try {
      await window.hermesAPI.sleepEmployee(employeeName)
      setEmployees(prev => prev.map(e => e.name === employeeName ? { ...e, status: 'sleeping' as const } : e))
    } catch { showToast('休眠失败', 'error') }
  }

  const deleteEmployee = async (employeeName: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.deleteEmployee(employeeName)
      if (result.success) {
        if (currentEmployeeName === employeeName) {
          setCurrentEmployeeName(null)
        }
        setChatHistories(prev => {
          const next = { ...prev }
          delete next[employeeName]
          return next
        })
        setStreamStates(prev => {
          const next = { ...prev }
          delete next[employeeName]
          return next
        })
        await loadEmployees()
        showToast('员工已删除', 'success')
      } else {
        showToast(result.error || '删除失败', 'error')
      }
    } catch { showToast('删除失败', 'error') }
  }

  const doSend = useCallback((employeeNameOrText: string, textOrSkip?: string | boolean, skipUserAppend = false, sendAttachments?: Attachment[]) => {
    let empName: string
    let text: string
    let skip: boolean
    if (typeof textOrSkip === 'string') {
      empName = employeeNameOrText
      text = textOrSkip
      skip = skipUserAppend
    } else {
      empName = currentEmployeeName || ''
      text = employeeNameOrText
      skip = textOrSkip === true
    }
    if (!empName) return

    if (!skip) {
      const userMsg: ChatMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        role: 'user',
        content: text,
        timestamp: Date.now(),
        ...(sendAttachments && sendAttachments.length > 0 ? { attachments: sendAttachments } : {})
      }
      setChatHistories(prev => {
        const updated = [...(prev[empName] || []), userMsg]
        return { ...prev, [empName]: updated }
      })
    }

    setStreamStates(prev => ({ ...prev, [empName]: { ...DEFAULT_STREAM, isStreaming: true } }))

    setChatHistories(prev => {
      const currentHistory = prev[empName] || []
      const historyForApiSource =
        !skip &&
        currentHistory.length > 0 &&
        currentHistory[currentHistory.length - 1].role === 'user' &&
        currentHistory[currentHistory.length - 1].content === text
          ? currentHistory.slice(0, -1)
          : currentHistory
      const historyForApi = historyForApiSource.map(m => ({ role: m.role, content: m.content }))
      window.hermesAPI.sendMessage(empName, text, historyForApi, sessionIds[empName] || undefined, sendAttachments).catch(() => {
        setStreamStates(ps => ({ ...ps, [empName]: DEFAULT_STREAM }))
        void refreshEmployeeStatus(empName)
        showToast('发送失败', 'error')
      })
      return prev
    })
  }, [currentEmployeeName, refreshEmployeeStatus, sessionIds])

  const handleSend = useCallback(() => {
    const text = input.trim()
    const sendAttachments = attachments
    if (!text && sendAttachments.length === 0) return

    if (isStreaming) {
      if (sendAttachments.length > 0) {
        showToast('附件消息请等待当前回复完成后再发送', 'info')
        return
      }
      if (text) {
        const empName = currentEmployeeName || ''
        messageQueueRef.current = { ...messageQueueRef.current, [empName]: [...(messageQueueRef.current[empName] || []), text] }
        setStreamStates(prev => {
          const emp = prev[empName] || DEFAULT_STREAM
          return { ...prev, [empName]: { ...emp, messageQueue: [...emp.messageQueue, text] } }
        })
        showToast('消息已加入队列', 'info')
        if (empName) {
          const userMsg: ChatMessage = { id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, role: 'user', content: text, timestamp: Date.now() }
          setChatHistories(prev => ({
            ...prev,
            [empName]: [...(prev[empName] || []), userMsg]
          }))
        }
        setInput('')
      } else {
        window.hermesAPI.abortChat(currentEmployeeName || '')
      }
      return
    }

    if (text.startsWith('/')) {
      handleSlashCommand(text)
      setInput('')
      return
    }

    setInput('')
    setAttachments([])
    doSend(text, undefined, false, sendAttachments)
  }, [input, attachments, isStreaming, currentEmployeeName, doSend])

  const handleSlashCommand = useCallback((text: string) => {
    const parts = text.split(/\s+/)
    const cmd = parts[0].toLowerCase()

    switch (cmd) {
      case '/new':
      case '/clear':
        if (currentEmployeeName) {
          setChatHistories(prev => ({ ...prev, [currentEmployeeName]: [] }))
          setSessionIds(prev => ({ ...prev, [currentEmployeeName]: null }))
        }
        break
      case '/help': {
        const helpText = SLASH_COMMANDS.map(c => c.cmd + '  —  ' + c.desc).join('\n')
        if (currentEmployeeName) {
          setChatHistories(prev => ({
            ...prev,
            [currentEmployeeName]: [...(prev[currentEmployeeName] || []), { id: crypto.randomUUID(), role: 'assistant' as const, content: '可用命令：\n\n' + helpText, timestamp: Date.now() }]
          }))
        }
        break
      }
      case '/undo':
        if (currentEmployeeName) {
          setChatHistories(prev => {
            const h = prev[currentEmployeeName] || []
            if (h.length >= 2) {
              return { ...prev, [currentEmployeeName]: h.slice(0, -2) }
            }
            return prev
          })
        }
        break
      case '/retry':
        if (currentEmployeeName) {
          const h = chatHistories[currentEmployeeName] || []
          if (h.length >= 2) {
            const lastUser = h[h.length - 2]
            setChatHistories(prev => ({ ...prev, [currentEmployeeName!]: h.slice(0, -2) }))
            setTimeout(() => doSend(lastUser.content), 50)
          }
        }
        break
      case '/status':
        if (currentEmployee) {
          const statusMsg = `${lexicon.chat.statusLabel}: ${currentEmployee.name}\n状态: ${statusText(currentEmployee.status || '')}\n模型: ${currentEmployee.model || '--'}`
          setChatHistories(prev => ({
            ...prev,
            [currentEmployeeName!]: [...(prev[currentEmployeeName!] || []), { id: crypto.randomUUID(), role: 'assistant' as const, content: statusMsg, timestamp: Date.now() }]
          }))
        }
        break
      case '/usage':
        if (currentStream.streamingUsage && currentEmployeeName) {
          const usageMsg = `${lexicon.chat.usageTitle}:\n输入: ${formatNumber(currentStream.streamingUsage.promptTokens)}\n输出: ${formatNumber(currentStream.streamingUsage.completionTokens)}\n总计: ${formatNumber(currentStream.streamingUsage.totalTokens)}`
          setChatHistories(prev => ({
            ...prev,
            [currentEmployeeName]: [...(prev[currentEmployeeName] || []), { id: crypto.randomUUID(), role: 'assistant' as const, content: usageMsg, timestamp: Date.now() }]
          }))
        } else if (currentEmployeeName) {
          setChatHistories(prev => ({
            ...prev,
            [currentEmployeeName]: [...(prev[currentEmployeeName] || []), { id: crypto.randomUUID(), role: 'assistant' as const, content: lexicon.chat.noUsage, timestamp: Date.now() }]
          }))
        }
        break
      default:
        if (currentEmployeeName) {
          setChatHistories(prev => ({
            ...prev,
            [currentEmployeeName]: [...(prev[currentEmployeeName] || []), { id: crypto.randomUUID(), role: 'assistant' as const, content: `未知命令: ${cmd}\n输入 /help 查看可用命令`, timestamp: Date.now() }]
          }))
        }
    }
  }, [currentEmployeeName, currentEmployee, chatHistories, doSend, currentStream, lexicon])

  const handleInputChange = (value: string): void => {
    setInput(value)
    if (value === '/') {
      setSlashItems(SLASH_COMMANDS)
      setSlashActiveIndex(0)
      setSlashPopupVisible(true)
    } else if (value.startsWith('/') && value.indexOf(' ') < 0) {
      const q = value.toLowerCase()
      const filtered = SLASH_COMMANDS.filter(c => c.cmd.includes(q))
      setSlashItems(filtered)
      setSlashActiveIndex(filtered.length > 0 ? 0 : -1)
      setSlashPopupVisible(filtered.length > 0)
    } else {
      setSlashPopupVisible(false)
    }

    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px'
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (slashPopupVisible) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashActiveIndex(prev => Math.min(prev + 1, slashItems.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashActiveIndex(prev => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        if (slashActiveIndex >= 0 && slashActiveIndex < slashItems.length) {
          setInput(slashItems[slashActiveIndex].cmd + ' ')
        }
        setSlashPopupVisible(false)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setSlashPopupVisible(false)
        return
      }
    }

    if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !isComposing) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleContextMenu = (e: React.MouseEvent, employeeName: string): void => {
    e.preventDefault()
    setContextMenu({ x: e.clientX, y: e.clientY, employeeName })
  }

  useEffect(() => {
    const handleClick = (): void => setContextMenu(null)
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  const handleSearchInput = (q: string): void => {
    setSearchQuery(q)
  }

  const empName = currentEmployee?.displayName || currentEmployee?.name || ''
  const empAvatar = currentEmployee?.avatar || '🧑‍💼'

  return (
    <div className="flex h-full relative">
      {/* Left Panel - Employee List */}
      <div className="w-[var(--sidebar-w)] min-w-[var(--sidebar-w)] glass-medium border-r border-[var(--border)] flex flex-col overflow-hidden z-[2] relative">
        <div className="screen-header-compact drag-region flex items-center justify-between glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
          <h2 className="screen-header-title">{lexicon.entities.employeeList}</h2>
        </div>
        <div className="px-3 pt-4 pb-3 shrink-0">
          <input
            value={searchQuery}
            onChange={(e) => handleSearchInput(e.target.value)}
            placeholder={lexicon.entities.searchEmployee}
            className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] py-2 px-3.5 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-1">
          {filteredEmployees.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-dim)]">
              <div className="text-5xl mb-4 opacity-30">👥</div>
              <p className="text-sm">{searchQuery ? lexicon.entities.noEmployeeMatches : `${lexicon.entities.noEmployees}，点击上方添加`}</p>
            </div>
          ) : (
            filteredEmployees.map(emp => {
              const isActive = currentEmployeeName === emp.name
              const lastMsg = (chatHistories[emp.name] || []).slice(-1)[0]
              const empStreaming = (streamStates[emp.name] || DEFAULT_STREAM).isStreaming
              const empExternalCount = externalSessionUpdates[emp.name]?.length || 0
              return (
                <div
                  key={emp.name}
                  onClick={() => selectEmployee(emp.name)}
                  onContextMenu={(e) => handleContextMenu(e, emp.name)}
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-[var(--radius)] cursor-pointer transition-all mb-0.5 relative border ${
                    isActive ? 'glass-medium border-[rgba(124,106,239,0.15)]' : 'border-transparent hover:bg-[var(--bg-hover)]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-sm bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                  )}
                  <div className="w-10 h-10 rounded-xl glass-medium flex items-center justify-center text-xl shrink-0 relative border border-[var(--border)]">
                    {emp.avatar || '🧑‍💼'}
                    <span className={`absolute -bottom-px -right-px w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${statusDotClass(emp.status || '')}`} />
                    {empStreaming && (
                      <span className="absolute -top-1 -left-1 w-3 h-3 rounded-full bg-[var(--accent)] animate-pulse-custom shadow-[0_0_6px_var(--accent)]" />
                    )}
                    {empExternalCount > 0 && !empStreaming && (
                      <span className="absolute -top-1 -left-1 min-w-4 h-4 rounded-full bg-[var(--danger)] px-1 text-[10px] leading-4 text-white font-semibold shadow-[0_0_8px_rgba(239,68,68,0.35)]">
                        {empExternalCount > 9 ? '9+' : empExternalCount}
                      </span>
                    )}
                    {emp.petSlug && (
                      <span className="absolute -top-1.5 -right-1.5 text-[10px] leading-none">🐾</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate flex items-center gap-1.5">
                      <span className="truncate">{emp.displayName || emp.name}</span>
                      {empStreaming && <span className="text-[10px] text-[var(--accent)] animate-pulse-custom shrink-0">typing...</span>}
                      {empExternalCount > 0 && !empStreaming && <span className="text-[10px] text-[var(--danger)] shrink-0">新消息</span>}
                    </div>
                    <div className="text-xs text-[var(--text-dim)] truncate">{emp.model || lexicon.entities.defaultRole}</div>
                    {lastMsg && !empStreaming && (
                      <div className={`text-xs truncate max-w-[150px] mt-0.5 ${isActive ? 'text-[var(--text-primary)]' : 'text-[var(--text-dim)]'}`}>
                        {lastMsg.content.substring(0, 80)}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {/* Right Panel - Content */}
      <div className="flex-1 flex flex-col overflow-hidden bg-transparent min-w-0 relative z-[2]">
        {showDetail && currentEmployee ? (
          <EmployeeDetail employee={currentEmployee} onBack={() => setShowDetail(false)} />
        ) : currentEmployee ? (
          <>
            {/* Chat Header */}
            <div className="screen-header drag-region flex items-center justify-between border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}>
              <div className="flex items-center gap-3.5 no-drag">
                <div className="w-9 h-9 rounded-[10px] glass-medium flex items-center justify-center text-lg border border-[var(--border)]">{empAvatar}</div>
                <div className="flex flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 15, fontWeight: 600 }}>{empName}</span>
                    <span style={{ fontSize: 11 }} className="text-[var(--text-dim)]">{currentEmployee.model}</span>
                  </div>
                  <span className="text-xs" style={{ color: statusColor(currentEmployee.status || '') }}>{statusText(currentEmployee.status || '')}</span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 no-drag">
                <button
                  onClick={() => setShowActivityDetails(v => !v)}
                  className={`h-8 rounded-[var(--radius)] border px-3 text-xs font-medium cursor-pointer flex items-center gap-1.5 transition-all ${
                    showActivityDetails
                      ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
                      : 'border-[var(--border)] glass-medium text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                  }`}
                  title="显示或隐藏思考过程和工具调用"
                >
                  <span className="text-[11px]">思考/工具</span>
                  <span className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${showActivityDetails ? 'bg-[var(--accent)]' : 'bg-[var(--bg-surface)] border border-[var(--border)]'}`}>
                    <span className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform ${showActivityDetails ? 'translate-x-3' : 'translate-x-0.5'}`} />
                  </span>
                </button>
                <button
                  onClick={() => {
                    setShowHistory(!showHistory)
                    setHistoryRefreshKey(value => value + 1)
                  }}
                  className="relative w-8 h-8 rounded-[var(--radius)] border border-[var(--border)] glass-medium text-[var(--text-dim)] cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
                  title="历史会话"
                >
                  <History size={14} />
                  {currentExternalSessionUpdates.length > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 h-4 rounded-full bg-[var(--warning)] px-1 text-[10px] leading-4 text-black font-semibold">
                      {currentExternalSessionUpdates.length > 9 ? '9+' : currentExternalSessionUpdates.length}
                    </span>
                  )}
                </button>
                <Popconfirm title="确认彻底删除当前会话？" confirmText="删除" onConfirm={deleteCurrentSession}>
                  <button className="w-8 h-8 rounded-[var(--radius)] border border-[var(--border)] glass-medium text-[var(--text-dim)] cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--danger)]" title="删除当前会话">
                    <Trash2 size={14} />
                  </button>
                </Popconfirm>
                <button onClick={() => setShowDetail(true)} className="w-8 h-8 rounded-[var(--radius)] border border-[var(--border)] glass-medium text-[var(--text-dim)] cursor-pointer flex items-center justify-center transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]" title={lexicon.entities.employeeDetail}>
                  <UserCircle size={14} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-6 py-6 flex flex-col gap-4 glass-light">
              {visibleMessages.length === 0 && !isStreaming ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 p-10 text-center">
                  <img src={logoImg} alt="" className="w-24 h-24 opacity-60" />
                  <div className="text-[22px] font-bold text-[var(--text-primary)]">{lexicon.chat.startTitle}</div>
                  <div className="text-sm text-[var(--text-dim)] max-w-[400px] leading-relaxed">
                    {lexicon.chat.startHint(empName)}
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center max-w-[480px] mt-2">
                    {['帮我分析一下这个问题', '/help', '/status'].map(hint => (
                      <button
                        key={hint}
                        onClick={() => { setInput(hint); inputRef.current?.focus() }}
                        className="text-[13px] py-2 px-4 rounded-2xl glass-medium border border-[var(--border)] text-[var(--text-dim)] cursor-pointer transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] hover:border-[var(--accent)]"
                      >
                        {hint}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <>
                  {visibleMessages.map((msg) => {
                    const lastMsg = currentMessages[currentMessages.length - 1]
                    const isStreamingThis = isStreaming && msg.role === 'assistant' && msg.id === lastMsg?.id
                    return (
                      <MessageBubble
                        key={msg.id}
                        msg={msg}
                        empName={empName}
                        empAvatar={empAvatar}
                        isStreaming={isStreamingThis}
                        thinking={isStreamingThis ? currentStream.streamingThinking : msg.thinking}
                        showActivityDetails={showActivityDetails}
                      />
                    )
                  })}
                  {isStreaming && (visibleMessages.length === 0 || visibleMessages[visibleMessages.length - 1].role !== 'assistant') && (
                    <MessageBubble
                      key="streaming-placeholder"
                      msg={{ id: 'streaming-placeholder', role: 'assistant', content: '', timestamp: Date.now() }}
                      empName={empName}
                      empAvatar={empAvatar}
                      isStreaming={true}
                      thinking={currentStream.streamingThinking}
                      showActivityDetails={showActivityDetails}
                    />
                  )}
                  <div ref={messagesEndRef} />
                </>
              )}
            </div>

            {/* Status Bar */}
            {(isStreaming || currentStream.streamingCurrentTool || currentStream.streamingUsage || currentStream.messageQueue.length > 0) && (
              <div className="flex items-center justify-between px-6 py-1.5 text-xs text-[var(--text-dim)] min-h-[28px]">
                <div className="flex items-center gap-3">
                  {currentStream.streamingCurrentTool && (
                    <span className="text-[var(--accent)] animate-pulse-custom">🔧 {currentStream.streamingCurrentTool}</span>
                  )}
                  {currentStream.messageQueue.length > 0 && (
                    <span className="text-[var(--warning)]">📋 队列: {currentStream.messageQueue.length}</span>
                  )}
                </div>
                {currentStream.streamingUsage && (
                  <span className="text-[var(--text-dim)]">
                    {currentStream.streamingUsage.promptTokens ? `输入 ${formatNumber(currentStream.streamingUsage.promptTokens)}` : ''}
                    {currentStream.streamingUsage.completionTokens ? ` · 输出 ${formatNumber(currentStream.streamingUsage.completionTokens)}` : ''}
                    {currentStream.streamingUsage.totalTokens ? ` · 总计 ${formatNumber(currentStream.streamingUsage.totalTokens)}` : ''}
                    {currentStream.streamingUsage.cost ? ` · $${Number(currentStream.streamingUsage.cost).toFixed(4)}` : ''}
                  </span>
                )}
              </div>
            )}

            {/* Pet Sprite */}
            {currentEmployee?.petSlug && !petHidden && (
              <div className="absolute right-10 bottom-[140px] z-[5]">
                <InteractivePet
                  slug={currentEmployee.petSlug}
                  status={isStreaming ? 'streaming' : (currentEmployee.status || 'awake')}
                  scale={0.5}
                  activity={petActivity}
                  onToggleHide={() => setPetHidden(true)}
                />
              </div>
            )}
            {currentEmployee?.petSlug && petHidden && (
              <button
                onClick={() => setPetHidden(false)}
                className="absolute right-4 bottom-[140px] z-[5] w-8 h-8 rounded-full glass-medium border border-[var(--border)] flex items-center justify-center text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-colors"
                title="显示宠物"
              >
                🐾
              </button>
            )}

            {/* Input Area */}
            <div className="relative shrink-0 px-6 pb-6 pt-4 glass-medium border-t border-[var(--border)]">
              {attachments.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-2">
                  {attachments.map(att => (
                    <AttachmentChip
                      key={att.id}
                      attachment={att}
                      onRemove={() => setAttachments(prev => prev.filter(item => item.id !== att.id))}
                    />
                  ))}
                </div>
              )}
              <div className="flex gap-2.5 items-end glass-medium border border-[var(--border)] rounded-2xl py-2 pl-4 pr-2 transition-all focus-within:border-[var(--border-focus)] focus-within:shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files) void addAttachmentFiles(e.target.files)
                    e.target.value = ''
                  }}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  className="self-end w-9 h-9 rounded-xl shrink-0 border border-[var(--border)] text-[var(--text-dim)] flex items-center justify-center transition-all hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                  title="添加附件"
                >
                  <Paperclip size={15} />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => handleInputChange(e.target.value)}
                  onPaste={(e) => {
                    const files = Array.from(e.clipboardData?.files || [])
                    if (files.length > 0) {
                      e.preventDefault()
                      void addAttachmentFiles(files)
                    }
                  }}
                  onKeyDown={handleKeyDown}
                  onCompositionStart={() => setIsComposing(true)}
                  onCompositionEnd={() => setIsComposing(false)}
                  placeholder="输入消息... (/ 命令)"
                  rows={1}
                  className="flex-1 bg-transparent border-none py-2 text-[var(--text-primary)] text-[15px] resize-none outline-none ring-0 ring-transparent max-h-[160px] leading-relaxed placeholder-[var(--text-dim)]"
                />
                {isStreaming ? (
                  <button
                    onClick={() => window.hermesAPI.abortChat(currentEmployeeName || '')}
                    className="self-end min-w-[72px] py-2.5 px-5 rounded-xl shrink-0 bg-[var(--danger)] text-white border-none text-sm font-semibold cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(239,68,68,0.3)]"
                  >
                    <Square size={14} className="inline mr-1" />停止
                  </button>
	                ) : (
                  <button
                    onClick={handleSend}
                    disabled={(!input.trim() && attachments.length === 0) || !currentEmployeeName}
                    className="self-end min-w-[72px] py-2.5 px-5 rounded-xl shrink-0 bg-accent-gradient text-white border-none text-sm font-semibold cursor-pointer transition-all hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Send size={14} className="inline mr-1" />发送
                  </button>
                )}
              </div>
              {/* Slash Command Popup */}
              {slashPopupVisible && (
                <div className="absolute bottom-full left-6 right-6 max-h-[300px] glass-heavy border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden animate-slide-up z-[60] shadow-[0_12px_40px_rgba(0,0,0,0.3)] mb-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-dim)] px-4 pt-3 pb-1.5">命令</div>
                  <div className="overflow-y-auto max-h-[250px] px-1.5 pb-2">
                    {slashItems.map((item, i) => (
                      <div
                        key={item.cmd}
                        onClick={() => { setInput(item.cmd + ' '); setSlashPopupVisible(false); inputRef.current?.focus() }}
                        className={`flex items-center gap-3 py-2 px-3 rounded-lg cursor-pointer transition-all ${i === slashActiveIndex ? 'bg-[var(--accent-glow)]' : 'hover:bg-[var(--accent-glow)]'}`}
                      >
                        <span className="text-[13px] font-semibold text-[var(--accent)] min-w-[100px]">{item.cmd}</span>
                        <span className="text-[13px] text-[var(--text-dim)]">{item.desc}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Model Selector */}
              <div className="relative model-dropdown-container mt-2">
                <button
                  onClick={async () => {
                    if (!modelDropdownOpen) {
                      try {
                        const list = await window.hermesAPI.listSavedModels()
                        setSavedModels(list || [])
                      } catch { /* ignore */ }
                    }
                    setModelDropdownOpen(!modelDropdownOpen)
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs text-[var(--text-dim)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-secondary)] border border-transparent hover:border-[var(--border)]"
                >
                  <span className="font-medium">{currentEmployee.model || '默认模型'}</span>
                  <ChevronDown size={12} />
                </button>
                {modelDropdownOpen && (
                  <div className="absolute bottom-full left-0 mb-1 z-50 min-w-[220px] max-h-[240px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg py-1">
                    {savedModels.length === 0 ? (
                      <div className="px-3 py-2 text-xs text-[var(--text-dim)]">暂无模型，请在设置中添加</div>
                    ) : (
                      savedModels.map(m => (
                        <button
                          key={m.id}
                          onClick={async () => {
                            setModelDropdownOpen(false)
                            const result = await window.hermesAPI.applySavedModel(m.id, currentEmployeeName || undefined)
                            if (result.success) {
                              setEmployees(prev => prev.map(e => e.name === currentEmployeeName ? { ...e, model: m.model, provider: m.provider } : e))
                              showToast(`已切换到 ${m.name || m.model}，正在重启...`)
                              if (currentEmployeeName) {
                                try {
                                  await window.hermesAPI.sleepEmployee(currentEmployeeName)
                                  await new Promise(r => setTimeout(r, 1500))
                                  await window.hermesAPI.wakeUpEmployee(currentEmployeeName)
                                  setTimeout(loadEmployees, 3000)
                                } catch { /* ignore */ }
                              }
                            } else {
                              showToast(result.error || '切换失败', 'error')
                            }
                          }}
                          className={`flex items-center justify-between w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[var(--bg-hover)] ${
                            currentEmployee.model === m.model ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'
                          }`}
                        >
                          <span className="truncate">{m.name || m.model}</span>
                          <span className="shrink-0 ml-2 text-[var(--text-dim)]">{m.provider}</span>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          /* No employee selected */
          <div className="flex flex-col items-center justify-center h-full gap-4 p-10 text-center">
            <img src={logoImg} alt="" className="w-24 h-24 opacity-60" />
            <div className="text-[22px] font-bold text-[var(--text-primary)]">欢迎使用 落云.Hermes</div>
            <div className="text-sm text-[var(--text-dim)] max-w-[400px] leading-relaxed">
              {lexicon.chat.chooseEmployee}
            </div>
          </div>
        )}
      </div>

      {/* History Panel */}
      {showHistory && currentEmployeeName && (
        <HistoryPanel
          employeeName={currentEmployeeName}
          refreshKey={historyRefreshKey}
          highlightedSessionIds={currentExternalSessionUpdates}
          onClose={() => setShowHistory(false)}
          onViewSession={(sessionId, messages) => {
            setChatHistories(prev => ({ ...prev, [currentEmployeeName]: messages }))
            setSessionIds(prev => ({ ...prev, [currentEmployeeName]: sessionId }))
            setExternalSessionUpdates(prev => ({
              ...prev,
              [currentEmployeeName]: (prev[currentEmployeeName] || []).filter(id => id !== sessionId)
            }))
            setShowHistory(false)
          }}
        />
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed z-[100] glass-heavy border border-[var(--border)] rounded-[var(--radius)] py-1 min-w-[160px] shadow-[0_8px_32px_rgba(0,0,0,0.3)] animate-scale-in"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.confirmDelete ? (
            <>
              <div className="px-4 py-2 text-xs text-[var(--danger)] font-medium">{lexicon.entities.deleteEmployeeConfirm}</div>
              <button
                onClick={() => { deleteEmployee(contextMenu.employeeName); setContextMenu(null) }}
                className="block w-full text-left px-4 py-2 text-sm text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] transition-colors"
              >
                确认删除
              </button>
              <button
                onClick={() => setContextMenu({ ...contextMenu, confirmDelete: false })}
                className="block w-full text-left px-4 py-2 text-sm text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-colors"
              >
                取消
              </button>
            </>
          ) : (
            [
              { label: '☀️ 唤醒', action: () => wakeUpEmployee(contextMenu.employeeName) },
              { label: '😴 休眠', action: () => sleepEmployee(contextMenu.employeeName) },
              { label: '🔄 重启', action: () => { wakeUpEmployee(contextMenu.employeeName) } },
              { label: `✏️ 编辑${lexicon.concepts.soul}`, action: () => { setCurrentEmployeeName(contextMenu.employeeName); setShowDetail(true) } },
              { label: '⚙️ 编辑配置', action: () => { setCurrentEmployeeName(contextMenu.employeeName); setShowDetail(true) } },
              { label: '🗑️ 删除', action: () => setContextMenu({ ...contextMenu, confirmDelete: true }), danger: true },
            ].map((item, i) => (
              <button
                key={i}
                onClick={() => { item.action(); if (!item.danger) setContextMenu(null) }}
                className={`block w-full text-left px-4 py-2 text-sm transition-colors ${item.danger ? 'text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
              >
                {item.label}
              </button>
            ))
          )}
        </div>
      )}

      {/* Approval Modal */}
      {approvalRequest && (
        <ApprovalModal
          request={approvalRequest}
          onApprove={async () => {
            try { await window.hermesAPI.sendApproval(approvalRequest.employeeId, approvalRequest.id, true) } catch { /* ignore */ }
            setApprovalRequest(null)
          }}
          onDeny={async () => {
            try { await window.hermesAPI.sendApproval(approvalRequest.employeeId, approvalRequest.id, false) } catch { /* ignore */ }
            setApprovalRequest(null)
          }}
        />
      )}
    </div>
  )
}
