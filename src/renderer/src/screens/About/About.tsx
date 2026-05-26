import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink, Globe } from 'lucide-react'
import { usePlatform } from '../../hooks/usePlatform'
import { useDeploymentMode } from '../../hooks/useDeploymentMode'
import ConnectionStatus from '../../components/ConnectionStatus'
import logoImg from '../../assets/logo.png'
import { useTheme } from '../../components/ThemeProvider'
import type { DesktopWebServerStatus, RemoteConnection } from '../../../../preload/index'

const WEBSITE_URL = 'https://www.luoyungu.com/lyhermes'
const GITHUB_URL = 'https://github.com/luoyungu/ly-hermes'

function StatusRow({ label, value }: { label: string; value: React.ReactNode }): React.ReactElement {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-[var(--border)] last:border-b-0">
      <span className="text-sm text-[var(--text-dim)] shrink-0">{label}</span>
      <span className="text-sm text-[var(--text-primary)] text-right truncate">{value}</span>
    </div>
  )
}

export default function About(): React.ReactElement {
  const { t } = useTranslation()
  const { isMac } = usePlatform()
  const { lexicon } = useTheme()
  const deploymentMode = useDeploymentMode()
  const [appVersion, setAppVersion] = useState('')
  const [remote, setRemote] = useState<RemoteConnection | null>(null)
  const [webServer, setWebServer] = useState<DesktopWebServerStatus | null>(null)

  const isRemoteClient = deploymentMode === 'client_only'

  useEffect(() => {
    window.hermesAPI.getAppVersion().then(setAppVersion).catch(() => {})
  }, [])

  useEffect(() => {
    if (isRemoteClient) {
      window.hermesAPI.getRemoteConnection?.().then(setRemote).catch(() => {})
      return
    }
    window.hermesAPI.getDesktopWebServerStatus?.().then(setWebServer).catch(() => {})
  }, [isRemoteClient])

  const deploymentLabel = isRemoteClient
    ? t('settings.remoteClient')
    : t('settings.localMode')

  const dataStorageLabel = isRemoteClient ? t('about.remoteDb') : t('about.localDb')

  const webServiceLabel = webServer?.running
    ? t('about.webRunning', { host: '127.0.0.1', port: webServer.port || 8787 })
    : t('about.webStopped')

  const remoteNodeLabel = remote
    ? (remote.name ? `${remote.name} (${remote.host}:${remote.port})` : `${remote.host}:${remote.port}`)
    : '—'

  return (
    <div className="flex h-full flex-col">
      <div
        className="screen-header drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0"
        style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}
      >
        <h2 className="screen-header-title">{lexicon.nav.about}</h2>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <div className="animate-fade-in w-full max-w-[520px] text-center">
          <img
            src={logoImg}
            alt={t('app.name')}
            className="mx-auto mb-5 h-24 w-24 rounded-2xl"
            style={{ filter: 'drop-shadow(0 0 12px rgba(124,106,239,0.2))' }}
          />
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">{t('app.name')}</h1>
          <p className="mt-1.5 text-sm text-[var(--text-secondary)]">{lexicon.appSubtitle}</p>
          {appVersion && (
            <span className="mt-3 inline-block rounded-full border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-1 text-xs font-medium text-[var(--text-dim)]">
              v{appVersion}
            </span>
          )}

          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 text-left">
            <StatusRow label={t('about.deploymentMode')} value={deploymentLabel} />
            <StatusRow label={t('about.dataStorage')} value={dataStorageLabel} />
            {!isRemoteClient && (
              <StatusRow label={t('about.webService')} value={webServiceLabel} />
            )}
            {isRemoteClient && (
              <StatusRow label={t('about.remoteNode')} value={remoteNodeLabel} />
            )}
          </div>

          {isRemoteClient && (
            <div className="mt-3">
              <ConnectionStatus />
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-2">
            <a
              href={WEBSITE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              <Globe size={14} />
              {t('about.openWebsite')}
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
            >
              {t('about.github')}
              <ExternalLink size={14} />
            </a>
          </div>

          <p className="mt-10 text-xs text-[var(--text-dim)] opacity-60">{t('about.copyright')}</p>
        </div>
      </div>
    </div>
  )
}
