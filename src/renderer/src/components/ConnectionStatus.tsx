import { Wifi, WifiOff, Loader2, RefreshCw } from 'lucide-react'
import { useDeploymentMode } from '../hooks/useDeploymentMode'
import { useRemoteConnectionStatus } from '../hooks/useRemoteConnectionStatus'

interface ConnectionStatusProps {
  compact?: boolean
}

export default function ConnectionStatus({ compact = false }: ConnectionStatusProps): React.ReactElement | null {
  const deploymentMode = useDeploymentMode()
  const enabled = deploymentMode === 'client_only'
  const { status, connection, lastSeenAt, error, refresh } = useRemoteConnectionStatus(enabled)

  if (!enabled) return null

  const label =
    status === 'checking'
      ? '检测连接…'
      : status === 'connected'
        ? connection?.name || `${connection?.host}:${connection?.port}`
        : error || '节点离线'

  const dotClass =
    status === 'connected'
      ? 'bg-[var(--success)]'
      : status === 'checking'
        ? 'bg-[var(--text-dim)] animate-pulse'
        : 'bg-[var(--danger)]'

  if (compact) {
    return (
      <button
        type="button"
        onClick={() => refresh()}
        title={lastSeenAt ? `上次在线：${new Date(lastSeenAt).toLocaleString()}` : label}
        className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] transition-colors"
      >
        <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
        <span className="max-w-[120px] truncate">{label}</span>
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs">
      {status === 'checking' ? (
        <Loader2 size={14} className="animate-spin text-[var(--text-dim)]" />
      ) : status === 'connected' ? (
        <Wifi size={14} className="text-[var(--success)]" />
      ) : (
        <WifiOff size={14} className="text-[var(--danger)]" />
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-[var(--text-primary)]">{label}</div>
        {lastSeenAt && status === 'connected' && (
          <div className="text-[var(--text-dim)]">在线 · {new Date(lastSeenAt).toLocaleTimeString()}</div>
        )}
      </div>
      <button
        type="button"
        onClick={() => refresh()}
        className="shrink-0 rounded p-1 text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
        title="重新检测"
      >
        <RefreshCw size={12} />
      </button>
    </div>
  )
}
