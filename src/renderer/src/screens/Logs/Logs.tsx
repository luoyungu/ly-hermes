import { useState, useEffect, useRef, useCallback } from 'react'
import { RefreshCw, Copy, Check, FileText, AlertTriangle, Terminal } from 'lucide-react'
import { useTheme } from '../../components/ThemeProvider'
import { usePlatform } from '../../hooks/usePlatform'

const LOG_FILES = [
  { key: 'agent.log', label: 'Agent 日志', icon: Terminal, color: 'var(--accent)' },
  { key: 'gateway.log', label: 'Gateway 日志', icon: FileText, color: 'var(--info, #3b82f6)' },
  { key: 'errors.log', label: '错误日志', icon: AlertTriangle, color: 'var(--danger, #ef4444)' },
]

export default function LogsScreen(): React.ReactElement {
  const { lexicon } = useTheme()
  const { isMac } = usePlatform()
  const [activeLog, setActiveLog] = useState('agent.log')
  const [logContent, setLogContent] = useState('')
  const [logPath, setLogPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const logContainerRef = useRef<HTMLDivElement>(null)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadLogs = useCallback(async (logFile?: string) => {
    console.log('[Logs] loadLogs called:', { logFile, activeLog })
    setLoading(true)
    try {
      const file = logFile || activeLog
      console.log('[Logs] calling readLogs:', file)
      const result = await window.hermesAPI?.readLogs(file, 500)
      console.log('[Logs] readLogs result:', result)
      if (result) {
        setLogContent(result.content)
        setLogPath(result.path)
      }
    } catch (err) {
      console.error('Failed to load logs:', err)
    } finally {
      setLoading(false)
      console.log('[Logs] loading set to false')
    }
  }, [activeLog])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => loadLogs(), 3000)
    } else {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
        autoRefreshRef.current = null
      }
    }
    return () => {
      if (autoRefreshRef.current) {
        clearInterval(autoRefreshRef.current)
      }
    }
  }, [autoRefresh, loadLogs])

  const handleCopyLogs = async () => {
    try {
      await navigator.clipboard.writeText(logContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* ignore */
    }
  }

  const handleSwitchLog = (key: string) => {
    setActiveLog(key)
    loadLogs(key)
  }

  const parseLogLine = (line: string) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARNING|ERROR|DEBUG|CRITICAL)\s+(\S+?):\s*(.*)$/)
    if (match) {
      const levelMap: Record<string, string> = {
        INFO: 'info',
        WARNING: 'warn',
        ERROR: 'error',
        DEBUG: 'debug',
        CRITICAL: 'error',
      }
      return {
        timestamp: match[1].replace(',', '.'),
        level: levelMap[match[2]] || match[2].toLowerCase(),
        message: `${match[3]}: ${match[4]}`,
      }
    }
    return { timestamp: '', level: '', message: line }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error': return 'text-red-400'
      case 'warn': return 'text-yellow-400'
      case 'info': return 'text-blue-400'
      case 'debug': return 'text-gray-400'
      default: return 'text-[var(--text-primary)]'
    }
  }

  const getLevelBadge = (level: string) => {
    const colors: Record<string, string> = {
      error: 'bg-red-500/20 text-red-300',
      warn: 'bg-yellow-500/20 text-yellow-300',
      info: 'bg-blue-500/20 text-blue-300',
      debug: 'bg-gray-500/20 text-gray-300',
    }
    return colors[level] || 'bg-gray-500/20 text-gray-300'
  }

  const formatTimestamp = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleTimeString('zh-CN', { hour12: false })
    } catch {
      return ts
    }
  }

  const lines = logContent.split('\n').filter(l => l.trim())
  const lineCount = lines.length

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)]">
      {/* Header */}
      <div className="screen-header drag-region flex items-center justify-between border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0 }}>
        <div>
          <h1 className="screen-header-title text-[var(--text-primary)]">{lexicon.nav.logs}</h1>
          <p className="text-xs text-[var(--text-dim)] mt-1 font-mono truncate max-w-md">
            {logPath || '加载中...'}
          </p>
        </div>
        <div className="no-drag flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
              autoRefresh
                ? 'bg-accent-gradient text-white shadow-sm'
                : 'bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            自动刷新
          </button>
          <button
            onClick={handleCopyLogs}
            disabled={!logContent}
            className="p-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            title="复制日志"
          >
            {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
          </button>
          <button
            onClick={() => loadLogs()}
            disabled={loading}
            className="p-2 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Log File Tabs */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] bg-[var(--bg-surface)]/50">
        {LOG_FILES.map(log => {
          const Icon = log.icon
          const isActive = activeLog === log.key
          return (
            <button
              key={log.key}
              onClick={() => handleSwitchLog(log.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all text-sm font-medium ${
                isActive
                  ? 'bg-accent-gradient text-white shadow-sm'
                  : 'bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={14} />
              <span>{log.label}</span>
            </button>
          )
        })}
        <span className="ml-auto text-xs text-[var(--text-dim)]">
          共 {lineCount} 行
        </span>
      </div>

      {/* Log Content */}
      <div
        ref={logContainerRef}
        className="flex-1 overflow-auto px-4 py-3 bg-[var(--bg-primary)]"
      >
        {loading && !logContent ? (
          <div className="flex items-center justify-center h-full text-[var(--text-dim)]">
            <RefreshCw size={20} className="animate-spin mr-2" />
            加载日志中...
          </div>
        ) : !logContent ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-dim)]">
            <FileText size={48} className="mb-4 opacity-30" />
            <p className="text-sm">暂无日志记录</p>
            <p className="text-xs mt-2 opacity-60">请确保 Hermes 服务正在运行</p>
          </div>
        ) : (
          <div className="space-y-1">
            {lines.map((line, index) => {
              const parsed = parseLogLine(line)
              return (
                <div
                  key={index}
                  className="group flex items-start gap-3 px-3 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] transition-colors text-xs font-mono"
                >
                  {parsed.timestamp && (
                    <span className="text-[var(--text-dim)] whitespace-nowrap pt-0.5">
                      {formatTimestamp(parsed.timestamp)}
                    </span>
                  )}
                  {parsed.level && (
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${getLevelBadge(parsed.level)}`}>
                      {parsed.level}
                    </span>
                  )}
                  <span className={`flex-1 break-all ${parsed.level ? getLevelColor(parsed.level) : 'text-[var(--text-primary)]'}`}>
                    {parsed.message}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
