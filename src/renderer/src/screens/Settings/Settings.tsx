import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { translateError } from '../../../../shared/i18n'
import { useLocale } from '../../components/I18nProvider'
import { usePlatform } from '../../hooks/usePlatform'
import type { SavedModel } from '../../../../preload/index'
import {
  Save,
  LogOut,
  X,
  Check,
  Loader2,
  Clock,
  Users,
  Terminal,
  Settings as SettingsIcon,
  Download,
  Upload,
  AlertTriangle,
  Activity,
  RefreshCw,
  Wrench,
  Plus,
  Pencil,
  Trash2,
  Box,
  ArrowUpCircle,
  Lock as LockIcon,
  FileText,
  Copy,
  AlertCircle,
  Moon,
  Sun,
  Monitor,
  Sparkles,
  Palette,
  Globe
} from 'lucide-react'
import { PROVIDER_PRESETS, getNestedValue, setNestedValue, useEmployeeShared, type ConfigFieldDef } from '../../shared/employee-shared'
import Popconfirm from '../../components/Popconfirm'
import ConnectionStatus from '../../components/ConnectionStatus'
import { useTheme } from '../../components/ThemeProvider'
import { showToast } from '../../App'
import { THEME_PRESETS } from '../../theme/presets'
import type { ThemeMode, AccentColor, UiTheme, DesktopWebServerStatus, DeploymentMode, RemoteConnection } from '../../../../preload/index'

type Section = 'basic' | 'appearance' | 'runtime' | 'models' | 'engine' | 'data' | 'logs'

const ACCENT_COLORS: Record<AccentColor, string> = {
  violet: '#7c6aef',
  indigo: '#7878c0',
  blue: '#4a9ed6',
  green: '#4a9e5c',
  orange: '#d08040',
  lavender: '#9080c8',
  rose: '#c87090',
  slate: '#7a8a9e',
}

const ACCENT_VALUES: AccentColor[] = ['violet', 'indigo', 'blue', 'green', 'orange', 'lavender', 'rose', 'slate']

export default function SettingsScreen(): React.ReactElement {
  const { t } = useTranslation()
  const { locale, setLocale } = useLocale()
  const { isMac, isElectron } = usePlatform()
  const { lexicon, mode, accent, uiTheme, setMode, setAccent, setUiTheme } = useTheme()
  const { globalConfigFields } = useEmployeeShared()
  const [section, setSection] = useState<Section>('basic')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle')

  const [idleTimeout, setIdleTimeout] = useState(60)
  const [maxOnline, setMaxOnline] = useState(5)
  const [webServerStatus, setWebServerStatus] = useState<DesktopWebServerStatus | null>(null)
  const [webServerPort, setWebServerPort] = useState(8787)
  const [webServerSaving, setWebServerSaving] = useState(false)
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode>('local')
  const [remoteConnection, setRemoteConnection] = useState<RemoteConnection>({
    name: '',
    host: '',
    port: 8787,
    api_token: '',
  })
  const [remoteSaving, setRemoteSaving] = useState(false)
  const [remoteServerEnabled, setRemoteServerEnabled] = useState(false)
  const [remoteServerToken, setRemoteServerToken] = useState('')
  const [remoteServerSaving, setRemoteServerSaving] = useState(false)

  const [hermesVersion, setHermesVersion] = useState<string | null>(null)
  const [hermesVersionRefreshing, setHermesVersionRefreshing] = useState(false)
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null)
  const [doctorRunning, setDoctorRunning] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [reinstalling, setReinstalling] = useState(false)
  const [restartingEngines, setRestartingEngines] = useState(false)
  const [updateResult, setUpdateResult] = useState<string | null>(null)
  const [updateResultType, setUpdateResultType] = useState<'success' | 'error' | null>(null)
  const [updateLog, setUpdateLog] = useState<string | null>(null)

  const [appVersion, setAppVersion] = useState('')
  const [appUpdateStatus, setAppUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'not-available' | 'error'>('idle')
  const [appUpdateVersion, setAppUpdateVersion] = useState('')
  const [appUpdatePercent, setAppUpdatePercent] = useState(0)
  const [appUpdateError, setAppUpdateError] = useState('')

  const [backingUp, setBackingUp] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)
  const [backupResult, setBackupResult] = useState<{ success: boolean; message: string } | null>(null)
  const selectedImportPath = useRef<string>('')

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [changePasswordResult, setChangePasswordResult] = useState<{ success: boolean; message: string } | null>(null)

  const [savedModels, setSavedModels] = useState<SavedModel[]>([])
  const [modelFormVisible, setModelFormVisible] = useState(false)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [modelFormName, setModelFormName] = useState('')
  const [modelFormProvider, setModelFormProvider] = useState('')
  const [modelFormCustomProvider, setModelFormCustomProvider] = useState('')
  const [modelFormModel, setModelFormModel] = useState('')
  const [modelFormBaseUrl, setModelFormBaseUrl] = useState('')
  const [modelFormApiKey, setModelFormApiKey] = useState('')
  const [modelFormSaving, setModelFormSaving] = useState(false)
  const [modelFormError, setModelFormError] = useState<string | null>(null)

  const [runtimeObj, setRuntimeObj] = useState<Record<string, unknown>>({})
  const [runtimeOriginal, setRuntimeOriginal] = useState<Record<string, unknown>>({})
  const [runtimeSaving, setRuntimeSaving] = useState(false)

  const loadSavedModels = useCallback(async () => {
    try {
      const list = await window.hermesAPI.listSavedModels()
      setSavedModels(list || [])
    } catch {
      setSavedModels([])
    }
  }, [])

  useEffect(() => {
    window.hermesAPI.getAppConfig().then((config) => {
      const c = config as unknown as Record<string, Record<string, unknown>>
      const d = c.defaults || {}
      setIdleTimeout((d.idle_timeout as number) || 60)
      setMaxOnline((d.max_online as number) || 5)
    }).catch(() => {})
    window.hermesAPI.getDesktopWebServerStatus().then((status) => {
      setWebServerStatus(status)
      setWebServerPort(status.port || 8787)
      setRemoteServerEnabled(status.remoteEnabled === true)
      setRemoteServerToken(status.apiToken || '')
    }).catch(() => {})
    window.hermesAPI.getDeploymentMode().then((mode) => {
      if (mode) setDeploymentMode(mode)
    }).catch(() => {})
    window.hermesAPI.getRemoteConnection().then((conn) => {
      setRemoteConnection(conn)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.hermesAPI.getHermesVersion().then(setHermesVersion).catch(() => {})
    window.hermesAPI.getAppVersion().then((v) => setAppVersion(v)).catch(() => {})
  }, [])

  useEffect(() => {
    const unsub = window.hermesAPI.onUpdateStatus((data) => {
      switch (data.status) {
        case 'checking':
          setAppUpdateStatus('checking')
          break
        case 'available':
          setAppUpdateStatus('available')
          setAppUpdateVersion(data.version || '')
          break
        case 'not-available':
          setAppUpdateStatus('not-available')
          break
        case 'downloading':
          setAppUpdateStatus('downloading')
          setAppUpdatePercent(data.percent || 0)
          break
        case 'downloaded':
          setAppUpdateStatus('downloaded')
          break
        case 'error':
          setAppUpdateStatus('error')
          setAppUpdateError(translateError(data.error, t) || t('common.unknownError'))
          break
      }
    })
    return unsub
  }, [t])

  useEffect(() => {
    const unsub = window.hermesAPI.onInstallProgress((progress) => {
      setUpdateLog(progress.log)
    })
    return unsub
  }, [])

  useEffect(() => {
    loadSavedModels()
  }, [loadSavedModels])

  useEffect(() => {
    window.hermesAPI.getRuntimeConfig().then((c) => {
      const obj = c && typeof c === 'object' ? c as Record<string, unknown> : {}
      setRuntimeObj(obj)
      setRuntimeOriginal(JSON.parse(JSON.stringify(obj)))
    }).catch(() => {})
  }, [])

  const parsedVersion = (() => {
    if (!hermesVersion) return null
    const v = hermesVersion
    const version = v.match(/v([\d.]+)/)?.[1] || ''
    const date = v.match(/\(([\d.]+)\)/)?.[1] || ''
    const python = v.match(/Python:\s*([\d.]+)/)?.[1] || ''
    const sdk = v.match(/OpenAI SDK:\s*([\d.]+)/)?.[1] || ''
    const commit = v.match(/Commit:\s*([0-9a-f]{7,40})/i)?.[1] || ''
    const updateMatch = v.match(/Update available:\s*(.+?)$/m)
    const updateInfo = updateMatch?.[1]?.trim() || null
    const isUpToDate = /Up to date/.test(v)
    return { version, date, python, sdk, commit, updateInfo, isUpToDate }
  })()

  const refreshVersion = useCallback((): void => {
    setHermesVersionRefreshing(true)
    window.hermesAPI.refreshHermesVersion()
      .then((v) => {
        setHermesVersion(v)
      })
      .finally(() => setHermesVersionRefreshing(false))
  }, [])

  useEffect(() => {
    if (section === 'engine') {
      refreshVersion()
    }
  }, [section, refreshVersion])

  useEffect(() => {
    if (!isElectron && (section === 'engine' || section === 'data' || section === 'logs')) {
      setSection('basic')
    }
  }, [isElectron, section])

  const handleDoctor = async (): Promise<void> => {
    setDoctorRunning(true)
    setDoctorOutput(null)
    const output = await window.hermesAPI.runHermesDoctor()
    setDoctorOutput(output)
    setDoctorRunning(false)
  }

  const handleUpdateHermes = async (): Promise<void> => {
    setUpdating(true)
    setUpdateResult(null)
    setUpdateResultType(null)
    setUpdateLog(null)
    const result = await window.hermesAPI.runHermesUpdate()
    setUpdating(false)
    if (result.success) {
      setUpdateResult(t('settings.updateSuccess'))
      setUpdateResultType('success')
      refreshVersion()
    } else {
      setUpdateResult(translateError(result.error, t) || t('settings.updateFailed'))
      setUpdateResultType('error')
    }
  }

  const handleReinstall = async (): Promise<void> => {
    setReinstalling(true)
    setUpdateResult(null)
    setUpdateResultType(null)
    setUpdateLog(null)
    try {
      const result = await window.hermesAPI.startInstall()
      if (result.success) {
        setUpdateResult(t('settings.reinstallSuccess'))
        setUpdateResultType('success')
        refreshVersion()
      } else {
        setUpdateResult(translateError(result.error, t) || t('settings.installFailed'))
        setUpdateResultType('error')
      }
    } catch (e: unknown) {
      setUpdateResult(translateError((e as Error).message, t) || t('settings.installFailed'))
      setUpdateResultType('error')
    } finally {
      setReinstalling(false)
    }
  }

  const handleRestartEngines = async (): Promise<void> => {
    setRestartingEngines(true)
    try {
      const result = await window.hermesAPI.restartAllEngines()
      if (result.success) {
        if (result.restarted === 0) {
          showToast(t('settings.noOnlineEngine'))
        } else {
          showToast(t('settings.enginesRestarted', { restarted: result.restarted, total: result.total }))
        }
      } else {
        showToast(t('settings.restartEnginesFailed'), 'error')
      }
    } catch {
      showToast(t('settings.restartEnginesFailed'), 'error')
    } finally {
      setRestartingEngines(false)
    }
  }

  const handleModeChange = (newMode: ThemeMode): void => {
    document.documentElement.classList.add('theme-transitioning')
    setMode(newMode)
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500)
  }

  const handleAccentChange = (newAccent: AccentColor): void => {
    document.documentElement.classList.add('theme-transitioning')
    setAccent(newAccent)
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500)
  }

  const handleUiThemeChange = (newUiTheme: UiTheme): void => {
    document.documentElement.classList.add('theme-transitioning')
    setUiTheme(newUiTheme)
    setAccent(THEME_PRESETS[newUiTheme].defaultAccent)
    setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 500)
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setSaveResult('idle')
    try {
      const currentConfig = await window.hermesAPI.getAppConfig()
      const newConfig = { ...currentConfig }
      if (!newConfig.defaults) newConfig.defaults = {}
      if (!newConfig.hermes) newConfig.hermes = {}
      ;(newConfig.defaults as Record<string, unknown>).idle_timeout = idleTimeout
      ;(newConfig.defaults as Record<string, unknown>).max_online = maxOnline
      await window.hermesAPI.setAppConfig(newConfig)
      setSaveResult('success')
    } catch {
      setSaveResult('error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult('idle'), 2000)
    }
  }

  const handleToggleWebServer = async (enabled: boolean): Promise<void> => {
    setWebServerSaving(true)
    try {
      const status = await window.hermesAPI.setDesktopWebServerConfig({
        autoStart: enabled,
        port: webServerPort,
      })
      setWebServerStatus(status)
      setWebServerPort(status.port || webServerPort)
      if (status.error) {
        showToast(t('settings.webServerStartFailed', { error: translateError(status.error, t) }), 'error')
      } else {
        showToast(enabled ? t('settings.webServerEnabled') : t('settings.webServerDisabled'))
      }
    } catch {
      showToast(t('settings.webServerSetFailed'), 'error')
    } finally {
      setWebServerSaving(false)
    }
  }

  const handleSaveWebServerPort = async (): Promise<void> => {
    setWebServerSaving(true)
    try {
      const status = await window.hermesAPI.setDesktopWebServerConfig({
        autoStart: webServerStatus?.enabled === true,
        port: webServerPort,
      })
      setWebServerStatus(status)
      setWebServerPort(status.port || webServerPort)
      setRemoteServerToken(status.apiToken || remoteServerToken)
      showToast(status.error ? t('settings.webServerStartFailed', { error: translateError(status.error, t) }) : t('settings.webServerConfigSaved'))
    } catch {
      showToast(t('settings.webServerSetFailed'), 'error')
    } finally {
      setWebServerSaving(false)
    }
  }

  const handleToggleRemoteServer = async (enabled: boolean): Promise<void> => {
    setRemoteServerSaving(true)
    try {
      const status = await window.hermesAPI.setRemoteServerConfig({ enabled, port: webServerPort })
      setWebServerStatus(status)
      setRemoteServerEnabled(status.remoteEnabled === true)
      setRemoteServerToken(status.apiToken || '')
      showToast(enabled ? t('settings.remoteEnabled') : t('settings.remoteDisabled'))
    } catch {
      showToast(t('settings.remoteSetFailed'), 'error')
    } finally {
      setRemoteServerSaving(false)
    }
  }

  const handleRotateRemoteToken = async (): Promise<void> => {
    setRemoteServerSaving(true)
    try {
      const result = await window.hermesAPI.rotateRemoteServerToken()
      setRemoteServerToken(result.api_token)
      setWebServerStatus(result.status)
      showToast(t('settings.tokenRotated'))
    } catch {
      showToast(t('settings.tokenRotateFailed'), 'error')
    } finally {
      setRemoteServerSaving(false)
    }
  }

  const handleSaveRemoteConnection = async (): Promise<void> => {
    if (!remoteConnection.host.trim() || !remoteConnection.api_token.trim()) {
      showToast(t('settings.fillHostToken'), 'error')
      return
    }
    setRemoteSaving(true)
    try {
      const result = await window.hermesAPI.saveRemoteConnection(remoteConnection)
      if (result.success) {
        window.dispatchEvent(new Event('hermes:workspace-changed'))
        showToast(t('settings.remoteSaved'))
      } else {
        showToast(translateError(result.error, t) || t('settings.connectionFailed'), 'error')
      }
    } catch {
      showToast(t('common.saveFailed'), 'error')
    } finally {
      setRemoteSaving(false)
    }
  }

  const handleTestRemoteConnection = async (): Promise<void> => {
    setRemoteSaving(true)
    try {
      const result = await window.hermesAPI.testRemoteConnection(remoteConnection)
      if (result.success) {
        showToast(t('settings.connectionSuccess'))
      } else {
        showToast(translateError(result.error, t) || t('settings.connectionFailed'), 'error')
      }
    } catch {
      showToast(t('settings.testFailed'), 'error')
    } finally {
      setRemoteSaving(false)
    }
  }

  const handleSwitchToLocal = async (): Promise<void> => {
    try {
      await window.hermesAPI.switchToLocalMode()
      window.dispatchEvent(new Event('hermes:deployment-changed'))
      showToast(t('settings.switchedToLocal'))
    } catch {
      showToast(t('settings.switchFailed'), 'error')
    }
  }

  const updateRuntimeField = (key: string, value: unknown): void => {
    setRuntimeObj(prev => setNestedValue(prev, key, value))
  }

  const handleSaveRuntime = async (): Promise<void> => {
    setRuntimeSaving(true)
    try {
      await window.hermesAPI.setRuntimeConfig(runtimeObj)
      setRuntimeOriginal(JSON.parse(JSON.stringify(runtimeObj)))
      showToast(t('settings.runtimeSaved'))
    } catch {
      showToast(t('settings.runtimeSaveFailed'), 'error')
    } finally {
      setRuntimeSaving(false)
    }
  }

  const handleChangePassword = async (): Promise<void> => {
    if (!oldPassword || !newPassword || newPassword !== confirmNewPassword) return
    setChangingPassword(true)
    setChangePasswordResult(null)
    try {
      const result = await window.hermesAPI.authChangePassword(oldPassword, newPassword)
      if (result.success) {
        setChangePasswordResult({ success: true, message: t('settings.passwordChanged') })
        setOldPassword('')
        setNewPassword('')
        setConfirmNewPassword('')
      } else {
        setChangePasswordResult({ success: false, message: translateError(result.error, t) || t('settings.passwordChangeFailed') })
      }
    } catch {
      setChangePasswordResult({ success: false, message: t('settings.passwordChangeFailed') })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleBackup = async (): Promise<void> => {
    setBackingUp(true)
    setBackupResult(null)
    try {
      const result = await window.hermesAPI.runHermesBackup()
      setBackupResult({ success: result.success, message: result.success ? t('settings.backupSuccess') : (translateError(result.output, t) || t('settings.backupFailed')) })
    } catch {
      setBackupResult({ success: false, message: t('settings.backupFailed') })
    } finally {
      setBackingUp(false)
    }
  }

  const handleImport = async (filePath: string): Promise<void> => {
    setImporting(true)
    setBackupResult(null)
    try {
      const result = await window.hermesAPI.runHermesImport(filePath)
      setBackupResult({ success: result.success, message: result.success ? t('settings.importSuccess') : (translateError(result.output, t) || t('settings.importFailed')) })
    } catch {
      setBackupResult({ success: false, message: t('settings.importFailed') })
    } finally {
      setImporting(false)
      setImportConfirm(false)
    }
  }

  const handleImportFileSelect = (): void => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.zip,.tar.gz,.tgz'
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (file) {
        const filePath = (file as unknown as { path: string }).path
        if (filePath) {
          setImportConfirm(true)
          selectedImportPath.current = filePath
        }
      }
    }
    input.click()
  }

  const confirmImport = (): void => {
    if (selectedImportPath.current) {
      handleImport(selectedImportPath.current)
    }
  }

  const handleLogout = async (): Promise<void> => {
    await window.hermesAPI.authLogout()
    window.location.reload()
  }

  const openAddModel = (): void => {
    setEditingModelId(null)
    setModelFormName('')
    setModelFormProvider('')
    setModelFormCustomProvider('')
    setModelFormModel('')
    setModelFormBaseUrl('')
    setModelFormApiKey('')
    setModelFormError(null)
    setModelFormVisible(true)
  }

  const openEditModel = (m: SavedModel): void => {
    setEditingModelId(m.id)
    setModelFormName(m.name)
    const preset = PROVIDER_PRESETS.find(p => p.id === m.provider)
    if (preset) {
      setModelFormProvider(m.provider)
      setModelFormCustomProvider('')
    } else {
      setModelFormProvider('_custom')
      setModelFormCustomProvider(m.provider)
    }
    setModelFormModel(m.model)
    setModelFormBaseUrl(m.baseUrl || '')
    setModelFormApiKey((m as unknown as Record<string, unknown>).apiKey as string || '')
    setModelFormError(null)
    setModelFormVisible(true)
  }

  const closeModelForm = (): void => {
    setModelFormVisible(false)
    setEditingModelId(null)
    setModelFormError(null)
    setModelFormCustomProvider('')
  }

  const handleSaveModel = async (): Promise<void> => {
    const provider = modelFormProvider === '_custom' ? modelFormCustomProvider.trim() : modelFormProvider
    if (!provider && !modelFormModel.trim()) {
      setModelFormError(t('settings.selectProvider'))
      return
    }
    if (!provider) {
      setModelFormError(t('settings.selectProviderOnly'))
      return
    }
    if (!modelFormModel.trim()) {
      setModelFormError(t('settings.selectModel'))
      return
    }
    setModelFormSaving(true)
    setModelFormError(null)
    try {
      let savedId = editingModelId
      if (editingModelId) {
        const result = await window.hermesAPI.updateSavedModel(
          editingModelId,
          modelFormName.trim(),
          provider.trim(),
          modelFormModel.trim(),
          modelFormBaseUrl.trim(),
          modelFormApiKey.trim()
        )
        if (result.error) {
          setModelFormError(translateError(result.error, t))
          return
        }
      } else {
        const entry = await window.hermesAPI.addSavedModel(
          modelFormName.trim() || modelFormModel.trim(),
          provider.trim(),
          modelFormModel.trim(),
          modelFormBaseUrl.trim(),
          modelFormApiKey.trim()
        )
        savedId = entry?.id || null
      }
      if (savedId && modelFormApiKey.trim()) {
        await window.hermesAPI.applySavedModel(savedId, 'default')
      }
      closeModelForm()
      loadSavedModels()
    } catch (e) {
      setModelFormError(translateError((e as Error).message, t) || t('common.saveFailed'))
    } finally {
      setModelFormSaving(false)
    }
  }

  const handleDeleteModel = async (id: string): Promise<void> => {
    try {
      await window.hermesAPI.removeSavedModel(id)
      loadSavedModels()
    } catch { /* ignore */ }
  }

  const modeOptions = useMemo(
    () => [
      { value: 'dark' as ThemeMode, label: t('themeMode.dark.label'), icon: <Moon size={20} />, desc: t('themeMode.dark.desc') },
      { value: 'light' as ThemeMode, label: t('themeMode.light.label'), icon: <Sun size={20} />, desc: t('themeMode.light.desc') },
      { value: 'auto' as ThemeMode, label: t('themeMode.auto.label'), icon: <Monitor size={20} />, desc: t('themeMode.auto.desc') },
    ],
    [t],
  )

  const accentOptions = useMemo(
    () => ACCENT_VALUES.map((value) => ({
      value,
      label: t(`accent.${value}`),
      color: ACCENT_COLORS[value],
    })),
    [t],
  )

  const sectionItems = useMemo(
    (): { key: Section; label: string; icon: React.ReactNode }[] => [
      { key: 'basic', label: t('settings.sections.basic'), icon: <SettingsIcon size={16} /> },
      { key: 'appearance', label: t('settings.sections.appearance'), icon: <Palette size={16} /> },
      ...(deploymentMode === 'local'
        ? [
            { key: 'runtime' as Section, label: t('settings.sections.runtime'), icon: <Wrench size={16} /> },
            { key: 'models' as Section, label: t('settings.sections.models'), icon: <Box size={16} /> },
            ...(isElectron ? [{ key: 'engine' as Section, label: t('settings.sections.engine'), icon: <Terminal size={16} /> }] : []),
            ...(isElectron
              ? [
                  { key: 'data' as Section, label: t('settings.sections.data'), icon: <Download size={16} /> },
                  { key: 'logs' as Section, label: t('settings.sections.logs'), icon: <FileText size={16} /> },
                ]
              : []),
          ]
        : []),
    ],
    [t, deploymentMode, isElectron],
  )

  return (
    <div className="flex h-full flex-col">
      <div className="screen-header drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}>
        <h2 className="screen-header-title">{lexicon.nav.settings}</h2>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[180px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-glass-light)] p-3">
          <h2 className="mb-4 px-2 text-sm font-semibold text-[var(--text-primary)]">{lexicon.nav.settings}</h2>
          <nav className="space-y-1">
            {sectionItems.map(s => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  section === s.key
                    ? 'bg-[var(--accent-glow)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl p-6">
            {section === 'basic' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{t('settings.sections.basic')}</h3>
                <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <Globe size={14} /> {t('language.label')}
                    </label>
                    <select
                      value={locale}
                      onChange={(e) => void setLocale(e.target.value as 'zh-CN' | 'en')}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                    >
                      <option value="zh-CN">{t('language.zhCN')}</option>
                      <option value="en">{t('language.en')}</option>
                    </select>
                  </div>
                  {deploymentMode === 'local' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <Clock size={14} /> {t('settings.idleTimeoutSeconds')}
                      </label>
                      <input
                        type="number"
                        value={idleTimeout}
                        onChange={(e) => setIdleTimeout(parseInt(e.target.value, 10) || 60)}
                        min={10}
                        max={3600}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <Users size={14} /> {t('settings.maxOnline')}
                      </label>
                      <input
                        type="number"
                        value={maxOnline}
                        onChange={(e) => setMaxOnline(parseInt(e.target.value, 10) || 5)}
                        min={1}
                        max={20}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                    </div>
                  </div>
                  )}

                  {deploymentMode === 'client_only' && (
                  <div className="space-y-4">
                    <ConnectionStatus />
                    <div>
                      <h4 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                        <Globe size={15} /> {t('settings.remoteNodeConnection')}
                      </h4>
                      <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                        {t('settings.remoteNodeDesc')}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.nodeName')}</label>
                      <input
                        type="text"
                        value={remoteConnection.name}
                        onChange={(e) => setRemoteConnection((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.remoteHost')}</label>
                        <input
                          type="text"
                          value={remoteConnection.host}
                          onChange={(e) => setRemoteConnection((prev) => ({ ...prev, host: e.target.value }))}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                      </div>
                      <div className="w-28">
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.remotePort')}</label>
                        <input
                          type="number"
                          value={remoteConnection.port}
                          onChange={(e) => setRemoteConnection((prev) => ({ ...prev, port: Number(e.target.value) || 8787 }))}
                          min={1024}
                          max={65535}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.remoteToken')}</label>
                      <input
                        type="password"
                        value={remoteConnection.api_token}
                        onChange={(e) => setRemoteConnection((prev) => ({ ...prev, api_token: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleTestRemoteConnection}
                        disabled={remoteSaving}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                      >
                        {remoteSaving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        {t('settings.testConnection')}
                      </button>
                      <button
                        onClick={handleSaveRemoteConnection}
                        disabled={remoteSaving}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                      >
                        {remoteSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {t('settings.saveConnection')}
                      </button>
                    </div>
                    <div className="border-t border-[var(--border)] pt-4">
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('settings.switchDeploymentMode')}</h4>
                      <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                        {t('settings.switchDeploymentModeDesc')}
                      </p>
                      <Popconfirm
                        title={t('settings.switchToLocalConfirm')}
                        confirmText={t('settings.switchToLocalConfirmBtn')}
                        onConfirm={handleSwitchToLocal}
                      >
                        <button
                          type="button"
                          className="mt-3 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        >
                          <Monitor size={14} />
                          {t('settings.switchToLocal')}
                        </button>
                      </Popconfirm>
                    </div>
                  </div>
                  )}

                  <div className="border-t border-[var(--border)] pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">{t('settings.changePassword')}</h4>
                    <div className="space-y-3">
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder={t('settings.currentPassword')}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder={t('settings.newPassword')}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder={t('settings.confirmPassword')}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      {confirmNewPassword && newPassword !== confirmNewPassword && (
                        <p className="text-xs text-[var(--danger)]">{t('settings.passwordMismatch')}</p>
                      )}
                      {changePasswordResult && (
                        <p className={`text-xs ${changePasswordResult.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{changePasswordResult.message}</p>
                      )}
                      <button
                        onClick={handleChangePassword}
                        disabled={changingPassword || !oldPassword || !newPassword || newPassword !== confirmNewPassword || newPassword.length < 4}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {changingPassword ? <Loader2 size={14} className="animate-spin" /> : <LockIcon size={14} />}
                        {changingPassword ? t('settings.changingPassword') : t('settings.changePassword')}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex items-center gap-3 border-t border-[var(--border)] pt-6">
                  {deploymentMode === 'local' && (
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : saveResult === 'success' ? (
                      <Check size={16} />
                    ) : saveResult === 'error' ? (
                      <X size={16} />
                    ) : (
                      <Save size={16} />
                    )}
                    {saving ? t('common.saving') : saveResult === 'success' ? t('settings.saveSettingsSuccess') : saveResult === 'error' ? t('common.saveFailed') : t('settings.saveSettings')}
                  </button>
                  )}
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] px-5 py-2.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[rgba(239,68,68,0.15)]"
                  >
                    <LogOut size={16} /> {t('common.logoutTitle')}
                  </button>
                </div>
              </section>
            )}

            {section === 'appearance' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{t('settings.sections.appearance')}</h3>
                <div className="space-y-6">
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{lexicon.appearance.themePack}</h4>
                    <div className="grid grid-cols-2 gap-3">
                      {Object.values(THEME_PRESETS).map((preset) => {
                        const isActive = uiTheme === preset.id
                        return (
                          <button
                            key={preset.id}
                            onClick={() => handleUiThemeChange(preset.id)}
                            className={`group flex flex-col items-start gap-4 rounded-xl border-2 p-5 text-left transition-all cursor-pointer ${
                              isActive
                                ? 'border-[var(--accent)] bg-[var(--accent-glow)] shadow-[0_0_20px_var(--accent-glow)]'
                                : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--text-dim)]'
                            }`}
                          >
                            <div className="flex w-full items-center justify-between gap-3">
                              <div className={`flex h-11 w-11 items-center justify-center rounded-xl transition-colors ${
                                isActive ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                              }`}>
                                <Sparkles size={19} />
                              </div>
                              <div className="flex gap-1.5">
                                {preset.swatch.map((color) => (
                                  <span key={color} className="h-5 w-5 rounded-full border border-[var(--border)]" style={{ backgroundColor: color }} />
                                ))}
                              </div>
                            </div>
                            <div>
                              <div className={`text-sm font-semibold ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                {preset.id === 'classic' ? t('themePreset.classic.label') : preset.label}
                              </div>
                              <div className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                                {preset.id === 'classic' ? t('themePreset.classic.desc') : preset.desc}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-dim)]">{lexicon.appearance.themePackDesc}</p>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('appearance.mode')}</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {modeOptions.map((opt) => {
                        const isActive = mode === opt.value
                        return (
                          <button
                            key={opt.value}
                            onClick={() => handleModeChange(opt.value)}
                            className={`group flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all cursor-pointer ${
                              isActive
                                ? 'border-[var(--accent)] bg-[var(--accent-glow)] shadow-[0_0_20px_var(--accent-glow)]'
                                : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--text-dim)]'
                            }`}
                          >
                            <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                              isActive ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                            }`}>
                              {opt.icon}
                            </div>
                            <div className="text-center">
                              <div className={`text-sm font-medium ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                                {opt.label}
                              </div>
                              <div className="mt-0.5 text-[11px] text-[var(--text-dim)] leading-snug">
                                {opt.desc}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">{t('appearance.accentColor')}</h4>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-center gap-4 flex-wrap">
                        {accentOptions.map((opt) => {
                          const isActive = accent === opt.value
                          return (
                            <button
                              key={opt.value}
                              onClick={() => handleAccentChange(opt.value)}
                              className="group flex flex-col items-center gap-2 cursor-pointer"
                              title={opt.label}
                            >
                              <div className={`relative h-9 w-9 rounded-full transition-all ${
                                isActive ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-surface)]' : 'hover:scale-110'
                              }`} style={{
                                backgroundColor: opt.color,
                                ['--tw-ring-color' as string]: opt.color,
                              }}>
                                {isActive && (
                                  <svg className="absolute inset-0 h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12" />
                                  </svg>
                                )}
                              </div>
                              <span className={`text-[10px] transition-colors ${
                                isActive ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-dim)] group-hover:text-[var(--text-secondary)]'
                              }`}>
                                {opt.label}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === 'runtime' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{t('settings.sections.runtime')}</h3>
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex items-start gap-3">
                    <Wrench size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      {t('settings.runtimeIntro')}
                    </div>
                  </div>
                  {(() => {
                    const groups: { name: string; fields: ConfigFieldDef[] }[] = []
                    for (const f of globalConfigFields) {
                      const g = groups.find(g => g.name === f.group)
                      if (g) g.fields.push(f)
                      else groups.push({ name: f.group, fields: [f] })
                    }
                    return groups.map(group => (
                      <div key={group.name}>
                        <div className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-2 px-1">{group.name}</div>
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] overflow-hidden">
                          {group.fields.map((field, i) => {
                            const rawValue = getNestedValue(runtimeObj, field.key)
                            return (
                              <div key={field.key} className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium text-[var(--text-primary)]">{field.label}</div>
                                  <div className="text-xs text-[var(--text-dim)] mt-0.5">{field.desc}</div>
                                </div>
                                <div className="w-[200px] shrink-0 flex justify-end">
                                  {field.type === 'toggle' ? (
                                    <label className="tools-toggle" onClick={(e) => e.stopPropagation()}>
                                      <input type="checkbox" checked={!!rawValue} onChange={(e) => updateRuntimeField(field.key, e.target.checked)} className="sr-only peer" />
                                      <span className={`tools-toggle-track ${!!rawValue ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                                    </label>
                                  ) : field.type === 'select' ? (
                                    <select
                                      value={String(rawValue ?? '')}
                                      onChange={(e) => updateRuntimeField(field.key, e.target.value)}
                                      className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] cursor-pointer"
                                    >
                                      <option value="">{t('common.default')}</option>
                                      {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                                    </select>
                                  ) : (
                                    <input
                                      type={field.type === 'number' ? 'number' : 'text'}
                                      value={String(rawValue ?? '')}
                                      onChange={(e) => {
                                        const v = e.target.value
                                        updateRuntimeField(field.key, v === '' ? '' : (field.type === 'number' ? Number(v) : v))
                                      }}
                                      placeholder={field.placeholder}
                                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--accent)]"
                                    />
                                  )}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))
                  })()}
                  <div className="flex gap-2 justify-end">
                    <button onClick={() => setRuntimeObj(JSON.parse(JSON.stringify(runtimeOriginal)))} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] px-3.5 py-2 text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all">{t('common.reset')}</button>
                    <button onClick={handleSaveRuntime} disabled={runtimeSaving} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-40 transition-all">
                      {runtimeSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {runtimeSaving ? t('common.saving') : t('common.save')}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {section === 'models' && (
              <section className="animate-fade-in">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.sections.models')}</h3>
                  <button
                    onClick={openAddModel}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                  >
                    <Plus size={14} /> {t('settings.addModel')}
                  </button>
                </div>

                {modelFormVisible && (
                  <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                      {editingModelId ? t('settings.editModel') : t('settings.addModel')}
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.providerRequiredLabel')}</label>
                        <select
                          value={modelFormProvider}
                          onChange={(e) => {
                            const val = e.target.value
                            setModelFormProvider(val)
                            const preset = PROVIDER_PRESETS.find(p => p.id === val)
                            if (preset) {
                              setModelFormBaseUrl(preset.baseUrl)
                              if (!modelFormModel) {
                                setModelFormModel(preset.models[0]?.id || '')
                                if (!modelFormName) setModelFormName(preset.models[0]?.label || '')
                              }
                            }
                          }}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        >
                          <option value="">{t('settings.chooseProvider')}</option>
                          {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          <option value="_custom">{t('settings.customProviderOption')}</option>
                        </select>
                      </div>
                      {modelFormProvider === '_custom' && (
                        <div>
                          <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.customProviderName')}</label>
                          <input
                            type="text"
                            value={modelFormCustomProvider}
                            onChange={(e) => setModelFormCustomProvider(e.target.value)}
                            placeholder={t('settings.providerExample')}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                          />
                        </div>
                      )}
                      {modelFormProvider === '_custom' && (
                        <div>
                          <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.modelId')} *</label>
                          <input
                            type="text"
                            value={modelFormModel}
                            onChange={(e) => setModelFormModel(e.target.value)}
                            placeholder={t('settings.modelExample')}
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                          />
                        </div>
                      )}
                      {modelFormProvider && modelFormProvider !== '_custom' && (() => {
                        const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                        return preset ? (
                          <div>
                            <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.modelRequiredLabel')}</label>
                            <select
                              value={preset.models.some(m => m.id === modelFormModel) ? modelFormModel : '_custom'}
                              onChange={(e) => {
                                const modelId = e.target.value
                                if (modelId === '_custom') {
                                  setModelFormModel('')
                                  setModelFormName('')
                                } else {
                                  setModelFormModel(modelId)
                                  const m = preset.models.find(m => m.id === modelId)
                                  if (m) setModelFormName(m.label)
                                }
                              }}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                            >
                              <option value="">{t('settings.chooseModel')}</option>
                              {preset.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                              <option value="_custom">{t('settings.customModelIdOption')}</option>
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.modelId')} *</label>
                            <input
                              type="text"
                              value={modelFormModel}
                              onChange={(e) => setModelFormModel(e.target.value)}
                              placeholder={t('settings.modelExampleDeepseek')}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                            />
                          </div>
                        )
                      })()}
                      {(() => {
                        const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                        const isCustomModel = preset && !preset.models.some(m => m.id === modelFormModel)
                        return isCustomModel ? (
                          <div>
                            <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.customModelId')}</label>
                            <input
                              type="text"
                              value={modelFormModel}
                              onChange={(e) => setModelFormModel(e.target.value)}
                              placeholder={t('settings.customModelIdPlaceholder')}
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                            />
                          </div>
                        ) : null
                      })()}
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.displayName')}</label>
                        <input
                          type="text"
                          value={modelFormName}
                          onChange={(e) => setModelFormName(e.target.value)}
                          placeholder={t('settings.displayNamePlaceholder')}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">Base URL</label>
                        <input
                          type="text"
                          value={modelFormBaseUrl}
                          onChange={(e) => setModelFormBaseUrl(e.target.value)}
                          placeholder="https://api.example.com/v1"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                        {(() => {
                          const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                          if (preset && modelFormBaseUrl === preset.baseUrl) {
                            return <p className="mt-1 text-xs text-[var(--text-dim)]">{t('settings.apiUrlAutoFilled', { provider: preset.label })}</p>
                          }
                          return null
                        })()}
                      </div>
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">{t('settings.apiKeyLabel')}</label>
                        <input
                          type="password"
                          value={modelFormApiKey}
                          onChange={(e) => setModelFormApiKey(e.target.value)}
                          placeholder={(() => {
                            const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                            return preset ? t('settings.apiKeyInputPlaceholder', { label: preset.apiKeyLabel }) : 'sk-...'
                          })()}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                        {(() => {
                          const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                          if (preset) {
                            return <p className="mt-1 text-xs text-[var(--text-dim)]">{t('settings.apiKeyEnvHint', { env: preset.apiKeyEnv })}</p>
                          }
                          return null
                        })()}
                      </div>
                      {modelFormError && (
                        <div className="rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] px-3 py-2 text-sm text-[var(--danger)]">
                          {modelFormError}
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <button
                          onClick={handleSaveModel}
                          disabled={modelFormSaving}
                          className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                        >
                          {modelFormSaving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                          {modelFormSaving ? t('common.saving') : t('common.save')}
                        </button>
                        <button
                          onClick={closeModelForm}
                          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {savedModels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
                    <Box size={32} className="mx-auto mb-3 text-[var(--text-dim)]" />
                    <p className="text-sm text-[var(--text-dim)]">{t('settings.noModels')}</p>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">{t('settings.noModelsHint')}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedModels.map(m => (
                      <div
                        key={m.id}
                        className="group rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 transition-colors hover:border-[var(--border-focus)]"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-[var(--text-primary)] truncate">
                                {m.name || m.model}
                              </span>
                              <span className="shrink-0 rounded-md bg-[var(--accent-glow)] px-2 py-0.5 text-xs text-[var(--accent)]">
                                {PROVIDER_PRESETS.find(p => p.id === m.provider)?.label || m.provider}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-[var(--text-dim)] font-mono truncate">{m.model}</p>
                            {m.baseUrl && (
                              <p className="mt-0.5 text-xs text-[var(--text-dim)] truncate">{m.baseUrl}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => openEditModel(m)}
                              className="rounded-lg p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                              title={t('common.edit')}
                            >
                              <Pencil size={14} />
                            </button>
                            <Popconfirm title={t('settings.deleteModelConfirm')} onConfirm={() => handleDeleteModel(m.id)}>
                              <button
                                className="rounded-lg p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)]"
                                title={t('common.delete')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </Popconfirm>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {section === 'engine' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{t('settings.engineAndUpdate')}</h3>

                <div className="space-y-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Globe size={16} className="text-[var(--accent)]" />
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('settings.serverNetwork')}</h4>
                    </div>

                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h5 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                          {t('settings.builtinWebServer')}
                        </h5>
                        <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                          {t('settings.builtinWebServerDesc')}
                        </p>
                        {webServerStatus?.running && (
                          <p className="mt-2 truncate text-xs text-[var(--accent)]">{webServerStatus.url}</p>
                        )}
                        {webServerStatus?.error && (
                          <p className="mt-2 text-xs text-[var(--danger)]">{translateError(webServerStatus.error, t)}</p>
                        )}
                      </div>
                      <label className="tools-toggle shrink-0">
                        <input
                          type="checkbox"
                          checked={webServerStatus?.enabled === true}
                          disabled={webServerSaving}
                          onChange={(e) => handleToggleWebServer(e.target.checked)}
                          className="sr-only peer"
                        />
                        <span className={`tools-toggle-track ${webServerStatus?.enabled ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                      </label>
                    </div>
                    <div className="mt-4 flex items-center gap-2">
                      <input
                        type="number"
                        value={webServerPort}
                        min={1024}
                        max={65535}
                        disabled={webServerSaving}
                        onChange={(e) => setWebServerPort(Number(e.target.value) || 8787)}
                        className="w-28 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      <button
                        onClick={handleSaveWebServerPort}
                        disabled={webServerSaving}
                        className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                      >
                        {webServerSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {t('settings.saveWebConfig')}
                      </button>
                      <span className="text-xs text-[var(--text-dim)]">
                        {t('settings.webServerStatus', { status: webServerStatus?.running ? t('settings.webServerRunning') : t('settings.webServerStopped') })}
                      </span>
                    </div>

                    <div className="border-t border-[var(--border)] pt-4 mt-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <h5 className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                            {t('settings.allowRemoteConnection')}
                          </h5>
                          <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                            {t('settings.allowRemoteConnectionDesc')}
                          </p>
                        </div>
                        <label className="tools-toggle shrink-0">
                          <input
                            type="checkbox"
                            checked={remoteServerEnabled}
                            disabled={remoteServerSaving}
                            onChange={(e) => handleToggleRemoteServer(e.target.checked)}
                            className="sr-only peer"
                          />
                          <span className={`tools-toggle-track ${remoteServerEnabled ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                        </label>
                      </div>
                      {remoteServerEnabled && remoteServerToken && (
                        <div className="mt-4 space-y-2">
                          <label className="text-xs text-[var(--text-dim)]">{t('settings.apiTokenForRemote')}</label>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={remoteServerToken}
                              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-mono text-[var(--text-primary)] outline-none"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(remoteServerToken)
                                showToast(t('settings.tokenCopied'))
                              }}
                              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                            >
                              <Copy size={12} /> {t('common.copy')}
                            </button>
                            <button
                              onClick={handleRotateRemoteToken}
                              disabled={remoteServerSaving}
                              className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                            >
                              {remoteServerSaving ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                              {t('settings.rotate')}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowUpCircle size={16} className="text-[var(--accent)]" />
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('settings.desktopApp')}</h4>
                      <span className="text-xs text-[var(--text-dim)] bg-[var(--bg-primary)] px-2 py-0.5 rounded">{t('settings.appItself')}</span>
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mb-3">{t('settings.desktopAppDesc')}</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">{t('settings.currentVersion')}</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">v{appVersion || '—'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {appUpdateStatus === 'idle' && (
                          <button
                            onClick={() => { setAppUpdateStatus('checking'); window.hermesAPI.checkAppUpdate() }}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          >
                            <ArrowUpCircle size={14} /> {t('settings.checkUpdate')}
                          </button>
                        )}
                        {appUpdateStatus === 'checking' && (
                          <span className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                            <Loader2 size={14} className="animate-spin" /> {t('settings.checkingUpdate')}
                          </span>
                        )}
                        {appUpdateStatus === 'available' && (
                          <>
                            <span className="text-sm text-[var(--accent)]">{t('settings.newVersionFound', { version: appUpdateVersion })}</span>
                            <button
                              onClick={() => { setAppUpdateStatus('downloading'); setAppUpdatePercent(0); window.hermesAPI.downloadAppUpdate() }}
                              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                            >
                              <Download size={14} /> {t('settings.downloadUpdate')}
                            </button>
                          </>
                        )}
                        {appUpdateStatus === 'downloading' && (
                          <div className="flex items-center gap-3 w-full max-w-[200px]">
                            <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-primary)] overflow-hidden">
                              <div className="h-full rounded-full bg-accent-gradient transition-all" style={{ width: `${appUpdatePercent}%` }} />
                            </div>
                            <span className="text-xs text-[var(--text-dim)]">{appUpdatePercent}%</span>
                          </div>
                        )}
                        {appUpdateStatus === 'downloaded' && (
                          <button
                            onClick={() => window.hermesAPI.installAppUpdate()}
                            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                          >
                            <RefreshCw size={14} /> {t('settings.restartInstall')}
                          </button>
                        )}
                        {appUpdateStatus === 'not-available' && (
                          <span className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                            <Check size={14} /> {t('settings.upToDate')}
                          </span>
                        )}
                        {appUpdateStatus === 'error' && (
                          <span className="text-sm text-[var(--danger)]">{appUpdateError}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <Terminal size={16} className="text-[var(--accent)]" />
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">{t('settings.hermesAgentEngine')}</h4>
                      <span className="text-xs text-[var(--text-dim)] bg-[var(--bg-primary)] px-2 py-0.5 rounded">{t('settings.aiBackend')}</span>
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mb-3">{t('settings.engineDesc')}</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">{t('settings.hermesVersion')}</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">
                          {hermesVersion === null || hermesVersionRefreshing ? t('settings.detecting') : parsedVersion ? `v${parsedVersion.version}` : t('settings.notDetected')}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">{t('settings.releaseDate')}</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">
                          {parsedVersion?.date || '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">Python</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">
                          {parsedVersion?.python || '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">OpenAI SDK</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">
                          {parsedVersion?.sdk || '—'}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">{t('settings.engineCommit')}</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5 font-mono">
                          {parsedVersion?.commit || '—'}
                        </div>
                      </div>
                    </div>
                    {parsedVersion?.updateInfo && (
                      <div className="mt-3 rounded-lg bg-[rgba(124,106,239,0.1)] border border-[rgba(124,106,239,0.2)] px-3 py-2 text-sm text-[var(--accent)]">
                        {t('settings.newVersionAvailable', { info: parsedVersion.updateInfo })}
                      </div>
                    )}

                    <div className="mt-4 border-t border-[var(--border)] pt-4">
                      <div className="flex flex-wrap gap-3">
                        {parsedVersion?.updateInfo ? (
                          <button
                            onClick={handleUpdateHermes}
                            disabled={updating}
                            className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                          >
                            {updating ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            {updating ? t('settings.updating') : t('settings.updateEngine')}
                          </button>
                        ) : parsedVersion?.isUpToDate ? (
                          <button className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-dim)] cursor-not-allowed" disabled>
                            <Check size={14} /> {t('settings.upToDate')}
                          </button>
                        ) : (
                          <button
                            onClick={handleUpdateHermes}
                            disabled={updating}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                          >
                            {updating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            {updating ? t('settings.updating') : t('settings.updateEngine')}
                          </button>
                        )}
                        <button
                          onClick={handleDoctor}
                          disabled={doctorRunning}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          {doctorRunning ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                          {doctorRunning ? t('settings.runningDoctor') : t('settings.runDoctor')}
                        </button>
                        <Popconfirm title={t('settings.restartEngineConfirm')} confirmText={t('settings.restartEngineConfirmBtn')} onConfirm={handleRestartEngines}>
                          <button
                            disabled={restartingEngines}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                          >
                            {restartingEngines ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            {restartingEngines ? t('settings.restarting') : t('settings.restartEngine')}
                          </button>
                        </Popconfirm>
                        <Popconfirm title={t('settings.reinstallConfirm')} confirmText={t('settings.reinstallConfirmBtn')} onConfirm={handleReinstall}>
                          <button
                            disabled={reinstalling}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.3)] px-4 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(239,68,68,0.2)] disabled:opacity-50"
                          >
                            {reinstalling ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                            {reinstalling ? t('settings.reinstalling') : t('settings.reinstallEngine')}
                          </button>
                        </Popconfirm>
                      </div>

                      {updateResult && (
                        <div className={`mt-4 rounded-lg border p-3 text-sm ${
                          updateResultType === 'success'
                            ? 'border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)] text-[var(--success)]'
                            : 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] text-[var(--danger)]'
                        }`}>
                          {updateResult}
                        </div>
                      )}

                      {updateLog && updating && (
                        <pre className="mt-4 max-h-[200px] overflow-y-auto rounded-lg bg-[rgba(0,0,0,0.25)] p-3 font-mono text-xs whitespace-pre-wrap text-[var(--text-secondary)] border border-[var(--border)]">
                          {updateLog}
                        </pre>
                      )}

                      {doctorOutput && (
                        <pre className="mt-4 max-h-[300px] overflow-y-auto rounded-lg bg-[rgba(0,0,0,0.25)] p-3 font-mono text-xs whitespace-pre-wrap text-[var(--text-secondary)] border border-[var(--border)]">
                          {doctorOutput}
                        </pre>
                      )}
                    </div>
                  </div>
                </div>
              </section>
            )}

            {section === 'data' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{t('settings.sections.data')}</h3>

                <div className="space-y-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('settings.exportBackup')}</h4>
                    <p className="text-xs text-[var(--text-dim)] mb-4">{t('settings.exportBackupDesc')}</p>
                    <button
                      onClick={handleBackup}
                      disabled={backingUp}
                      className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {backingUp ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {backingUp ? t('settings.backingUp') : t('settings.exportBackup')}
                    </button>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">{t('settings.importBackup')}</h4>
                    <p className="text-xs text-[var(--text-dim)] mb-4">{t('settings.importBackupDesc')}</p>
                    {importConfirm ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)]">
                        <AlertTriangle size={16} className="text-[var(--warning)] shrink-0" />
                        <span className="text-sm text-[var(--warning)]">{t('settings.importOverwriteWarning')}</span>
                        <button onClick={confirmImport} disabled={importing} className="rounded-lg bg-[var(--warning)] px-3 py-1.5 text-sm text-white cursor-pointer hover:opacity-90 disabled:opacity-50">
                          {importing ? t('settings.importing') : t('settings.confirmImportBtn')}
                        </button>
                        <button onClick={() => setImportConfirm(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-hover)]">
                          {t('common.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleImportFileSelect}
                        disabled={importing}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                      >
                        {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {importing ? t('settings.importing') : t('settings.selectBackupFile')}
                      </button>
                    )}
                  </div>

                  {backupResult && (
                    <div className={`rounded-xl border p-4 ${backupResult.success ? 'border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.1)]' : 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)]'}`}>
                      <p className={`text-sm ${backupResult.success ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{backupResult.message}</p>
                    </div>
                  )}
                </div>
              </section>
            )}

            {section === 'logs' && (
              <LogsSection />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

const LOG_FILES = [
  { key: 'agent.log', labelKey: 'settings.logsAgent' as const, icon: Terminal, color: 'var(--accent)' },
  { key: 'gateway.log', labelKey: 'settings.logsGateway' as const, icon: FileText, color: 'var(--info, #3b82f6)' },
  { key: 'errors.log', labelKey: 'settings.logsErrors' as const, icon: AlertCircle, color: 'var(--danger, #ef4444)' },
]

function LogsSection(): React.ReactElement {
  const { t } = useTranslation()
  const [activeLog, setActiveLog] = useState('agent.log')
  const [logContent, setLogContent] = useState('')
  const [logPath, setLogPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadLogs = useCallback(async (logFile?: string) => {
    setLoading(true)
    try {
      const file = logFile || activeLog
      const result = await window.hermesAPI?.readLogs(file, 500)
      if (result) {
        setLogContent(result.content)
        setLogPath(result.path)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [activeLog])

  useEffect(() => {
    loadLogs()
  }, [loadLogs])

  useEffect(() => {
    if (autoRefresh) {
      autoRefreshRef.current = setInterval(() => loadLogs(), 3000)
    } else if (autoRefreshRef.current) {
      clearInterval(autoRefreshRef.current)
      autoRefreshRef.current = null
    }
    return () => {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current)
    }
  }, [autoRefresh, loadLogs])

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(logContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  const handleClear = async (): Promise<void> => {
    try {
      const result = await window.hermesAPI?.clearLogs(activeLog)
      if (result?.success) {
        setLogContent('')
        showToast(t('settings.logCleared'))
        loadLogs(activeLog)
      } else {
        showToast(t('settings.logClearFailed'), 'error')
      }
    } catch { showToast(t('settings.logClearFailed'), 'error') }
  }

  const parseLogLine = (line: string) => {
    const match = line.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2},\d{3})\s+(INFO|WARNING|ERROR|DEBUG|CRITICAL)\s+(\S+?):\s*(.*)$/)
    if (match) {
      const levelMap: Record<string, string> = { INFO: 'info', WARNING: 'warn', ERROR: 'error', DEBUG: 'debug', CRITICAL: 'error' }
      return { timestamp: match[1].replace(',', '.'), level: levelMap[match[2]] || match[2].toLowerCase(), message: `${match[3]}: ${match[4]}` }
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

  const lines = logContent.split('\n').filter(l => l.trim())
  const lineCount = lines.length

  return (
    <section className="animate-fade-in">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">{t('settings.sections.logs')}</h3>
          <p className="text-xs text-[var(--text-dim)] mt-1 font-mono truncate max-w-md">{logPath || t('common.loading')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-all ${
              autoRefresh
                ? 'bg-accent-gradient text-white shadow-sm'
                : 'bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            {t('settings.logsAutoRefresh')}
          </button>
          <button onClick={handleCopy} disabled={!logContent} className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-30" title={t('common.copy')}>
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
          <Popconfirm title={t('settings.clearLogConfirm')} confirmText={t('settings.clearLogConfirmBtn')} onConfirm={handleClear}>
            <button disabled={!logContent} className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)] transition-all disabled:opacity-30" title={t('settings.clearLogConfirmBtn')}>
              <Trash2 size={14} />
            </button>
          </Popconfirm>
          <button onClick={() => loadLogs()} disabled={loading} className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-50" title={t('common.refresh')}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        {LOG_FILES.map(log => {
          const Icon = log.icon
          const isActive = activeLog === log.key
          return (
            <button
              key={log.key}
              onClick={() => { setActiveLog(log.key); loadLogs(log.key) }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all text-xs font-medium ${
                isActive
                  ? 'bg-accent-gradient text-white shadow-sm'
                  : 'bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
              }`}
            >
              <Icon size={12} />
              <span>{t(log.labelKey)}</span>
            </button>
          )
        })}
        <span className="ml-auto text-[11px] text-[var(--text-dim)]">{t('settings.lineCount', { count: lineCount })}</span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[rgba(0,0,0,0.2)] overflow-hidden">
        <div className="h-[500px] overflow-auto px-4 py-3 font-mono text-xs leading-5">
          {loading && !logContent ? (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)]">
              <RefreshCw size={18} className="animate-spin mr-2" /> {t('common.loading')}
            </div>
          ) : lineCount === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)]">{t('settings.noLogs')}</div>
          ) : (
            lines.map((line, i) => {
              const parsed = parseLogLine(line)
              return (
                <div key={i} className="flex gap-3 hover:bg-[rgba(255,255,255,0.03)]">
                  {parsed.timestamp && <span className="text-[var(--text-dim)] shrink-0 select-none">{parsed.timestamp.split(' ')[1]?.split(',')[0] || ''}</span>}
                  {parsed.level && (
                    <span className={`shrink-0 w-12 text-right font-semibold ${getLevelColor(parsed.level)}`}>
                      {parsed.level.toUpperCase().padEnd(5)}
                    </span>
                  )}
                  <span className={`${getLevelColor(parsed.level)} break-all`}>{parsed.message}</span>
                </div>
              )
            })
          )}
        </div>
      </div>
    </section>
  )
}
