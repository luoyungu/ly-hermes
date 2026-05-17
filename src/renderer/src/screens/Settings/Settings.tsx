import { useState, useEffect, useRef, useCallback } from 'react'
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
  Box
} from 'lucide-react'
import { PROVIDER_PRESETS } from '../../shared/employee-shared'

type Section = 'basic' | 'models' | 'engine' | 'data'

export default function SettingsScreen(): React.ReactElement {
  const [section, setSection] = useState<Section>('basic')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle')

  const [idleTimeout, setIdleTimeout] = useState(60)
  const [maxOnline, setMaxOnline] = useState(5)
  const [binaryPath, setBinaryPath] = useState('hermes')

  const [hermesVersion, setHermesVersion] = useState<string | null>(null)
  const [doctorOutput, setDoctorOutput] = useState<string | null>(null)
  const [doctorRunning, setDoctorRunning] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [updateResult, setUpdateResult] = useState<string | null>(null)
  const [updateResultType, setUpdateResultType] = useState<'success' | 'error' | null>(null)
  const [updateLog, setUpdateLog] = useState<string | null>(null)

  const [backingUp, setBackingUp] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importConfirm, setImportConfirm] = useState(false)
  const [backupResult, setBackupResult] = useState<{ success: boolean; message: string } | null>(null)
  const selectedImportPath = useRef<string>('')

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
  const [confirmDeleteModel, setConfirmDeleteModel] = useState<string | null>(null)

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
      const h = c.hermes || {}
      setIdleTimeout((d.idle_timeout as number) || 60)
      setMaxOnline((d.max_online as number) || 5)
      setBinaryPath((h.bin as string) || 'hermes')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    window.hermesAPI.getHermesVersion().then(setHermesVersion).catch(() => {})
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
      ;(newConfig.hermes as Record<string, unknown>).bin = binaryPath || 'hermes'
      await window.hermesAPI.setAppConfig(newConfig)
      setSaveResult('success')
    } catch {
      setSaveResult('error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult('idle'), 2000)
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
    input.accept = '.zip,.tar.gz,.tgz'
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
      setConfirmDeleteModel(null)
      loadSavedModels()
    } catch { /* ignore */ }
  }

  const sectionItems: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'basic', label: '基础设置', icon: <SettingsIcon size={16} /> },
    { key: 'models', label: '模型管理', icon: <Box size={16} /> },
    { key: 'engine', label: '引擎管理', icon: <Wrench size={16} /> },
    { key: 'data', label: '数据管理', icon: <Download size={16} /> }
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: 36, paddingBottom: 12, paddingLeft: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>设置</h2>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[180px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-glass-light)] p-3">
          <h2 className="mb-4 px-2 text-sm font-semibold text-[var(--text-primary)]">设置</h2>
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

                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                      <Terminal size={14} /> Hermes Binary 路径
                    </label>
                    <input
                      type="text"
                      value={binaryPath}
                      onChange={(e) => setBinaryPath(e.target.value)}
                      placeholder="/usr/local/bin/hermes"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                    />
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
                            {confirmDeleteModel === m.id ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleDeleteModel(m.id)}
                                  className="rounded-lg px-2 py-1 text-xs text-[var(--danger)] bg-[rgba(239,68,68,0.1)] hover:bg-[rgba(239,68,68,0.2)]"
                                >
                                  确认
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteModel(null)}
                                  className="rounded-lg px-2 py-1 text-xs text-[var(--text-dim)] hover:bg-[var(--bg-hover)]"
                                >
                                  取消
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteModel(m.id)}
                                className="rounded-lg p-1.5 text-[var(--text-dim)] transition-colors hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)]"
                                title="删除"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
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
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">引擎管理</h3>

                <div className="space-y-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">引擎信息</h4>
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
                  </div>

                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-4">操作</h4>
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
              </section>
            )}

            {section === 'data' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">数据管理</h3>

                <div className="space-y-5">
                  <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                    <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-2">导出备份</h4>
                    <p className="text-xs text-[var(--text-dim)] mb-4">将所有配置、员工档案、日程等数据打包为 ZIP 文件备份。备份文件保存在 ~/.hermes/backups/ 目录。</p>
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
                    <p className="text-xs text-[var(--text-dim)] mb-4">从 ZIP 或 TAR.GZ 备份文件恢复数据。导入将覆盖现有配置，请谨慎操作。</p>
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
          </div>
        </div>
      </div>
    </div>
  )
}
