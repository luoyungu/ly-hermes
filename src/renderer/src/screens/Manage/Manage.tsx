import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlatform } from '../../hooks/usePlatform'
import { useDeploymentMode } from '../../hooks/useDeploymentMode'
import { useRemoteConnectionStatus } from '../../hooks/useRemoteConnectionStatus'
import { translateError } from '../../../../shared/i18n'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  Plus,
  Trash2,
  Power,
  Moon,
  RefreshCw,
  Search,
  X,
  Loader2,
  Save,
  UserPlus,
  Wrench,
  Puzzle,
  Zap,
  Sparkles,
  Download,
  Plug,
  MessageCircle,
  Globe,
  Copy,
  KeyRound,
  Brain
} from 'lucide-react'
import type { DesktopWebServerStatus, EmployeeInfo, InstalledSkill, BundledSkill, MemoryData, SavedModel } from '../../../../preload/index'
import { showToast } from '../../App'
import PetPicker from '../../components/PetPicker'
import Popconfirm from '../../components/Popconfirm'
import { useTheme } from '../../components/ThemeProvider'
import {
  mapStatus,
  statusColor,
  statusDotClass,
  AVATARS,
  ALL_TOOLS,
  EMPLOYEE_NAME_RE,
  getNestedValue,
  setNestedValue,
  PROVIDER_PRESETS,
  useEmployeeShared,
  type ConfigFieldDef
} from '../../shared/employee-shared'

type Section = 'list' | 'create' | 'edit'

export default function Manage(): React.ReactElement {
  const { t } = useTranslation()
  const { isMac } = usePlatform()
  const { lexicon } = useTheme()
  const [section, setSection] = useState<Section>('list')
  const [employees, setEmployees] = useState<EmployeeInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingEmployee, setEditingEmployee] = useState<EmployeeInfo | null>(null)

  const loadEmployees = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.hermesAPI.listEmployees()
      const mapped = (list || []).map(e => ({ ...e, status: mapStatus(e.status || '') }))
      setEmployees(mapped)
    } catch { setEmployees([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadEmployees() }, [loadEmployees])

  useEffect(() => {
    const unsub = window.hermesAPI.onEmployeeStatusChanged(() => { loadEmployees() })
    return unsub
  }, [loadEmployees])

  const handleWakeUp = async (name: string): Promise<void> => {
    try {
      await window.hermesAPI.wakeUpEmployee(name)
      showToast(t('manage.waking'))
      setTimeout(loadEmployees, 2000)
    } catch { showToast(t('manage.wakeFailed'), 'error') }
  }

  const handleSleep = async (name: string): Promise<void> => {
    try {
      await window.hermesAPI.sleepEmployee(name)
      showToast(t('manage.slept'))
      setTimeout(loadEmployees, 1000)
    } catch { showToast(t('manage.sleepFailed'), 'error') }
  }

  const handleRestart = async (name: string): Promise<void> => {
    try {
      await window.hermesAPI.restartEmployee(name)
      showToast(t('manage.restarting'))
      setTimeout(loadEmployees, 3000)
    } catch { showToast(t('manage.restartFailed'), 'error') }
  }

  const handleDelete = async (name: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.deleteEmployee(name)
      if (result.success) {
        showToast(t('common.deleteSuccess'))
        setEditingEmployee(null)
        setSection('list')
        loadEmployees()
      } else {
        showToast(translateError(result.error, t) || t('common.deleteFailed'), 'error')
      }
    } catch { showToast(t('common.deleteFailed'), 'error') }
  }

  const filteredEmployees = employees.filter(e =>
    !searchQuery || e.name.includes(searchQuery) || (e.displayName || '').includes(searchQuery)
  )

  return (
    <div className="flex h-full flex-col">
      <div className="screen-header drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}>
        <h2 className="screen-header-title">{lexicon.nav.manage}</h2>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[260px] shrink-0 border-r border-[var(--border)] glass-medium flex flex-col">
          <div className="px-3 pt-4 pb-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-[11px] text-[var(--text-dim)]" />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={lexicon.entities.searchEmployee}
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] pl-9 pr-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {filteredEmployees.length === 0 && !loading && (
              <div className="text-center py-12 text-[var(--text-dim)]">
                <div className="text-4xl mb-3 opacity-30">👥</div>
                <p className="text-sm">{searchQuery ? lexicon.entities.noEmployeeMatches : lexicon.entities.noEmployees}</p>
              </div>
            )}
            {filteredEmployees.map(emp => {
              const isActive = editingEmployee?.name === emp.name
              return (
                <div
                  key={emp.name}
                  onClick={() => { setEditingEmployee(emp); setSection('edit') }}
                  className={`flex items-center gap-3 py-2.5 px-3 rounded-[var(--radius)] cursor-pointer transition-all mb-1 relative border ${
                    isActive ? 'glass-medium border-[rgba(124,106,239,0.2)] shadow-[0_2px_8px_rgba(124,106,239,0.08)]' : 'border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--border)]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-sm bg-[var(--accent)] shadow-[0_0_8px_var(--accent)]" />
                  )}
                  <div className="w-10 h-10 rounded-xl glass-medium flex items-center justify-center text-xl shrink-0 relative border border-[var(--border)]">
                    {emp.avatar || '🧑‍💼'}
                    <span className={`absolute -bottom-px -right-px w-3 h-3 rounded-full border-2 border-[var(--bg-primary)] ${statusDotClass(emp.status || '')}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{emp.displayName || emp.name}</div>
                    <div className="text-xs text-[var(--text-dim)] truncate">{emp.model || lexicon.entities.defaultRole}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="p-3 border-t border-[var(--border)]">
            <button
              onClick={() => { setEditingEmployee(null); setSection('create') }}
              className="flex items-center justify-center gap-2 w-full rounded-[var(--radius)] bg-accent-gradient px-3 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 cursor-pointer"
            >
              <UserPlus size={16} /> {lexicon.entities.createEmployee}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {section === 'list' && (
            <div className="flex flex-col items-center justify-center h-full text-[var(--text-dim)] gap-3">
              <span className="text-5xl opacity-30">👥</span>
              <p className="text-sm">{lexicon.entities.selectEmployee}{t('manage.selectDetailHint')}{lexicon.entities.createEmployee}</p>
            </div>
          )}
          {section === 'create' && (
            <CreateEmployee
              lexicon={lexicon}
              onCreated={() => { setSection('list'); loadEmployees() }}
              onCancel={() => setSection('list')}
            />
          )}
          {section === 'edit' && editingEmployee && (
            <EditEmployee
              lexicon={lexicon}
              key={editingEmployee.name}
              employee={editingEmployee}
              onRefresh={loadEmployees}
              onDelete={() => handleDelete(editingEmployee.name)}
              onWakeUp={() => handleWakeUp(editingEmployee.name)}
              onSleep={() => handleSleep(editingEmployee.name)}
              onRestart={() => handleRestart(editingEmployee.name)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function CreateEmployee({ lexicon, onCreated, onCancel }: { lexicon: ReturnType<typeof useTheme>['lexicon']; onCreated: () => void; onCancel: () => void }): React.ReactElement {
  const { t } = useTranslation()
  const { soulStyles, soulPrompts } = useEmployeeShared()
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('')
  const [avatar, setAvatar] = useState('🧑‍💼')
  const [soul, setSoul] = useState('')
  const [petSlug, setPetSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [soulPrompt, setSoulPrompt] = useState('')
  const [soulStyle, setSoulStyle] = useState('detailed')
  const [generatingSoul, setGeneratingSoul] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showPetPicker, setShowPetPicker] = useState(false)
  const [savedModels, setSavedModels] = useState<SavedModel[]>([])
  const [selectedModelId, setSelectedModelId] = useState('')
  const [soulModelInfo, setSoulModelInfo] = useState<{ model: string; provider: string; ready: boolean; hint?: string } | null>(null)
  const avatarPickerRef = useRef<HTMLDivElement>(null)
  const petPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      window.hermesAPI.listSavedModels(),
      window.hermesAPI.getModelConfig(),
      window.hermesAPI.getSoulGenerationModel(),
    ]).then(([models, cfg, soulModel]) => {
      setSavedModels(models)
      setSoulModelInfo(soulModel)
      const matched = models.find(m => m.model === cfg.model && m.provider === cfg.provider)
      setSelectedModelId(matched?.id || models[0]?.id || '')
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!showAvatarPicker) return
    const handler = (e: MouseEvent) => {
      if (avatarPickerRef.current && !avatarPickerRef.current.contains(e.target as Node)) {
        setShowAvatarPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAvatarPicker])

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) { showToast(t('manage.enterName', { entity: lexicon.entities.employee }), 'error'); return }
    if (!EMPLOYEE_NAME_RE.test(name.trim())) { showToast(t('manage.invalidName', { entity: lexicon.entities.employee }), 'error'); return }
    const selectedModel = savedModels.find(m => m.id === selectedModelId)
    if (!selectedModel) {
      showToast(t('manage.selectModel'), 'error')
      return
    }
    setCreating(true)
    try {
      const result = await window.hermesAPI.createEmployee(name.trim(), {
        displayName: displayName.trim() || undefined,
        role: role.trim() || undefined,
        avatar: avatar || undefined,
        soul: soul.trim() || undefined,
        petSlug: petSlug || undefined,
        model: selectedModel.model,
        provider: selectedModel.provider,
        base_url: selectedModel.baseUrl,
        api_key: selectedModel.apiKey || undefined,
        wakeUp: true
      })
      if (result.success) {
        showToast(t('common.createSuccess'))
        onCreated()
      } else {
        showToast(translateError(result.error, t) || t('common.createFailed'), 'error')
      }
    } catch { showToast(t('common.createFailed'), 'error') }
    finally { setCreating(false) }
  }

  const handleGenerateSoul = async (refinement = ''): Promise<void> => {
    const prompt = soulPrompt.trim()
    if (!prompt && !soul.trim()) {
      showToast(t('manage.enterSoulDesc'), 'error')
      return
    }
    if (soulModelInfo && !soulModelInfo.ready) {
      showToast(soulModelInfo.hint || t('manage.configureModel'), 'error')
      return
    }
    setGeneratingSoul(true)
    try {
      const result = await window.hermesAPI.generateEmployeeSoulDraft({
        prompt: prompt || displayName.trim() || role.trim() || name.trim(),
        name: name.trim(),
        displayName: displayName.trim(),
        role: role.trim(),
        style: soulStyle,
        refinement,
        existingSoul: refinement ? soul.trim() : ''
      })
      if (!result.success || !result.draft) {
        showToast(translateError(result.error, t) || t('manage.generateFailed'), 'error')
        return
      }
      const draft = result.draft
      setName(draft.name)
      setDisplayName(draft.displayName)
      setRole(draft.role)
      setSoul(draft.soul)
      showToast(t('manage.soulDraftGenerated'))
    } catch (e: unknown) {
      showToast(translateError((e as Error).message, t) || t('manage.generateFailedCheck'), 'error')
    } finally {
      setGeneratingSoul(false)
    }
  }

  const soulModelLabel = soulModelInfo?.ready
    ? `${PROVIDER_PRESETS.find(p => p.id === soulModelInfo.provider)?.label || soulModelInfo.provider} · ${soulModelInfo.model}`
    : soulModelInfo?.hint || t('manage.noDefaultModel')

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{lexicon.entities.createEmployee}</h3>
      <div className="space-y-5 glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.generateSoulTitle')}</span>
            </div>
            <span className="text-xs text-[var(--text-dim)]">{t('manage.generateSoulHint')}</span>
          </div>
          <div className="flex gap-2">
            <input
              value={soulPrompt}
              onChange={(e) => setSoulPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  handleGenerateSoul()
                }
              }}
              placeholder={t('manage.soulPlaceholder')}
              className="min-w-0 flex-1 glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
            <select
              value={soulStyle}
              onChange={(e) => setSoulStyle(e.target.value)}
              className="shrink-0 glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            >
              {soulStyles.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => handleGenerateSoul()}
              disabled={generatingSoul || !soulPrompt.trim()}
              className="shrink-0 flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
            >
              {generatingSoul ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              {generatingSoul ? t('common.generating') : t('common.generate')}
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-dim)]">
            {t('manage.soulGenerateNote')}
          </p>
          <p className={`mt-1.5 text-xs leading-relaxed ${soulModelInfo?.ready ? 'text-[var(--text-dim)]' : 'text-[var(--danger)]'}`}>
            {t('manage.usingDefaultModel', { model: soulModelLabel })}
          </p>
          {soul.trim() && (
            <div className="mt-3 flex flex-wrap gap-2">
              {soulPrompts.map(option => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => handleGenerateSoul(option.value)}
                  disabled={generatingSoul}
                  className="rounded-[var(--radius)] border border-[var(--border)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 mb-2">
          <UserPlus size={16} className="text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--text-primary)]">{lexicon.entities.employeeInfo}</span>
        </div>
        <div className="flex items-start gap-4">
          <div className="relative" ref={avatarPickerRef}>
            <button
              onClick={() => setShowAvatarPicker(!showAvatarPicker)}
              className="w-16 h-16 rounded-2xl glass-medium flex items-center justify-center text-[32px] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-colors"
            >
              {avatar}
            </button>
            {showAvatarPicker && (
              <div className="absolute top-full left-0 mt-2 p-3 rounded-xl glass-heavy border border-[var(--border)] grid grid-cols-4 gap-2 z-10 shadow-lg max-w-[240px]">
                {AVATARS.map(a => (
                  <button
                    key={a}
                    onClick={() => { setAvatar(a); setShowAvatarPicker(false) }}
                    className={`w-11 h-11 rounded-lg flex items-center justify-center text-[22px] cursor-pointer transition-colors border ${avatar === a ? 'bg-[var(--accent-glow)] border-[var(--accent)]' : 'border-transparent hover:bg-[var(--bg-hover)]'}`}
                  >
                    {a}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div>
              <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.nameLabel')}</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t('manage.namePlaceholder')}
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              />
            </div>
            <div>
              <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.displayNameLabel')}</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={t('manage.displayNamePlaceholder')}
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.defaultModelLabel')}</label>
          {savedModels.length === 0 ? (
            <p className="text-sm text-[var(--danger)]">{t('manage.addModelFirst')}</p>
          ) : (
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] bg-transparent cursor-pointer"
            >
              {savedModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name || `${PROVIDER_PRESETS.find(p => p.id === m.provider)?.label || m.provider} · ${m.model}`}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1.5 text-xs text-[var(--text-dim)]">{t('manage.modelWriteHint')}</p>
        </div>

        <div>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.roleLabel')}</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder={t('manage.rolePlaceholder')}
            className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <div>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><Sparkles size={14} /> {lexicon.concepts.soulSetting}</label>
          <textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            placeholder={t('manage.soulDescPlaceholder', { entity: lexicon.entities.virtualEmployee })}
            className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[120px] focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <div className="relative" ref={petPickerRef}>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5">🐾 {t('manage.companionPet')}</label>
          <button
            type="button"
            onClick={() => setShowPetPicker(!showPetPicker)}
            className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] bg-[var(--bg-surface)] flex items-center gap-2 cursor-pointer text-left"
          >
            {petSlug ? (
              <span className="flex items-center gap-2">
                <span>🐾</span>
                {petSlug}
              </span>
            ) : (
              <span className="text-[var(--text-dim)]">{t('manage.selectPet')}</span>
            )}
          </button>
          {showPetPicker && (
            <PetPicker
              value={petSlug}
              onChange={setPetSlug}
              onClose={() => setShowPetPicker(false)}
            />
          )}
        </div>
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={handleCreate}
          disabled={creating || !name.trim() || savedModels.length === 0 || !selectedModelId}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? t('common.creating') : lexicon.entities.createEmployee}
        </button>
        <button
          onClick={onCancel}
          className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}

type EditTab = 'basic' | 'soul' | 'memory' | 'config' | 'integrations' | 'tools' | 'skills'

const isMaskedSecret = (value: string): boolean => value.includes('****')

const nonMasked = (value: string): string => isMaskedSecret(value) ? '' : value

function EditEmployee({
  employee,
  onRefresh,
  onDelete,
  onWakeUp,
  onSleep,
  lexicon,
  onRestart
}: {
  employee: EmployeeInfo
  lexicon: ReturnType<typeof useTheme>['lexicon']
  onRefresh: () => void
  onDelete: () => void
  onSleep: () => void
  onWakeUp: () => void
  onRestart: () => void
}): React.ReactElement {
  const { t } = useTranslation()
  const { statusText, toolMeta, agentConfigFields } = useEmployeeShared()
  const deploymentMode = useDeploymentMode()
  const { connection: remoteConnection } = useRemoteConnectionStatus(deploymentMode === 'client_only')
  const [tab, setTab] = useState<EditTab>('basic')
  const [saving, setSaving] = useState(false)

  const [displayName, setDisplayName] = useState(employee.displayName || '')
  const [role, setRole] = useState(employee.role || '')
  const [avatar, setAvatar] = useState(employee.avatar || '🧑‍💼')
  const [petSlug, setPetSlug] = useState(employee.petSlug || '')
  const [webAccessEnabled, setWebAccessEnabled] = useState(employee.webAccessEnabled === true)
  const [webAccessToken, setWebAccessToken] = useState(employee.webAccessToken || '')
  const [webServerStatus, setWebServerStatus] = useState<DesktopWebServerStatus | null>(null)
  const [showPetPicker, setShowPetPicker] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const avatarPickerRef = useRef<HTMLDivElement>(null)
  const petPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showAvatarPicker) return
    const handler = (e: MouseEvent) => {
      if (avatarPickerRef.current && !avatarPickerRef.current.contains(e.target as Node)) {
        setShowAvatarPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showAvatarPicker])

  const [soulContent, setSoulContent] = useState('')
  const [soulOriginal, setSoulOriginal] = useState('')
  const [memoryData, setMemoryData] = useState<MemoryData | null>(null)
  const [memoryLoading, setMemoryLoading] = useState(false)
  const [newMemoryContent, setNewMemoryContent] = useState('')
  const [memorySaving, setMemorySaving] = useState(false)
  const [configObj, setConfigObj] = useState<Record<string, unknown>>({})
  const [configOriginal, setConfigOriginal] = useState<Record<string, unknown>>({})
  const [envLoading, setEnvLoading] = useState(false)
  const [feishuAppId, setFeishuAppId] = useState('')
  const [feishuAppSecret, setFeishuAppSecret] = useState('')
  const [feishuHomeChannel, setFeishuHomeChannel] = useState('')
  const [feishuDomain, setFeishuDomain] = useState('feishu')
  const [feishuConnectionMode, setFeishuConnectionMode] = useState('websocket')
  const [hasSavedFeishuSecret, setHasSavedFeishuSecret] = useState(false)
  const [weixinAccountId, setWeixinAccountId] = useState('')
  const [weixinToken, setWeixinToken] = useState('')
  const [weixinHomeChannel, setWeixinHomeChannel] = useState('')
  const [hasSavedWeixinToken, setHasSavedWeixinToken] = useState(false)
  const [dingtalkClientId, setDingtalkClientId] = useState('')
  const [dingtalkClientSecret, setDingtalkClientSecret] = useState('')
  const [dingtalkHomeChannel, setDingtalkHomeChannel] = useState('')
  const [hasSavedDingtalkSecret, setHasSavedDingtalkSecret] = useState(false)
  const [tools, setTools] = useState<string[]>([])
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [bundledSkills, setBundledSkills] = useState<BundledSkill[]>([])
  const [skillInstallUrl, setSkillInstallUrl] = useState('')
  const [detailSkill, setDetailSkill] = useState<InstalledSkill | BundledSkill | null>(null)
  const [detailContent, setDetailContent] = useState('')
  const [isBundledSkill, setIsBundledSkill] = useState(false)
  const [skillTab, setSkillTab] = useState<'installed' | 'browse'>('installed')
  const [skillSearch, setSkillSearch] = useState('')
  const [skillCategoryFilter, setSkillCategoryFilter] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)

  const loadSkills = useCallback(async () => {
    const ename = employee.name
    try {
      const [installedSkills, bundledSkills] = await Promise.all([
        window.hermesAPI.listInstalledSkills(ename),
        window.hermesAPI.listBundledSkills(ename)
      ])
      setSkills(installedSkills)
      setBundledSkills(bundledSkills)
    } catch (err) {
      console.error('Failed to load skills:', err)
    }
  }, [employee.name])

  const loadMemory = useCallback(async () => {
    setMemoryLoading(true)
    try {
      const data = await window.hermesAPI.getEmployeeMemory(employee.name)
      setMemoryData(data)
    } catch {
      setMemoryData({ memory: [], user: '', stats: {} })
    } finally {
      setMemoryLoading(false)
    }
  }, [employee.name])

  useEffect(() => {
    const ename = employee.name
    setDisplayName(employee.displayName || '')
    setRole(employee.role || '')
    setAvatar(employee.avatar || '🧑‍💼')
    setPetSlug(employee.petSlug || '')
    setWebAccessEnabled(employee.webAccessEnabled === true)
    setWebAccessToken(employee.webAccessToken || '')
    if (deploymentMode !== 'client_only') {
      window.hermesAPI.getDesktopWebServerStatus().then(setWebServerStatus).catch(() => setWebServerStatus(null))
    } else {
      setWebServerStatus(null)
    }
    window.hermesAPI.getEmployeeSoul(ename).then((s) => { setSoulContent(s || ''); setSoulOriginal(s || '') }).catch(() => {})
    window.hermesAPI.getEmployeeTools(ename).then(setTools).catch(() => {})
    loadSkills()
    loadMemory()
    window.hermesAPI.getEmployeeConfig(ename).then((c) => {
      const obj = c && typeof c === 'object' ? c as Record<string, unknown> : {}
      setConfigObj(obj); setConfigOriginal(JSON.parse(JSON.stringify(obj)))
    }).catch(() => {})
    setEnvLoading(true)
    window.hermesAPI.getEmployeeEnv(ename).then((env) => {
      setFeishuAppId(env.FEISHU_APP_ID || '')
      setFeishuAppSecret(nonMasked(env.FEISHU_APP_SECRET || ''))
      setHasSavedFeishuSecret(Boolean(env.FEISHU_APP_SECRET))
      setFeishuHomeChannel(env.FEISHU_HOME_CHANNEL || '')
      setFeishuDomain(env.FEISHU_DOMAIN || 'feishu')
      setFeishuConnectionMode(env.FEISHU_CONNECTION_MODE || 'websocket')
      setWeixinAccountId(env.WEIXIN_ACCOUNT_ID || '')
      setWeixinToken(nonMasked(env.WEIXIN_TOKEN || ''))
      setHasSavedWeixinToken(Boolean(env.WEIXIN_TOKEN))
      setWeixinHomeChannel(env.WEIXIN_HOME_CHANNEL || '')
      setDingtalkClientId(env.DINGTALK_CLIENT_ID || '')
      setDingtalkClientSecret(nonMasked(env.DINGTALK_CLIENT_SECRET || ''))
      setHasSavedDingtalkSecret(Boolean(env.DINGTALK_CLIENT_SECRET))
      setDingtalkHomeChannel(env.DINGTALK_HOME_CHANNEL || '')
    }).catch(() => {
      setFeishuAppId('')
      setFeishuAppSecret('')
      setHasSavedFeishuSecret(false)
      setFeishuHomeChannel('')
      setFeishuDomain('feishu')
      setFeishuConnectionMode('websocket')
      setWeixinAccountId('')
      setWeixinToken('')
      setHasSavedWeixinToken(false)
      setWeixinHomeChannel('')
      setDingtalkClientId('')
      setDingtalkClientSecret('')
      setHasSavedDingtalkSecret(false)
      setDingtalkHomeChannel('')
    }).finally(() => setEnvLoading(false))
  }, [employee, loadSkills, loadMemory, deploymentMode])

  const isWebClient = typeof navigator !== 'undefined' && !navigator.userAgent.includes('Electron')

  const embedOrigin = deploymentMode === 'client_only'
    ? (isWebClient
      ? window.location.origin.replace(/\/$/, '')
      : (remoteConnection?.host ? `http://${remoteConnection.host}:${remoteConnection.port}` : ''))
    : (webServerStatus?.url || 'http://127.0.0.1:8787').replace(/\/(embed|app)\/?.*$/, '').replace(/\/$/, '')

  const webAccessUrl = webAccessToken && embedOrigin
    ? `${embedOrigin}/embed?agent=${encodeURIComponent(employee.name)}&token=${encodeURIComponent(webAccessToken)}`
    : ''

  const handleSaveBasic = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.hermesAPI.updateEmployee(employee.name, {
        displayName: displayName || undefined,
        role: role || undefined,
        avatar: avatar || undefined
      })
      if (petSlug !== employee.petSlug) {
        await window.hermesAPI.setEmployeePet(employee.name, petSlug)
      }
      showToast(t('manage.basicSaved'))
      onRefresh()
    } catch { showToast(t('common.saveFailed'), 'error') }
    finally { setSaving(false) }
  }

  const refreshEmployeeWebAccess = async (): Promise<void> => {
    const latest = await window.hermesAPI.getEmployee(employee.name)
    if (!latest) return
    setWebAccessEnabled(latest.webAccessEnabled === true)
    setWebAccessToken(latest.webAccessToken || '')
  }

  const handleToggleWebAccess = async (enabled: boolean): Promise<void> => {
    setSaving(true)
    try {
      const result = await window.hermesAPI.updateEmployee(employee.name, {
        webAccessEnabled: enabled
      })
      if (!result.success) {
        showToast(translateError(result.error, t) || t('manage.webAccessFailed'), 'error')
        return
      }
      await refreshEmployeeWebAccess()
      showToast(enabled ? t('manage.webAccessEnabled') : t('manage.webAccessDisabled'))
      onRefresh()
    } catch {
      showToast(t('manage.webAccessFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleResetWebAccessToken = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await window.hermesAPI.resetEmployeeWebToken(employee.name)
      if (!result.success) {
        showToast(translateError(result.error, t) || t('manage.resetTokenFailed'), 'error')
        return
      }
      setWebAccessToken(result.token || '')
      showToast(t('manage.tokenReset'))
      onRefresh()
    } catch {
      showToast(t('manage.resetTokenFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyWebAccessUrl = async (): Promise<void> => {
    if (!webAccessEnabled || !webAccessUrl) {
      showToast(t('manage.enableWebFirst'), 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(webAccessUrl)
      showToast(t('manage.linkCopied'))
    } catch {
      showToast(t('common.copyFailed'), 'error')
    }
  }

  const handleSaveSoul = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.hermesAPI.setEmployeeSoul(employee.name, soulContent)
      setSoulOriginal(soulContent)
      showToast(t('manage.soulSaved', { concept: lexicon.concepts.soulSetting }))
    } catch { showToast(t('common.saveFailed'), 'error') }
    finally { setSaving(false) }
  }

  const handleAddMemory = async (): Promise<void> => {
    const content = newMemoryContent.trim()
    if (!content) {
      showToast(t('manage.enterMemory'), 'error')
      return
    }
    setMemorySaving(true)
    try {
      const result = await window.hermesAPI.addMemory(employee.name, content)
      if (result.success) {
        setNewMemoryContent('')
        await loadMemory()
        showToast(t('manage.memoryAdded'))
      } else {
        showToast(translateError(result.error, t) || t('manage.addMemoryFailed'), 'error')
      }
    } catch {
      showToast(t('manage.addMemoryFailed'), 'error')
    } finally {
      setMemorySaving(false)
    }
  }

  const handleDeleteMemory = async (index: number): Promise<void> => {
    setMemorySaving(true)
    try {
      const result = await window.hermesAPI.deleteMemory(employee.name, index)
      if (result.success) {
        await loadMemory()
        showToast(t('manage.memoryDeleted'))
      } else {
        showToast(translateError(result.error, t) || t('manage.deleteMemoryFailed'), 'error')
      }
    } catch {
      showToast(t('manage.deleteMemoryFailed'), 'error')
    } finally {
      setMemorySaving(false)
    }
  }

  const handleSaveConfig = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.hermesAPI.setEmployeeConfig(employee.name, configObj)
      setConfigOriginal(JSON.parse(JSON.stringify(configObj)))
      showToast(t('manage.configSaved'))
    } catch { showToast(t('common.saveFailed'), 'error') }
    finally { setSaving(false) }
  }

  const handleSaveIntegrations = async (): Promise<void> => {
    setSaving(true)
    try {
      const envObj: Record<string, string> = {
        FEISHU_DOMAIN: feishuDomain.trim() || 'feishu',
        FEISHU_CONNECTION_MODE: feishuConnectionMode.trim() || 'websocket',
      }
      if (feishuAppId.trim()) envObj.FEISHU_APP_ID = feishuAppId.trim()
      if (feishuHomeChannel.trim()) envObj.FEISHU_HOME_CHANNEL = feishuHomeChannel.trim()
      if (feishuAppSecret.trim() && !isMaskedSecret(feishuAppSecret)) {
        envObj.FEISHU_APP_SECRET = feishuAppSecret.trim()
      }
      if (weixinAccountId.trim()) envObj.WEIXIN_ACCOUNT_ID = weixinAccountId.trim()
      if (weixinHomeChannel.trim()) envObj.WEIXIN_HOME_CHANNEL = weixinHomeChannel.trim()
      if (weixinToken.trim() && !isMaskedSecret(weixinToken)) {
        envObj.WEIXIN_TOKEN = weixinToken.trim()
      }
      if (dingtalkClientId.trim()) envObj.DINGTALK_CLIENT_ID = dingtalkClientId.trim()
      if (dingtalkHomeChannel.trim()) envObj.DINGTALK_HOME_CHANNEL = dingtalkHomeChannel.trim()
      if (dingtalkClientSecret.trim() && !isMaskedSecret(dingtalkClientSecret)) {
        envObj.DINGTALK_CLIENT_SECRET = dingtalkClientSecret.trim()
      }
      const result = await window.hermesAPI.setEmployeeEnv(employee.name, envObj)
      if (!result.success) {
        showToast(translateError(result.error, t) || t('manage.integrationSaveFailed'), 'error')
        return
      }
      if (feishuAppSecret.trim()) setHasSavedFeishuSecret(true)
      if (weixinToken.trim()) setHasSavedWeixinToken(true)
      if (dingtalkClientSecret.trim()) setHasSavedDingtalkSecret(true)
      showToast(t('manage.integrationSaved'))
      await window.hermesAPI.restartEmployee(employee.name).catch(() => {})
      onRefresh()
    } catch {
      showToast(t('manage.integrationSaveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleTool = async (toolKey: string, enabled: boolean): Promise<void> => {
    try {
      await window.hermesAPI.toggleTool(employee.name, toolKey, !enabled)
      setTools(prev => enabled ? prev.filter(t => t !== toolKey) : [...prev, toolKey])
      showToast(enabled ? t('manage.toolDisabled', { tool: toolMeta[toolKey]?.label || toolKey }) : t('manage.toolEnabled', { tool: toolMeta[toolKey]?.label || toolKey }), 'info')
    } catch { showToast(t('manage.toggleToolFailed', { concept: lexicon.concepts.tools }), 'error') }
  }

  const handleViewSkillDetail = async (skill: InstalledSkill | BundledSkill, isBundled?: boolean): Promise<void> => {
    setDetailSkill(skill)
    setIsBundledSkill(isBundled || false)
    setDetailContent('')
    try {
      if ('path' in skill) {
        const content = await window.hermesAPI.getSkillContent(skill.path)
        setDetailContent(content)
      }
    } catch (err) {
      console.error('Failed to load skill content:', err)
      setDetailContent('')
    }
  }

  const handleInstallSkill = async (identifier: string): Promise<void> => {
    setActionInProgress(identifier)
    try {
      const result = await window.hermesAPI.installSkill(identifier, employee.name)
      if (result.success) {
        showToast(t('manage.skillInstallSuccess', { concept: lexicon.concepts.skills }))
        setSkillInstallUrl('')
        await loadSkills()
      } else {
        showToast(translateError(result.error, t) || t('manage.installFailed'), 'error')
      }
    } catch { 
      showToast(t('manage.installFailed'), 'error') 
    } finally {
      setActionInProgress(null)
    }
  }

  const handleInstallSkillFromUrl = async (): Promise<void> => {
    if (!skillInstallUrl.trim()) return
    await handleInstallSkill(skillInstallUrl.trim())
  }

  const handleUninstallSkill = async (skillName: string): Promise<void> => {
    setActionInProgress(skillName)
    try {
      await window.hermesAPI.uninstallSkill(skillName, employee.name)
      if (detailSkill && detailSkill.name === skillName) {
        setDetailSkill(null)
      }
      await loadSkills()
      showToast(t('manage.skillRemoved', { concept: lexicon.concepts.skills }))
    } catch { showToast(t('manage.uninstallFailed'), 'error') }
    finally {
      setActionInProgress(null)
    }
  }

  const handleToggleSkillEnabled = async (skill: InstalledSkill, enabled: boolean): Promise<void> => {
    setActionInProgress(skill.id)
    try {
      const result = await window.hermesAPI.setSkillEnabled(skill.id, enabled, employee.name)
      if (!result.success) {
        showToast(translateError(result.error, t) || t('manage.toggleSkillFailed'), 'error')
        return
      }
      await loadSkills()
      showToast(enabled ? t('manage.skillEnabledToast') : t('manage.skillDisabledToast'), 'info')
    } catch {
      showToast(t('manage.toggleSkillFailed'), 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const updateConfigField = (key: string, value: unknown): void => {
    setConfigObj(prev => setNestedValue(prev, key, value))
  }

  const memoryConfig = (configObj.memory && typeof configObj.memory === 'object' ? configObj.memory : {}) as Record<string, unknown>
  const memoryProvider = String(memoryConfig.provider || memoryConfig.memory_provider || 'local').trim()
  const hasExternalMemoryProvider = Boolean(memoryProvider && !['local', 'builtin', 'built-in', 'file', 'files', 'none', 'off', 'false'].includes(memoryProvider.toLowerCase()))

  const tabs: { id: EditTab; label: string; icon: React.ReactElement }[] = [
    { id: 'basic', label: t('manage.basicInfo'), icon: <UserPlus size={14} /> },
    { id: 'soul', label: lexicon.concepts.soul, icon: <Sparkles size={14} /> },
    { id: 'memory', label: t('manage.builtinMemory'), icon: <Brain size={14} /> },
    { id: 'config', label: lexicon.concepts.config, icon: <Wrench size={14} /> },
    { id: 'integrations', label: t('manage.integrations'), icon: <Plug size={14} /> },
    { id: 'tools', label: lexicon.concepts.tools, icon: <Zap size={14} /> },
    { id: 'skills', label: lexicon.concepts.skills, icon: <Puzzle size={14} /> },
  ]

  const empStatus = employee.status || 'unknown'

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-4 px-6 py-4 shrink-0">
        <div className="w-14 h-14 rounded-2xl glass-medium flex items-center justify-center text-[28px] border border-[var(--border)] relative">
          {employee.avatar || '🧑‍💼'}
          <span className={`absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[var(--bg-primary)] ${statusDotClass(empStatus)}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold">{employee.displayName || employee.name}</div>
          <div className="text-sm text-[var(--text-dim)] flex items-center gap-2">
            <span>{employee.name}</span>
            <span className="text-[var(--border)]">·</span>
            <span>{employee.model || t('manage.defaultModel')}</span>
            <span className="text-[var(--border)]">·</span>
            <span style={{ color: statusColor(empStatus) }}>{statusText(empStatus)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {empStatus === 'awake' ? (
            <button onClick={onSleep} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all"><Moon size={14} /> {t('manage.sleep')}</button>
          ) : (
            <button onClick={onWakeUp} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-1.5 text-sm text-[var(--success)] hover:bg-[rgba(34,197,94,0.15)] cursor-pointer transition-all"><Power size={14} /> {t('manage.wake')}</button>
          )}
          <button onClick={onRestart} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all"><RefreshCw size={14} /> {t('manage.restart')}</button>
          <Popconfirm title={lexicon.entities.deleteEmployeeConfirm} onConfirm={onDelete}>
            <button className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(239,68,68,0.2)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-all"><Trash2 size={14} /> {t('common.delete')}</button>
          </Popconfirm>
        </div>
      </div>

      <div className="flex border-b border-[var(--border)] px-5 gap-0 shrink-0">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px cursor-pointer ${tab === t.id ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-primary)]'}`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'basic' && (
          <div className="space-y-4 max-w-2xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
              <div className="flex items-center gap-2 mb-4">
                <UserPlus size={16} className="text-[var(--accent)]" />
                <span className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.basicInfo')}</span>
              </div>
              <div className="flex items-start gap-5">
                <div className="relative" ref={avatarPickerRef}>
                  <button
                    onClick={() => setShowAvatarPicker(!showAvatarPicker)}
                    className="w-16 h-16 rounded-2xl glass-medium flex items-center justify-center text-[32px] border border-[var(--border)] cursor-pointer hover:border-[var(--accent)] transition-colors"
                  >
                    {avatar}
                  </button>
                  {showAvatarPicker && (
                    <div className="absolute top-full left-0 mt-2 p-3 rounded-xl glass-heavy border border-[var(--border)] grid grid-cols-4 gap-2 z-10 shadow-lg max-w-[240px]">
                      {AVATARS.map(a => (
                        <button
                          key={a}
                          onClick={() => { setAvatar(a); setShowAvatarPicker(false) }}
                          className={`w-11 h-11 rounded-lg flex items-center justify-center text-[22px] cursor-pointer transition-colors border ${avatar === a ? 'bg-[var(--accent-glow)] border-[var(--accent)]' : 'border-transparent hover:bg-[var(--bg-hover)]'}`}
                        >
                          {a}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.displayNameLabel')}</label>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]" />
                  </div>
                  <div>
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('manage.roleLabel')}</label>
                    <input value={role} onChange={(e) => setRole(e.target.value)} placeholder={t('manage.rolePlaceholder')} className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]" />
                  </div>
                  <div className="relative" ref={petPickerRef}>
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5">🐾 {t('manage.companionPet')}</label>
                    <button
                      type="button"
                      onClick={() => setShowPetPicker(!showPetPicker)}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] bg-[var(--bg-surface)] flex items-center gap-2 cursor-pointer text-left"
                    >
                      {petSlug ? (
                        <span className="flex items-center gap-2">
                          <span>🐾</span>
                          {petSlug}
                        </span>
                      ) : (
                        <span className="text-[var(--text-dim)]">{t('manage.selectPet')}</span>
                      )}
                    </button>
                    {showPetPicker && (
                      <PetPicker
                        value={petSlug}
                        onChange={setPetSlug}
                        onClose={() => setShowPetPicker(false)}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Globe size={16} className="text-[var(--accent)]" />
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.webAccess')}</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                    {deploymentMode === 'client_only'
                      ? t('manage.webAccessDescRemote')
                      : t('manage.webAccessDescLocal')}
                  </p>
                </div>
                <label className="tools-toggle shrink-0">
                  <input
                    type="checkbox"
                    checked={webAccessEnabled}
                    disabled={saving}
                    onChange={(e) => handleToggleWebAccess(e.target.checked)}
                    className="sr-only peer"
                  />
                  <span className={`tools-toggle-track ${webAccessEnabled ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                </label>
              </div>
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-sm text-[var(--text-secondary)] font-medium">
                    <MessageCircle size={14} /> {t('manage.accessLink')}
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={webAccessEnabled && webAccessUrl ? webAccessUrl : t('manage.accessLinkPlaceholder')}
                      readOnly
                      className="min-w-0 flex-1 glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                    />
                    <button
                      onClick={handleCopyWebAccessUrl}
                      disabled={!webAccessEnabled || !webAccessUrl}
                      className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    >
                      <Copy size={14} /> {t('common.copy')}
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-dim)]">
                    {deploymentMode === 'client_only'
                      ? (remoteConnection?.host
                        ? t('manage.remoteNodeStatus', { name: `${remoteConnection.name || remoteConnection.host}:${remoteConnection.port}` })
                        : t('manage.configureRemoteFirst'))
                      : (webServerStatus?.running
                        ? t('manage.webServerRunningStatus', { port: webServerStatus.port })
                        : t('manage.webServerStoppedStatus'))}
                  </p>
                </div>
                <button
                  onClick={handleResetWebAccessToken}
                  disabled={saving || !webAccessToken}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  {t('manage.resetToken')}
                </button>
              </div>
            </div>
            <button onClick={handleSaveBasic} disabled={saving} className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        )}
        {tab === 'soul' && (
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Sparkles size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {lexicon.concepts.soulSetting}{t('manage.soulIntroLead', { entity: lexicon.entities.employee })}<strong className="text-[var(--text-primary)]">{t('manage.soulIntroHighlight')}</strong>{t('manage.soulIntroTail', { entity: lexicon.entities.employee })}
              </div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <textarea
                value={soulContent}
                onChange={(e) => setSoulContent(e.target.value)}
                className="w-full bg-transparent p-4 text-sm text-[var(--text-primary)] outline-none resize-none min-h-[300px] font-mono leading-relaxed"
                placeholder={t('manage.soulEditPlaceholder', { entity: lexicon.entities.employee, concept: lexicon.concepts.soul })}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSoulContent(soulOriginal)} className="glass-medium border border-[var(--border)] text-[var(--text-primary)] px-3.5 py-2 rounded-[var(--radius)] text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all">{t('manage.reset')}</button>
              <button onClick={handleSaveSoul} disabled={saving} className="bg-accent-gradient text-white border-none px-3.5 py-2 rounded-[var(--radius)] text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 transition-all">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? t('common.saving') : t('common.save')}</button>
            </div>
          </div>
        )}
        {tab === 'memory' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Brain size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('manage.memoryBuiltinDesc')}
              </div>
              <button
                onClick={loadMemory}
                disabled={memoryLoading}
                className="ml-auto flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
              >
                {memoryLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                {t('common.refresh')}
              </button>
            </div>

            {hasExternalMemoryProvider && (
              <div className="glass-medium border border-[rgba(245,158,11,0.35)] bg-[rgba(245,158,11,0.08)] rounded-[var(--radius-lg)] p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                  <Brain size={16} className="text-[var(--warning)]" />
                  {t('manage.externalMemoryProvider', { provider: memoryProvider })}
                </div>
                <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t('manage.externalMemoryDesc')}
                </p>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                <div className="text-xs text-[var(--text-dim)] mb-1">MEMORY.md</div>
                <div className="text-xl font-semibold text-[var(--text-primary)]">{t('manage.memoryEntryCount', { count: memoryData?.memory.length || 0 })}</div>
                <div className="mt-1 text-xs text-[var(--text-dim)]">{t('manage.charLimit', { current: memoryData?.memoryCharCount || 0, limit: memoryData?.memoryCharLimit || 12200 })}</div>
              </div>
              <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                <div className="text-xs text-[var(--text-dim)] mb-1">USER.md</div>
                <div className="text-xl font-semibold text-[var(--text-primary)]">{t('manage.charCount', { count: memoryData?.userCharCount || 0 })}</div>
                <div className="mt-1 text-xs text-[var(--text-dim)]">{t('manage.userCharLimitLabel', { limit: memoryData?.userCharLimit || 5375 })}</div>
              </div>
            </div>

            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
              <label className="mb-2 block text-sm font-medium text-[var(--text-primary)]">{t('manage.addToMemory')}</label>
              <textarea
                value={newMemoryContent}
                onChange={(e) => setNewMemoryContent(e.target.value)}
                placeholder={t('manage.memoryInputPlaceholder')}
                className="min-h-[96px] w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
              />
              <div className="mt-3 flex justify-end">
                <button
                  onClick={handleAddMemory}
                  disabled={memorySaving || !newMemoryContent.trim()}
                  className="flex items-center gap-1.5 rounded-[var(--radius)] bg-accent-gradient px-3.5 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                >
                  {memorySaving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {t('manage.addMemory')}
                </button>
              </div>
            </div>

            {memoryLoading ? (
              <div className="flex items-center justify-center py-12 text-[var(--text-dim)]">
                <Loader2 size={18} className="animate-spin" />
              </div>
            ) : (
              <>
                {(memoryData?.memory.length || 0) > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.longTermMemoryList')}</div>
                    {memoryData!.memory.map((entry, i) => (
                      <div key={entry.index ?? i} className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-xs text-[var(--text-dim)]">#{entry.index ?? i}</span>
                          <Popconfirm title={t('manage.confirmDeleteMemory')} onConfirm={() => handleDeleteMemory(entry.index ?? i)}>
                            <button
                              disabled={memorySaving}
                              className="flex items-center gap-1 rounded-[var(--radius)] border border-[rgba(239,68,68,0.2)] px-2.5 py-1 text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] disabled:opacity-40"
                            >
                              <Trash2 size={12} /> {t('common.delete')}
                            </button>
                          </Popconfirm>
                        </div>
                        <pre className="max-h-[220px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{entry.content}</pre>
                      </div>
                    ))}
                  </div>
                )}

                {memoryData?.user && (
                  <div>
                    <div className="mb-2 text-sm font-semibold text-[var(--text-primary)]">{t('manage.userProfile')}</div>
                    <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                      <pre className="max-h-[260px] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">{memoryData.user}</pre>
                    </div>
                  </div>
                )}

                {(memoryData?.memory.length || 0) === 0 && !memoryData?.user && (
                  <div className="py-12 text-center text-sm text-[var(--text-dim)]">{t('manage.noBuiltinMemory')}</div>
                )}
              </>
            )}
          </div>
        )}
        {tab === 'config' && (
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Wrench size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('manage.configDescLead')}{lexicon.entities.employee}{t('manage.configDescMiddle')}<strong className="text-[var(--text-primary)]">{t('manage.configDescHighlight')}</strong>{t('manage.configDescTail', { entity: lexicon.entities.employee })}
              </div>
            </div>
            {(() => {
              const groups: { name: string; fields: ConfigFieldDef[] }[] = []
              for (const f of agentConfigFields) {
                const g = groups.find(g => g.name === f.group)
                if (g) g.fields.push(f)
                else groups.push({ name: f.group, fields: [f] })
              }
              return groups.map(group => (
                <div key={group.name}>
                  <div className="text-xs font-semibold text-[var(--text-dim)] uppercase tracking-wider mb-2 px-1">{group.name}</div>
                  <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
                    {group.fields.map((field, i) => {
                      const rawValue = getNestedValue(configObj, field.key)
                      return (
                        <div key={field.key} className={`flex items-center gap-4 px-4 py-3.5 ${i > 0 ? 'border-t border-[var(--border)]' : ''}`}>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-[var(--text-primary)]">{field.label}</div>
                            <div className="text-xs text-[var(--text-dim)] mt-0.5">{field.desc}</div>
                          </div>
                          <div className="w-[200px] shrink-0 flex justify-end">
                            {field.type === 'toggle' ? (
                              <label className="tools-toggle" onClick={(e) => e.stopPropagation()}>
                                <input type="checkbox" checked={!!rawValue} onChange={(e) => updateConfigField(field.key, e.target.checked)} className="sr-only peer" />
                                <span className={`tools-toggle-track ${!!rawValue ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                              </label>
                            ) : field.type === 'select' ? (
                              <select
                                value={String(rawValue ?? '')}
                                onChange={(e) => updateConfigField(field.key, e.target.value)}
                                className="glass-medium border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] cursor-pointer"
                              >
                                <option value="">{t('manage.defaultOption')}</option>
                                {field.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </select>
                            ) : (
                              <input
                                type={field.type === 'number' ? 'number' : 'text'}
                                value={String(rawValue ?? '')}
                                onChange={(e) => {
                                  const v = e.target.value
                                  updateConfigField(field.key, v === '' ? '' : (field.type === 'number' ? Number(v) : v))
                                }}
                                placeholder={field.placeholder}
                                className="w-full glass-medium border border-[var(--border)] rounded-lg px-3 py-1.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
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
              <button onClick={() => setConfigObj(JSON.parse(JSON.stringify(configOriginal)))} className="glass-medium border border-[var(--border)] text-[var(--text-primary)] px-3.5 py-2 rounded-[var(--radius)] text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all">{t('manage.reset')}</button>
              <button onClick={handleSaveConfig} disabled={saving} className="bg-accent-gradient text-white border-none px-3.5 py-2 rounded-[var(--radius)] text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 transition-all">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? t('common.saving') : t('common.save')}</button>
            </div>
          </div>
        )}
        {tab === 'integrations' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Plug size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {t('manage.integrationsDescLead', { entity: lexicon.entities.employee })}
                {t('manage.integrationsDescTail', { entity: lexicon.entities.employee })}
              </div>
              {envLoading && <Loader2 size={16} className="animate-spin text-[var(--text-dim)] ml-auto shrink-0" />}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              <section className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.feishuBot')}</div>
                    <div className="text-xs text-[var(--text-dim)]">{t('manage.feishuBotDesc')}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">App ID</label>
                    <input
                      value={feishuAppId}
                      onChange={(e) => setFeishuAppId(e.target.value)}
                      placeholder="cli_a..."
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">App Secret</label>
                    <input
                      value={feishuAppSecret}
                      onChange={(e) => setFeishuAppSecret(e.target.value)}
                      type="password"
                      placeholder={hasSavedFeishuSecret ? t('manage.savedLeaveEmpty') : t('manage.enterAppSecret')}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('manage.defaultChannelId')}</label>
                    <input
                      value={feishuHomeChannel}
                      onChange={(e) => setFeishuHomeChannel(e.target.value)}
                      placeholder="oc_xxx / ou_xxx"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('manage.domain')}</label>
                      <select
                        value={feishuDomain}
                        onChange={(e) => setFeishuDomain(e.target.value)}
                        className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                      >
                        <option value="feishu">{t('chat.sourceFeishu')}</option>
                        <option value="larksuite">Lark</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('manage.connectionMode')}</label>
                      <select
                        value={feishuConnectionMode}
                        onChange={(e) => setFeishuConnectionMode(e.target.value)}
                        className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                      >
                        <option value="websocket">WebSocket</option>
                        <option value="webhook">Webhook</option>
                      </select>
                    </div>
                  </div>
                </div>
              </section>

              <section className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.weixinAccess')}</div>
                    <div className="text-xs text-[var(--text-dim)]">{t('manage.weixinAccessDesc')}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('manage.accountId')}</label>
                    <input
                      value={weixinAccountId}
                      onChange={(e) => setWeixinAccountId(e.target.value)}
                      placeholder={t('manage.weixinAccountPlaceholder')}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Token</label>
                    <input
                      value={weixinToken}
                      onChange={(e) => setWeixinToken(e.target.value)}
                      type="password"
                      placeholder={hasSavedWeixinToken ? t('manage.savedLeaveEmpty') : t('manage.enterToken')}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('manage.defaultReceiverId')}</label>
                    <input
                      value={weixinHomeChannel}
                      onChange={(e) => setWeixinHomeChannel(e.target.value)}
                      placeholder="wxid_xxx / filehelper / xxx@chatroom"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>
              </section>

              <section className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 rounded-xl bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center">
                    <MessageCircle size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{t('manage.dingtalkBot')}</div>
                    <div className="text-xs text-[var(--text-dim)]">{t('manage.dingtalkBotDesc')}</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Client ID / AppKey</label>
                    <input
                      value={dingtalkClientId}
                      onChange={(e) => setDingtalkClientId(e.target.value)}
                      placeholder={t('manage.dingtalkClientPlaceholder')}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Client Secret / AppSecret</label>
                    <input
                      value={dingtalkClientSecret}
                      onChange={(e) => setDingtalkClientSecret(e.target.value)}
                      type="password"
                      placeholder={hasSavedDingtalkSecret ? t('manage.savedLeaveEmpty') : t('manage.enterClientSecret')}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">{t('manage.defaultChannelId')}</label>
                    <input
                      value={dingtalkHomeChannel}
                      onChange={(e) => setDingtalkHomeChannel(e.target.value)}
                      placeholder="cid_xxx / openConversationId"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[var(--text-dim)]">
                {t('manage.integrationSaveHint', { entity: lexicon.entities.employee })}
              </p>
              <button
                onClick={handleSaveIntegrations}
                disabled={saving}
                className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? t('common.saving') : t('manage.saveIntegration')}
              </button>
            </div>
          </div>
        )}
        {tab === 'tools' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Zap size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <span dangerouslySetInnerHTML={{ __html: t('manage.toolsDesc') }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ALL_TOOLS.map(t => {
                const meta = toolMeta[t]
                const enabled = tools.includes(t)
                return (
                  <div
                    key={t}
                    onClick={() => handleToggleTool(t, enabled)}
                    className={`glass-medium border rounded-[var(--radius-lg)] p-4 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] ${
                      enabled ? 'border-[rgba(124,106,239,0.2)] hover:border-[rgba(124,106,239,0.4)]' : 'border-[var(--border)] opacity-55 hover:opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${enabled ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'bg-[var(--bg-surface)] text-[var(--text-dim)]'}`}>
                          {meta?.icon || <Wrench size={18} />}
                        </div>
                        <span className={`text-sm font-medium ${enabled ? 'text-[var(--text-primary)]' : 'text-[var(--text-dim)]'}`}>{meta?.label || t}</span>
                      </div>
                      <label className="tools-toggle" onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={enabled} onChange={() => handleToggleTool(t, enabled)} className="sr-only peer" />
                        <span className={`tools-toggle-track ${enabled ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                      </label>
                    </div>
                    {meta && <div className="text-xs text-[var(--text-dim)] leading-relaxed">{meta.desc}</div>}
                  </div>
                )
              })}
            </div>
            {tools.filter(t => !ALL_TOOLS.includes(t)).length > 0 && (
              <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
              <div className="text-sm font-medium text-[var(--text-primary)] mb-3">{lexicon.concepts.otherEnabledTools}</div>
                <div className="flex flex-wrap gap-2">
                  {tools.filter(t => !ALL_TOOLS.includes(t)).map(t => (
                    <span key={t} className="inline-flex items-center gap-1.5 px-3 py-1.5 glass-medium rounded-xl text-[13px] text-[var(--text-primary)] border border-[var(--border)]">
                      {t}
                      <button onClick={() => handleToggleTool(t, true)} className="text-[var(--text-dim)] hover:text-[var(--danger)] cursor-pointer transition-colors"><X size={12} /></button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {tab === 'skills' && (
          <div className="flex flex-col gap-4 max-w-4xl">
            {/* Detail overlay */}
            {detailSkill && (
              <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                onClick={() => setDetailSkill(null)}
              >
                <div
                  className="glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.4)] animate-scale-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border)]">
                    <div>
                      <div className="text-lg font-semibold">{detailSkill.name}</div>
                      <div className="text-sm text-[var(--text-dim)]">{detailSkill.category}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isBundledSkill ? (
                        !(detailSkill as BundledSkill).installed && (
                          <button
                            onClick={() => handleInstallSkill(detailSkill.name)}
                            disabled={actionInProgress === detailSkill.name}
                            className="flex items-center gap-2 rounded-lg bg-accent-gradient px-3 py-2 text-sm text-white hover:opacity-90 transition-colors"
                          >
                            {actionInProgress === detailSkill.name ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Download size={14} />
                            )}
                            {t('manage.install')}
                          </button>
                        )
                      ) : (
                        <>
                          <button
                            onClick={() => handleToggleSkillEnabled(detailSkill as InstalledSkill, !(detailSkill as InstalledSkill).enabled)}
                            disabled={actionInProgress === (detailSkill as InstalledSkill).id}
                            className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] transition-colors"
                          >
                            {actionInProgress === (detailSkill as InstalledSkill).id && <Loader2 size={14} className="animate-spin" />}
                            {(detailSkill as InstalledSkill).enabled ? t('manage.disable') : t('manage.enable')}
                          </button>
                          <button
                            onClick={() => handleUninstallSkill((detailSkill as InstalledSkill).name)}
                            disabled={actionInProgress === detailSkill.name}
                            className="flex items-center gap-2 rounded-lg border border-[var(--danger)]/30 px-3 py-2 text-sm text-[var(--danger)] hover:bg-[var(--danger)]/10 transition-colors"
                          >
                            {actionInProgress === detailSkill.name ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Trash2 size={14} />
                            )}
                            {t('manage.uninstall')}
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => setDetailSkill(null)}
                        className="p-2 rounded-lg hover:bg-[var(--bg-hover)] transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>
                  </div>
                  <div className="p-6 overflow-y-auto max-h-[calc(80vh-88px)]">
                    {detailContent ? (
                      <div className="agent-markdown">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailContent}</ReactMarkdown>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-[var(--text-dim)]">
                        <div className="text-3xl mb-2 opacity-30">📄</div>
                        <p className="text-sm">{isBundledSkill ? t('manage.skillPreviewUnavailable') : t('manage.skillLoadFailed')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Puzzle size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                <span dangerouslySetInnerHTML={{ __html: t('manage.skillsDesc') }} />
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] gap-1">
              <button
                onClick={() => setSkillTab('installed')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${skillTab === 'installed' ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-primary)]'}`}
              >
                {t('manage.skillInstalledTab', { count: skills.length })}
              </button>
              <button
                onClick={() => setSkillTab('browse')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${skillTab === 'browse' ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-primary)]'}`}
              >
                {t('manage.skillBrowseTab', { count: bundledSkills.length })}
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
              <input
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder={skillTab === 'installed' ? t('manage.searchInstalledSkills') : t('manage.searchSkillLibrary')}
                className="w-full glass-medium border border-[var(--border)] rounded-lg pl-9 pr-3 py-2.5 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              />
              {skillSearch && (
                <button
                  onClick={() => setSkillSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-[var(--bg-hover)] rounded"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Category filters for browse */}
            {skillTab === 'browse' && Array.from(new Set(bundledSkills.map(s => s.category))).length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setSkillCategoryFilter(null)}
                  className={`px-3 py-1.5 rounded-full text-sm transition-colors ${skillCategoryFilter === null ? 'bg-[var(--accent)] text-white' : 'glass-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                >
                  {t('manage.all')}
                </button>
                {Array.from(new Set(bundledSkills.map(s => s.category))).sort().map(cat => (
                  <button
                    key={cat}
                    onClick={() => setSkillCategoryFilter(skillCategoryFilter === cat ? null : cat)}
                    className={`px-3 py-1.5 rounded-full text-sm transition-colors ${skillCategoryFilter === cat ? 'bg-[var(--accent)] text-white' : 'glass-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Installed skills */}
            {skillTab === 'installed' && (
              skills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {skills.filter(s => !skillSearch || s.name.toLowerCase().includes(skillSearch.toLowerCase()) || s.description.toLowerCase().includes(skillSearch.toLowerCase())).map(s => (
                    <div
                      key={`${s.category}/${s.name}`}
                      className={`glass-medium border rounded-[var(--radius-lg)] p-4 cursor-pointer transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)] hover:border-[rgba(124,106,239,0.3)] ${s.enabled ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'}`}
                      onClick={() => handleViewSkillDetail(s)}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2.5">
                          <div className="w-9 h-9 rounded-lg bg-[rgba(34,197,94,0.1)] text-[var(--success)] flex items-center justify-center">
                            <Puzzle size={18} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-[var(--text-primary)] truncate">{s.name}</div>
                            <div className="text-xs text-[var(--text-dim)]">{s.category}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] px-2.5 py-0.5 rounded-xl font-medium ${s.enabled ? 'bg-[rgba(34,197,94,0.1)] text-[var(--success)]' : 'bg-[var(--bg-surface)] text-[var(--text-dim)]'}`}>
                            {s.enabled ? t('manage.skillEnabled') : t('manage.skillDisabled')}
                          </span>
                          <label className="tools-toggle" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={s.enabled}
                              disabled={actionInProgress === s.id}
                              onChange={(e) => handleToggleSkillEnabled(s, e.target.checked)}
                              className="sr-only peer"
                            />
                            <span className={`tools-toggle-track ${s.enabled ? 'bg-[var(--accent)] border-[var(--accent)] after:bg-white' : ''}`} />
                          </label>
                        </div>
                      </div>
                      {s.description && (
                        <div className="text-xs text-[var(--text-dim)] leading-relaxed mt-2">{s.description}</div>
                      )}
                      <div className="flex items-center gap-2 mt-3 text-[11px] text-[var(--text-dim)]">
                        <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">{s.type}</span>
                        {s.stats && <span>{t('manage.usesCount', { count: s.stats.uses, xp: s.stats.xp })}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--text-dim)]">
                  <div className="text-4xl mb-3 opacity-30">🧩</div>
                  <p className="text-sm">{t('manage.noInstalledSkills')}</p>
                  <p className="text-xs mt-1 text-[var(--text-dim)]/70">{t('manage.browseSkillsHint')}</p>
                </div>
              )
            )}

            {/* Browse skills */}
            {skillTab === 'browse' && (
              bundledSkills.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(() => {
                    const installedNames = new Set(skills.map(s => s.name.toLowerCase()));
                    let filtered = bundledSkills;
                    if (skillSearch) {
                      const q = skillSearch.toLowerCase();
                      filtered = filtered.filter(s => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
                    }
                    if (skillCategoryFilter) {
                      filtered = filtered.filter(s => s.category === skillCategoryFilter);
                    }
                    return filtered.map(s => {
                      const isInstalled = installedNames.has(s.name.toLowerCase());
                      const isActioning = actionInProgress === s.name;
                      return (
                        <div key={`${s.category}/${s.name}`} className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.1)]">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-lg bg-[var(--accent-glow)] text-[var(--accent)] flex items-center justify-center">
                                <Puzzle size={18} />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium text-[var(--text-primary)] truncate">{s.name}</div>
                                <div className="text-xs text-[var(--text-dim)]">{s.category}</div>
                              </div>
                            </div>
                            {isInstalled ? (
                              <span className="text-[11px] px-2.5 py-0.5 rounded-xl bg-[rgba(34,197,94,0.1)] text-[var(--success)] font-medium shrink-0">{t('manage.skillInstalled')}</span>
                            ) : (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleInstallSkill(s.name) }}
                                disabled={isActioning}
                                className="flex items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-1.5 text-xs text-white cursor-pointer hover:opacity-90 disabled:opacity-50 transition-all shrink-0"
                              >
                                {isActioning ? (
                                  <Loader2 size={12} className="animate-spin" />
                                ) : (
                                  <Download size={12} />
                                )}
                                {t('manage.install')}
                              </button>
                            )}
                          </div>
                          {s.description && (
                            <div className="text-xs text-[var(--text-dim)] leading-relaxed mt-2">{s.description}</div>
                          )}
                          <div className="flex items-center gap-2 mt-3 text-[11px] text-[var(--text-dim)]">
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">{s.type}</span>
                            <span>{s.source}</span>
                            {s.requiredTools && s.requiredTools.length > 0 && <span>{t('manage.requiresTools', { tools: s.requiredTools.join(', ') })}</span>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--text-dim)]">
                  <div className="text-4xl mb-3 opacity-30">📚</div>
                  <p className="text-sm">{t('manage.noAvailableSkills')}</p>
                </div>
              )
            )}

            {/* Custom URL install */}
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3 flex items-center gap-2">
              <input
                value={skillInstallUrl}
                onChange={(e) => setSkillInstallUrl(e.target.value)}
                placeholder={t('manage.skillInstallPlaceholder')}
                className="flex-1 glass-medium border border-[var(--border)] rounded-lg py-2 px-3 text-[13px] text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
                onKeyDown={(e) => { if (e.key === 'Enter') handleInstallSkillFromUrl() }}
              />
              <button
                onClick={handleInstallSkillFromUrl}
                disabled={!skillInstallUrl.trim() || actionInProgress !== null}
                className="flex items-center gap-1.5 rounded-lg bg-accent-gradient px-3 py-2 text-sm text-white cursor-pointer hover:opacity-90 disabled:opacity-50 transition-all"
              >
                {actionInProgress !== null ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
                {t('manage.install')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
