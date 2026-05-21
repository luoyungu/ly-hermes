import { useState, useEffect, useRef, useCallback } from 'react'
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
  Palette
} from 'lucide-react'
import { PROVIDER_PRESETS, GLOBAL_CONFIG_FIELDS, getNestedValue, setNestedValue, type ConfigFieldDef } from '../../shared/employee-shared'
import Popconfirm from '../../components/Popconfirm'
import { useTheme } from '../../components/ThemeProvider'
import { showToast } from '../../App'
import { THEME_PRESETS } from '../../theme/presets'
import type { ThemeMode, AccentColor, UiTheme } from '../../../../preload/index'

type Section = 'basic' | 'appearance' | 'runtime' | 'models' | 'engine' | 'data' | 'logs'

const MODE_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode; desc: string }> = [
  { value: 'dark', label: '暗夜', icon: <Moon size={20} />, desc: '始终使用深色外观' },
  { value: 'light', label: '明亮', icon: <Sun size={20} />, desc: '始终使用浅色外观' },
  { value: 'auto', label: '跟随系统', icon: <Monitor size={20} />, desc: '自动匹配系统外观设置' },
]

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: 'violet', label: '紫罗兰', color: '#7c6aef' },
  { value: 'indigo', label: '靛蓝', color: '#7878c0' },
  { value: 'blue', label: '海蓝', color: '#4a9ed6' },
  { value: 'green', label: '翠绿', color: '#4a9e5c' },
  { value: 'orange', label: '暖橙', color: '#d08040' },
  { value: 'lavender', label: '薰衣草', color: '#9080c8' },
  { value: 'rose', label: '玫瑰', color: '#c87090' },
  { value: 'slate', label: '石板灰', color: '#7a8a9e' },
]

export default function SettingsScreen(): React.ReactElement {
  const { isMac } = usePlatform()
  const { lexicon, mode, accent, uiTheme, setMode, setAccent, setUiTheme } = useTheme()
  const [section, setSection] = useState<Section>('basic')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle')

  const [idleTimeout, setIdleTimeout] = useState(60)
  const [maxOnline, setMaxOnline] = useState(5)

  const [hermesVersion, setHermesVersion] = useState<string | null>(null)
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
          setAppUpdateError(data.error || '未知错误')
          break
      }
    })
    return unsub
  }, [])

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
    const updateMatch = v.match(/Update available:\s*(.+?)$/m)
    const updateInfo = updateMatch?.[1]?.trim() || null
    const isUpToDate = /Up to date/.test(v)
    return { version, date, python, sdk, updateInfo, isUpToDate }
  })()

  const refreshVersion = (): void => {
    window.hermesAPI.refreshHermesVersion().then((v) => {
      setHermesVersion(v)
    })
  }

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
      setUpdateResult('更新成功！')
      setUpdateResultType('success')
      refreshVersion()
    } else {
      setUpdateResult(result.error || '更新失败')
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
        setUpdateResult('重新安装成功！')
        setUpdateResultType('success')
        refreshVersion()
      } else {
        setUpdateResult(result.error || '安装失败')
        setUpdateResultType('error')
      }
    } catch (e: unknown) {
      setUpdateResult((e as Error).message || '安装失败')
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
          showToast('当前没有在线引擎')
        } else {
          showToast(`已重启 ${result.restarted}/${result.total} 个引擎`)
        }
      } else {
        showToast('重启引擎失败', 'error')
      }
    } catch {
      showToast('重启引擎失败', 'error')
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

  const updateRuntimeField = (key: string, value: unknown): void => {
    setRuntimeObj(prev => setNestedValue(prev, key, value))
  }

  const handleSaveRuntime = async (): Promise<void> => {
    setRuntimeSaving(true)
    try {
      await window.hermesAPI.setRuntimeConfig(runtimeObj)
      setRuntimeOriginal(JSON.parse(JSON.stringify(runtimeObj)))
      showToast('运行参数已保存')
    } catch {
      showToast('保存运行参数失败', 'error')
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
        setChangePasswordResult({ success: true, message: '密码修改成功' })
        setOldPassword('')
        setNewPassword('')
        setConfirmNewPassword('')
      } else {
        setChangePasswordResult({ success: false, message: result.error || '密码修改失败' })
      }
    } catch {
      setChangePasswordResult({ success: false, message: '密码修改失败' })
    } finally {
      setChangingPassword(false)
    }
  }

  const handleBackup = async (): Promise<void> => {
    setBackingUp(true)
    setBackupResult(null)
    try {
      const result = await window.hermesAPI.runHermesBackup()
      setBackupResult({ success: result.success, message: result.success ? '备份成功！文件已保存到 ~/.hermes/backups/' : (result.output || '备份失败') })
    } catch {
      setBackupResult({ success: false, message: '备份失败' })
    } finally {
      setBackingUp(false)
    }
  }

  const handleImport = async (filePath: string): Promise<void> => {
    setImporting(true)
    setBackupResult(null)
    try {
      const result = await window.hermesAPI.runHermesImport(filePath)
      setBackupResult({ success: result.success, message: result.success ? '导入成功！部分配置可能需要重启应用生效。' : (result.output || '导入失败') })
    } catch {
      setBackupResult({ success: false, message: '导入失败' })
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
      setModelFormError('请选择服务商并选择或输入模型')
      return
    }
    if (!provider) {
      setModelFormError('请选择服务商')
      return
    }
    if (!modelFormModel.trim()) {
      setModelFormError('请选择或输入模型')
      return
    }
    setModelFormSaving(true)
    setModelFormError(null)
    try {
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
          setModelFormError(result.error)
          return
        }
      } else {
        await window.hermesAPI.addSavedModel(
          modelFormName.trim() || modelFormModel.trim(),
          provider.trim(),
          modelFormModel.trim(),
          modelFormBaseUrl.trim(),
          modelFormApiKey.trim()
        )
      }
      closeModelForm()
      loadSavedModels()
    } catch (e) {
      setModelFormError((e as Error).message || '保存失败')
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

  const sectionItems: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'basic', label: '基础设置', icon: <SettingsIcon size={16} /> },
    { key: 'appearance', label: '外观', icon: <Palette size={16} /> },
    { key: 'runtime', label: '运行参数', icon: <Wrench size={16} /> },
    { key: 'models', label: '模型管理', icon: <Box size={16} /> },
    { key: 'engine', label: '引擎管理', icon: <Terminal size={16} /> },
    { key: 'data', label: '数据管理', icon: <Download size={16} /> },
    { key: 'logs', label: '系统日志', icon: <FileText size={16} /> }
  ]

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
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">基础设置</h3>
                <div className="space-y-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                        <Clock size={14} /> 空闲超时（秒）
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
                        <Users size={14} /> 最大在线数
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

                  <div className="border-t border-[var(--border)] pt-4 mt-4">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-3">修改密码</h4>
                    <div className="space-y-3">
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="当前密码"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      <input
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="新密码（至少 4 个字符）"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      <input
                        type="password"
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="确认新密码"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                      />
                      {confirmNewPassword && newPassword !== confirmNewPassword && (
                        <p className="text-xs text-[var(--danger)]">两次密码不一致</p>
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
                        {changingPassword ? '修改中...' : '修改密码'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-8 flex items-center gap-3 border-t border-[var(--border)] pt-6">
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
                    {saving ? '保存中...' : saveResult === 'success' ? '✓ 已保存' : saveResult === 'error' ? '保存失败' : '保存设置'}
                  </button>
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-2 rounded-lg border border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.1)] px-5 py-2.5 text-sm font-medium text-[var(--danger)] transition-colors hover:bg-[rgba(239,68,68,0.15)]"
                  >
                    <LogOut size={16} /> 退出登录
                  </button>
                </div>
              </section>
            )}

            {section === 'appearance' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">外观</h3>
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
                                {preset.label}
                              </div>
                              <div className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                                {preset.desc}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-2 text-xs text-[var(--text-dim)]">{lexicon.appearance.themePackDesc}</p>
                  </div>

                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">模式</h4>
                    <div className="grid grid-cols-3 gap-3">
                      {MODE_OPTIONS.map((opt) => {
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
                    <h4 className="mb-3 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">主题色</h4>
                    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                      <div className="flex items-center gap-4 flex-wrap">
                        {ACCENT_OPTIONS.map((opt) => {
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
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">运行参数</h3>
                <div className="space-y-4">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex items-start gap-3">
                    <Wrench size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
                    <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                      这些参数对所有员工<strong className="text-[var(--text-primary)]">全局生效</strong>，包括记忆、压缩、终端、代码执行、浏览器和会话重置策略。
                    </div>
                  </div>
                  {(() => {
                    const groups: { name: string; fields: ConfigFieldDef[] }[] = []
                    for (const f of GLOBAL_CONFIG_FIELDS) {
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
                                      <option value="">默认</option>
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
                    <button onClick={() => setRuntimeObj(JSON.parse(JSON.stringify(runtimeOriginal)))} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-primary)] px-3.5 py-2 text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all">重置</button>
                    <button onClick={handleSaveRuntime} disabled={runtimeSaving} className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white cursor-pointer hover:opacity-90 disabled:opacity-40 transition-all">
                      {runtimeSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {runtimeSaving ? '保存中...' : '保存'}
                    </button>
                  </div>
                </div>
              </section>
            )}

            {section === 'models' && (
              <section className="animate-fade-in">
                <div className="mb-5 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-[var(--text-primary)]">模型管理</h3>
                  <button
                    onClick={openAddModel}
                    className="flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                  >
                    <Plus size={14} /> 添加模型
                  </button>
                </div>

                {modelFormVisible && (
                  <div className="mb-5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
                      {editingModelId ? '编辑模型' : '添加模型'}
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">服务商 *</label>
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
                          <option value="">选择服务商</option>
                          {PROVIDER_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                          <option value="_custom">自定义...</option>
                        </select>
                      </div>
                      {modelFormProvider === '_custom' && (
                        <div>
                          <label className="mb-1.5 text-sm text-[var(--text-secondary)]">自定义服务商名称 *</label>
                          <input
                            type="text"
                            value={modelFormCustomProvider}
                            onChange={(e) => setModelFormCustomProvider(e.target.value)}
                            placeholder="例如: openai、anthropic"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                          />
                        </div>
                      )}
                      {modelFormProvider === '_custom' && (
                        <div>
                          <label className="mb-1.5 text-sm text-[var(--text-secondary)]">模型 ID *</label>
                          <input
                            type="text"
                            value={modelFormModel}
                            onChange={(e) => setModelFormModel(e.target.value)}
                            placeholder="例如: gpt-4o、claude-sonnet-4-20250514"
                            className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                          />
                        </div>
                      )}
                      {modelFormProvider && modelFormProvider !== '_custom' && (() => {
                        const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                        return preset ? (
                          <div>
                            <label className="mb-1.5 text-sm text-[var(--text-secondary)]">模型 *</label>
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
                              <option value="">选择模型</option>
                              {preset.models.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                              <option value="_custom">自定义模型 ID...</option>
                            </select>
                          </div>
                        ) : (
                          <div>
                            <label className="mb-1.5 text-sm text-[var(--text-secondary)]">模型 ID *</label>
                            <input
                              type="text"
                              value={modelFormModel}
                              onChange={(e) => setModelFormModel(e.target.value)}
                              placeholder="例如: deepseek-chat"
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
                            <label className="mb-1.5 text-sm text-[var(--text-secondary)]">自定义模型 ID</label>
                            <input
                              type="text"
                              value={modelFormModel}
                              onChange={(e) => setModelFormModel(e.target.value)}
                              placeholder="输入模型 ID"
                              className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                            />
                          </div>
                        ) : null
                      })()}
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">显示名称</label>
                        <input
                          type="text"
                          value={modelFormName}
                          onChange={(e) => setModelFormName(e.target.value)}
                          placeholder="留空则使用模型名称"
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
                            return <p className="mt-1 text-xs text-[var(--text-dim)]">已自动填充 {preset.label} 的 API 地址</p>
                          }
                          return null
                        })()}
                      </div>
                      <div>
                        <label className="mb-1.5 text-sm text-[var(--text-secondary)]">API 密钥</label>
                        <input
                          type="password"
                          value={modelFormApiKey}
                          onChange={(e) => setModelFormApiKey(e.target.value)}
                          placeholder={(() => {
                            const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                            return preset ? `输入 ${preset.apiKeyLabel}` : 'sk-...'
                          })()}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                        />
                        {(() => {
                          const preset = PROVIDER_PRESETS.find(p => p.id === modelFormProvider)
                          if (preset) {
                            return <p className="mt-1 text-xs text-[var(--text-dim)]">将写入员工 .env 文件中的 {preset.apiKeyEnv}</p>
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
                          {modelFormSaving ? '保存中...' : '保存'}
                        </button>
                        <button
                          onClick={closeModelForm}
                          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {savedModels.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--border)] bg-[var(--bg-surface)] p-8 text-center">
                    <Box size={32} className="mx-auto mb-3 text-[var(--text-dim)]" />
                    <p className="text-sm text-[var(--text-dim)]">暂无模型配置</p>
                    <p className="mt-1 text-xs text-[var(--text-dim)]">点击「添加模型」来添加可用的 AI 模型</p>
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
                              title="编辑"
                            >
                              <Pencil size={14} />
                            </button>
                            <Popconfirm title="确认删除此模型配置？" onConfirm={() => handleDeleteModel(m.id)}>
                              <button
                                className="rounded-lg p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)]"
                                title="删除"
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
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">更新与引擎</h3>

                <div className="space-y-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <div className="flex items-center gap-2 mb-4">
                      <ArrowUpCircle size={16} className="text-[var(--accent)]" />
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">落云.Hermes 桌面端</h4>
                      <span className="text-xs text-[var(--text-dim)] bg-[var(--bg-primary)] px-2 py-0.5 rounded">应用本身</span>
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mb-3">桌面应用的版本更新，包含界面功能改进和问题修复</p>
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">当前版本</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">v{appVersion || '—'}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {appUpdateStatus === 'idle' && (
                          <button
                            onClick={() => { setAppUpdateStatus('checking'); window.hermesAPI.checkAppUpdate() }}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                          >
                            <ArrowUpCircle size={14} /> 检查更新
                          </button>
                        )}
                        {appUpdateStatus === 'checking' && (
                          <span className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                            <Loader2 size={14} className="animate-spin" /> 检查中...
                          </span>
                        )}
                        {appUpdateStatus === 'available' && (
                          <>
                            <span className="text-sm text-[var(--accent)]">发现新版本 v{appUpdateVersion}</span>
                            <button
                              onClick={() => { setAppUpdateStatus('downloading'); setAppUpdatePercent(0); window.hermesAPI.downloadAppUpdate() }}
                              className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90"
                            >
                              <Download size={14} /> 下载更新
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
                            <RefreshCw size={14} /> 重启安装
                          </button>
                        )}
                        {appUpdateStatus === 'not-available' && (
                          <span className="flex items-center gap-2 text-sm text-[var(--text-dim)]">
                            <Check size={14} /> 已是最新版本
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
                      <h4 className="text-sm font-semibold text-[var(--text-primary)]">Hermes Agent 引擎</h4>
                      <span className="text-xs text-[var(--text-dim)] bg-[var(--bg-primary)] px-2 py-0.5 rounded">AI 后端</span>
                    </div>
                    <p className="text-xs text-[var(--text-dim)] mb-3">AI 员工的运行引擎，负责对话推理和工具调用</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">引擎版本</span>
                        <div className="text-sm text-[var(--text-primary)] mt-0.5">
                          {hermesVersion === null ? '检测中...' : parsedVersion ? `v${parsedVersion.version}` : '未检测到'}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-[var(--text-dim)]">发布日期</span>
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
                    </div>
                    {parsedVersion?.updateInfo && (
                      <div className="mt-3 rounded-lg bg-[rgba(124,106,239,0.1)] border border-[rgba(124,106,239,0.2)] px-3 py-2 text-sm text-[var(--accent)]">
                        有新版本可用：{parsedVersion.updateInfo}
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
                            {updating ? '更新中...' : '更新引擎'}
                          </button>
                        ) : parsedVersion?.isUpToDate ? (
                          <button className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-dim)] cursor-not-allowed" disabled>
                            <Check size={14} /> 已是最新版本
                          </button>
                        ) : (
                          <button
                            onClick={handleUpdateHermes}
                            disabled={updating}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                          >
                            {updating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                            {updating ? '更新中...' : '更新引擎'}
                          </button>
                        )}
                        <button
                          onClick={handleDoctor}
                          disabled={doctorRunning}
                          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                        >
                          {doctorRunning ? <Loader2 size={14} className="animate-spin" /> : <Activity size={14} />}
                          {doctorRunning ? '诊断中...' : '运行诊断'}
                        </button>
                        <Popconfirm title="重启引擎将中断所有正在运行的对话和任务，确定继续？" confirmText="重启引擎" onConfirm={handleRestartEngines}>
                          <button
                            disabled={restartingEngines}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                          >
                            {restartingEngines ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            {restartingEngines ? '重启中...' : '重启引擎'}
                          </button>
                        </Popconfirm>
                        <Popconfirm title="重新安装将重新拉取并校验当前引擎，优先复用已有虚拟环境和依赖缓存；过程中所有正在运行的任务将被中断。确定继续？" confirmText="重新安装" onConfirm={handleReinstall}>
                          <button
                            disabled={reinstalling}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[rgba(239,68,68,0.1)] border-[rgba(239,68,68,0.3)] px-4 py-2 text-sm text-[var(--danger)] transition-colors hover:bg-[rgba(239,68,68,0.2)] disabled:opacity-50"
                          >
                            {reinstalling ? <Loader2 size={14} className="animate-spin" /> : <Wrench size={14} />}
                            {reinstalling ? '安装中...' : '重新安装'}
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
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">数据管理</h3>

                <div className="space-y-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">导出备份</h4>
                    <p className="text-xs text-[var(--text-dim)] mb-4">将桌面端数据库和 Hermes 数据一起备份。备份文件保存在 ~/.hermes/backups/ 目录。</p>
                    <button
                      onClick={handleBackup}
                      disabled={backingUp}
                      className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                    >
                      {backingUp ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      {backingUp ? '备份中...' : '导出备份'}
                    </button>
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">导入备份</h4>
                    <p className="text-xs text-[var(--text-dim)] mb-4">从桌面端 JSON、ZIP 或 TAR.GZ 备份文件恢复数据。导入将覆盖现有配置，请谨慎操作。</p>
                    {importConfirm ? (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)]">
                        <AlertTriangle size={16} className="text-[var(--warning)] shrink-0" />
                        <span className="text-sm text-[var(--warning)]">导入将覆盖现有数据，确定继续？</span>
                        <button onClick={confirmImport} disabled={importing} className="rounded-lg bg-[var(--warning)] px-3 py-1.5 text-sm text-white cursor-pointer hover:opacity-90 disabled:opacity-50">
                          {importing ? '导入中...' : '确认导入'}
                        </button>
                        <button onClick={() => setImportConfirm(false)} className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-hover)]">
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={handleImportFileSelect}
                        disabled={importing}
                        className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-50"
                      >
                        {importing ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {importing ? '导入中...' : '选择备份文件导入'}
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
  { key: 'agent.log', label: 'Agent', icon: Terminal, color: 'var(--accent)' },
  { key: 'gateway.log', label: 'Gateway', icon: FileText, color: 'var(--info, #3b82f6)' },
  { key: 'errors.log', label: '错误', icon: AlertCircle, color: 'var(--danger, #ef4444)' },
]

function LogsSection(): React.ReactElement {
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
        showToast('日志已清空')
        loadLogs(activeLog)
      } else {
        showToast('清空日志失败', 'error')
      }
    } catch { showToast('清空日志失败', 'error') }
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
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">系统日志</h3>
          <p className="text-xs text-[var(--text-dim)] mt-1 font-mono truncate max-w-md">{logPath || '加载中...'}</p>
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
            自动刷新
          </button>
          <button onClick={handleCopy} disabled={!logContent} className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-30" title="复制">
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
          <Popconfirm title="确认清空当前日志？" confirmText="清空" onConfirm={handleClear}>
            <button disabled={!logContent} className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)] transition-all disabled:opacity-30" title="清空">
              <Trash2 size={14} />
            </button>
          </Popconfirm>
          <button onClick={() => loadLogs()} disabled={loading} className="p-1.5 rounded-lg bg-[var(--bg-surface)] text-[var(--text-dim)] hover:bg-[var(--bg-hover)] transition-all disabled:opacity-50" title="刷新">
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
              <span>{log.label}</span>
            </button>
          )
        })}
        <span className="ml-auto text-[11px] text-[var(--text-dim)]">{lineCount} 行</span>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[rgba(0,0,0,0.2)] overflow-hidden">
        <div className="h-[500px] overflow-auto px-4 py-3 font-mono text-xs leading-5">
          {loading && !logContent ? (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)]">
              <RefreshCw size={18} className="animate-spin mr-2" /> 加载中...
            </div>
          ) : lineCount === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--text-dim)]">暂无日志</div>
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
