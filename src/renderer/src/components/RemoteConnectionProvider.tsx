import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { RemoteConnection } from '../../../preload/index'
import { useDeploymentMode } from '../hooks/useDeploymentMode'

export type ConnectionState = 'checking' | 'connected' | 'disconnected'

export interface RemoteConnectionStatusPayload {
  connected: boolean
  error?: string
  last_seen_at?: string
  connection: RemoteConnection
}

interface RemoteConnectionContextValue {
  status: ConnectionState
  connection: RemoteConnection | null
  lastSeenAt: string | null
  error: string | null
  refresh: () => Promise<void>
}

const RemoteConnectionContext = createContext<RemoteConnectionContextValue | null>(null)

const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')

function payloadToState(payload: RemoteConnectionStatusPayload | null): {
  status: ConnectionState
  connection: RemoteConnection | null
  lastSeenAt: string | null
  error: string | null
} {
  if (!payload) {
    return { status: 'checking', connection: null, lastSeenAt: null, error: null }
  }
  return {
    status: payload.connected ? 'connected' : 'disconnected',
    connection: payload.connection,
    lastSeenAt: payload.last_seen_at || null,
    error: payload.connected ? null : payload.error || '连接失败',
  }
}

export function RemoteConnectionProvider({ children }: { children: ReactNode }): React.ReactElement {
  const deploymentMode = useDeploymentMode()
  const enabled = deploymentMode === 'client_only'
  const [status, setStatus] = useState<ConnectionState>('checking')
  const [connection, setConnection] = useState<RemoteConnection | null>(null)
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applyPayload = useCallback((payload: RemoteConnectionStatusPayload | null) => {
    const next = payloadToState(payload)
    setStatus(next.status)
    setConnection(next.connection)
    setLastSeenAt(next.lastSeenAt)
    setError(next.error)
  }, [])

  const refresh = useCallback(async (): Promise<void> => {
    if (!enabled) return
    setStatus('checking')
    try {
      if (isElectron && window.hermesAPI.refreshRemoteConnectionStatus) {
        const payload = await window.hermesAPI.refreshRemoteConnectionStatus()
        applyPayload(payload)
        return
      }
      const conn = await window.hermesAPI.getRemoteConnection()
      setConnection(conn)
      const result = await window.hermesAPI.testRemoteConnection(conn)
      if (result.success) {
        const updated = await window.hermesAPI.getRemoteConnection()
        applyPayload({
          connected: true,
          connection: updated,
          last_seen_at: updated.last_seen_at || new Date().toISOString(),
        })
      } else {
        applyPayload({
          connected: false,
          connection: conn,
          error: result.error || '连接失败',
          last_seen_at: conn.last_seen_at,
        })
      }
    } catch (e) {
      setStatus('disconnected')
      setError((e as Error).message || '连接失败')
    }
  }, [enabled, applyPayload])

  useEffect(() => {
    if (!enabled) {
      setStatus('connected')
      setConnection(null)
      setLastSeenAt(null)
      setError(null)
      return
    }

    if (isElectron && window.hermesAPI.onRemoteConnectionStatusChanged) {
      void (async () => {
        const snapshot = window.hermesAPI.getRemoteConnectionStatus
          ? await window.hermesAPI.getRemoteConnectionStatus()
          : null
        if (snapshot) {
          applyPayload(snapshot)
        } else if (window.hermesAPI.refreshRemoteConnectionStatus) {
          const refreshed = await window.hermesAPI.refreshRemoteConnectionStatus()
          applyPayload(refreshed)
        }
      })()
      const unsub = window.hermesAPI.onRemoteConnectionStatusChanged((payload) => {
        applyPayload(payload)
      })
      return () => unsub()
    }

    refresh()
    const id = setInterval(refresh, 30000)
    return () => clearInterval(id)
  }, [enabled, applyPayload, refresh])

  const value = useMemo(
    () => ({ status, connection, lastSeenAt, error, refresh }),
    [status, connection, lastSeenAt, error, refresh],
  )

  return (
    <RemoteConnectionContext.Provider value={value}>
      {children}
    </RemoteConnectionContext.Provider>
  )
}

export function useRemoteConnectionStatus(enabled = true): RemoteConnectionContextValue {
  const ctx = useContext(RemoteConnectionContext)
  if (!ctx) {
    if (!enabled) {
      return {
        status: 'connected',
        connection: null,
        lastSeenAt: null,
        error: null,
        refresh: async () => undefined,
      }
    }
    throw new Error('useRemoteConnectionStatus 必须在 RemoteConnectionProvider 内使用')
  }
  return ctx
}
