import { useState, useEffect, useCallback, useRef } from 'react'
import { usePlatform } from '../../hooks/usePlatform'
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
  KeyRound
} from 'lucide-react'
import type { DesktopWebServerStatus, EmployeeInfo, InstalledSkill, BundledSkill } from '../../../../preload/index'
import { showToast } from '../../App'
import PetPicker from '../../components/PetPicker'
import Popconfirm from '../../components/Popconfirm'
import { useTheme } from '../../components/ThemeProvider'
import {
  mapStatus,
  statusText,
  statusColor,
  statusDotClass,
  AVATARS,
  TOOL_META,
  ALL_TOOLS,
  AGENT_CONFIG_FIELDS,
  EMPLOYEE_NAME_RE,
  getNestedValue,
  setNestedValue,
  type ConfigFieldDef
} from '../../shared/employee-shared'

type Section = 'list' | 'create' | 'edit'

export default function Manage(): React.ReactElement {
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
      showToast('正在唤醒...')
      setTimeout(loadEmployees, 2000)
    } catch { showToast('唤醒失败', 'error') }
  }

  const handleSleep = async (name: string): Promise<void> => {
    try {
      await window.hermesAPI.sleepEmployee(name)
      showToast('已休眠')
      setTimeout(loadEmployees, 1000)
    } catch { showToast('休眠失败', 'error') }
  }

  const handleRestart = async (name: string): Promise<void> => {
    try {
      await window.hermesAPI.restartEmployee(name)
      showToast('正在重启...')
      setTimeout(loadEmployees, 3000)
    } catch { showToast('重启失败', 'error') }
  }

  const handleDelete = async (name: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.deleteEmployee(name)
      if (result.success) {
        showToast('已删除')
        setEditingEmployee(null)
        setSection('list')
        loadEmployees()
      } else {
        showToast(result.error || '删除失败', 'error')
      }
    } catch { showToast('删除失败', 'error') }
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
              <p className="text-sm">{lexicon.entities.selectEmployee}查看详情，或{lexicon.entities.createEmployee}</p>
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
  const [name, setName] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState('')
  const [avatar, setAvatar] = useState('🧑‍💼')
  const [soul, setSoul] = useState('')
  const [petSlug, setPetSlug] = useState('')
  const [creating, setCreating] = useState(false)
  const [showAvatarPicker, setShowAvatarPicker] = useState(false)
  const [showPetPicker, setShowPetPicker] = useState(false)
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

  const handleCreate = async (): Promise<void> => {
    if (!name.trim()) { showToast(`请输入${lexicon.entities.employee}名称`, 'error'); return }
    if (!EMPLOYEE_NAME_RE.test(name.trim())) { showToast(`${lexicon.entities.employee}名称只能包含小写字母、数字、下划线和连字符`, 'error'); return }
    setCreating(true)
    try {
      const result = await window.hermesAPI.createEmployee(name.trim(), {
        displayName: displayName.trim() || undefined,
        role: role.trim() || undefined,
        avatar: avatar || undefined,
        soul: soul.trim() || undefined,
        petSlug: petSlug || undefined,
        wakeUp: true
      })
      if (result.success) {
        showToast('创建成功')
        onCreated()
      } else {
        showToast(result.error || '创建失败', 'error')
      }
    } catch { showToast('创建失败', 'error') }
    finally { setCreating(false) }
  }

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">{lexicon.entities.createEmployee}</h3>
      <div className="space-y-5 glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-5">
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
              <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">名称 *（英文，用于标识）</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例如: assistant"
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              />
            </div>
            <div>
              <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">显示名称</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="例如: 小助手"
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">角色</label>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            placeholder="例如: AI助手、数据分析师、内容创作者"
            className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <div>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><Sparkles size={14} /> {lexicon.concepts.soulSetting}</label>
          <textarea
            value={soul}
            onChange={(e) => setSoul(e.target.value)}
            placeholder={`描述这个${lexicon.entities.virtualEmployee}的性格、能力和行为准则...`}
            className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[120px] focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
          />
        </div>

        <div className="relative" ref={petPickerRef}>
          <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5">🐾 伙伴宠物</label>
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
              <span className="text-[var(--text-dim)]">点击选择宠物...</span>
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
          disabled={creating || !name.trim()}
          className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
          {creating ? '创建中...' : lexicon.entities.createEmployee}
        </button>
        <button
          onClick={onCancel}
          className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
        >
          取消
        </button>
      </div>
    </div>
  )
}

type EditTab = 'basic' | 'soul' | 'config' | 'integrations' | 'tools' | 'skills'

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

  useEffect(() => {
    const ename = employee.name
    setDisplayName(employee.displayName || '')
    setRole(employee.role || '')
    setAvatar(employee.avatar || '🧑‍💼')
    setPetSlug(employee.petSlug || '')
    setWebAccessEnabled(employee.webAccessEnabled === true)
    setWebAccessToken(employee.webAccessToken || '')
    window.hermesAPI.getDesktopWebServerStatus().then(setWebServerStatus).catch(() => setWebServerStatus(null))
    window.hermesAPI.getEmployeeSoul(ename).then((s) => { setSoulContent(s || ''); setSoulOriginal(s || '') }).catch(() => {})
    window.hermesAPI.getEmployeeTools(ename).then(setTools).catch(() => {})
    loadSkills()
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
  }, [employee, loadSkills])

  const webAccessUrl = webAccessToken
    ? `${webServerStatus?.url || 'http://127.0.0.1:8787/embed'}?agent=${encodeURIComponent(employee.name)}&token=${encodeURIComponent(webAccessToken)}`
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
      showToast('基本信息已保存')
      onRefresh()
    } catch { showToast('保存失败', 'error') }
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
        showToast(result.error || 'Web 访问设置失败', 'error')
        return
      }
      await refreshEmployeeWebAccess()
      showToast(enabled ? '已开启 Web 访问' : '已关闭 Web 访问')
      onRefresh()
    } catch {
      showToast('Web 访问设置失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleResetWebAccessToken = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await window.hermesAPI.resetEmployeeWebToken(employee.name)
      if (!result.success) {
        showToast(result.error || '重置 Token 失败', 'error')
        return
      }
      setWebAccessToken(result.token || '')
      showToast('员工 Web Token 已重置')
      onRefresh()
    } catch {
      showToast('重置 Token 失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleCopyWebAccessUrl = async (): Promise<void> => {
    if (!webAccessEnabled || !webAccessUrl) {
      showToast('请先开启 Web 访问', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(webAccessUrl)
      showToast('员工访问链接已复制')
    } catch {
      showToast('复制失败', 'error')
    }
  }

  const handleSaveSoul = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.hermesAPI.setEmployeeSoul(employee.name, soulContent)
      setSoulOriginal(soulContent)
      showToast(`${lexicon.concepts.soulSetting}已保存`)
    } catch { showToast('保存失败', 'error') }
    finally { setSaving(false) }
  }

  const handleSaveConfig = async (): Promise<void> => {
    setSaving(true)
    try {
      await window.hermesAPI.setEmployeeConfig(employee.name, configObj)
      setConfigOriginal(JSON.parse(JSON.stringify(configObj)))
      showToast('配置已保存')
    } catch { showToast('保存失败', 'error') }
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
        showToast(result.error || '保存集成配置失败', 'error')
        return
      }
      if (feishuAppSecret.trim()) setHasSavedFeishuSecret(true)
      if (weixinToken.trim()) setHasSavedWeixinToken(true)
      if (dingtalkClientSecret.trim()) setHasSavedDingtalkSecret(true)
      showToast('集成配置已保存，正在重启使其生效')
      await window.hermesAPI.restartEmployee(employee.name).catch(() => {})
      onRefresh()
    } catch {
      showToast('保存集成配置失败', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleToggleTool = async (toolKey: string, enabled: boolean): Promise<void> => {
    try {
      await window.hermesAPI.toggleTool(employee.name, toolKey, !enabled)
      setTools(prev => enabled ? prev.filter(t => t !== toolKey) : [...prev, toolKey])
      showToast(enabled ? `已禁用 ${TOOL_META[toolKey]?.label || toolKey}，新会话生效` : `已启用 ${TOOL_META[toolKey]?.label || toolKey}，新会话生效`, 'info')
    } catch { showToast(`切换${lexicon.concepts.tools}失败`, 'error') }
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
        showToast(`${lexicon.concepts.skills}安装成功`)
        setSkillInstallUrl('')
        await loadSkills()
      } else {
        showToast(result.error || '安装失败', 'error')
      }
    } catch { 
      showToast('安装失败', 'error') 
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
      showToast(`${lexicon.concepts.skills}已移除`)
    } catch { showToast('移除失败', 'error') }
    finally {
      setActionInProgress(null)
    }
  }

  const handleToggleSkillEnabled = async (skill: InstalledSkill, enabled: boolean): Promise<void> => {
    setActionInProgress(skill.id)
    try {
      const result = await window.hermesAPI.setSkillEnabled(skill.id, enabled, employee.name)
      if (!result.success) {
        showToast(result.error || '切换技能状态失败', 'error')
        return
      }
      await loadSkills()
      showToast(enabled ? '技能已启用' : '技能已停用', 'info')
    } catch {
      showToast('切换技能状态失败', 'error')
    } finally {
      setActionInProgress(null)
    }
  }

  const updateConfigField = (key: string, value: unknown): void => {
    setConfigObj(prev => setNestedValue(prev, key, value))
  }

  const tabs: { id: EditTab; label: string; icon: React.ReactElement }[] = [
    { id: 'basic', label: '基本信息', icon: <UserPlus size={14} /> },
    { id: 'soul', label: lexicon.concepts.soul, icon: <Sparkles size={14} /> },
    { id: 'config', label: lexicon.concepts.config, icon: <Wrench size={14} /> },
    { id: 'integrations', label: '集成', icon: <Plug size={14} /> },
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
            <span>{employee.model || '默认模型'}</span>
            <span className="text-[var(--border)]">·</span>
            <span style={{ color: statusColor(empStatus) }}>{statusText(empStatus)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {empStatus === 'awake' ? (
            <button onClick={onSleep} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all"><Moon size={14} /> 休眠</button>
          ) : (
            <button onClick={onWakeUp} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(34,197,94,0.3)] bg-[rgba(34,197,94,0.08)] px-3 py-1.5 text-sm text-[var(--success)] hover:bg-[rgba(34,197,94,0.15)] cursor-pointer transition-all"><Power size={14} /> 唤醒</button>
          )}
          <button onClick={onRestart} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all"><RefreshCw size={14} /> 重启</button>
          <Popconfirm title={lexicon.entities.deleteEmployeeConfirm} onConfirm={onDelete}>
            <button className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(239,68,68,0.2)] px-3 py-1.5 text-sm text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)] cursor-pointer transition-all"><Trash2 size={14} /> 删除</button>
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
                <span className="text-sm font-semibold text-[var(--text-primary)]">基本信息</span>
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
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">显示名称</label>
                    <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]" />
                  </div>
                  <div>
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">角色</label>
                    <input value={role} onChange={(e) => setRole(e.target.value)} placeholder="例如: AI助手、数据分析师" className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]" />
                  </div>
                  <div className="relative" ref={petPickerRef}>
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5">🐾 伙伴宠物</label>
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
                        <span className="text-[var(--text-dim)]">点击选择宠物...</span>
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
                    <span className="text-sm font-semibold text-[var(--text-primary)]">Web 访问</span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">
                    开启后，这个员工可以通过内置 Web 服务的嵌入页面访问。
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
                    <MessageCircle size={14} /> 访问链接
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      value={webAccessEnabled && webAccessUrl ? webAccessUrl : '开启 Web 访问后自动生成'}
                      readOnly
                      className="min-w-0 flex-1 glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none"
                    />
                    <button
                      onClick={handleCopyWebAccessUrl}
                      disabled={!webAccessEnabled || !webAccessUrl}
                      className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                    >
                      <Copy size={14} /> 复制
                    </button>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--text-dim)]">
                    Web 服务状态：{webServerStatus?.running ? `运行中，端口 ${webServerStatus.port}` : '未运行，请先在设置中开启'}
                  </p>
                </div>
                <button
                  onClick={handleResetWebAccessToken}
                  disabled={saving || !webAccessToken}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
                  重置 Token
                </button>
              </div>
            </div>
            <button onClick={handleSaveBasic} disabled={saving} className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        )}
        {tab === 'soul' && (
          <div className="flex flex-col gap-3 max-w-2xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Sparkles size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                {lexicon.concepts.soulSetting}定义了这个{lexicon.entities.employee}的<strong className="text-[var(--text-primary)]">性格、能力和行为准则</strong>。
                它就像一个人的内心世界，决定了{lexicon.entities.employee}如何思考和回应。
              </div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] overflow-hidden">
              <textarea
                value={soulContent}
                onChange={(e) => setSoulContent(e.target.value)}
                className="w-full bg-transparent p-4 text-sm text-[var(--text-primary)] outline-none resize-none min-h-[300px] font-mono leading-relaxed"
                placeholder={`描述这个${lexicon.entities.employee}的${lexicon.concepts.soul}...`}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setSoulContent(soulOriginal)} className="glass-medium border border-[var(--border)] text-[var(--text-primary)] px-3.5 py-2 rounded-[var(--radius)] text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all">重置</button>
              <button onClick={handleSaveSoul} disabled={saving} className="bg-accent-gradient text-white border-none px-3.5 py-2 rounded-[var(--radius)] text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 transition-all">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        )}
        {tab === 'config' && (
          <div className="flex flex-col gap-4 max-w-2xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Wrench size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                配置项控制{lexicon.entities.employee}的<strong className="text-[var(--text-primary)]">模型参数和对话行为</strong>。记忆、压缩、终端等运行参数请在「设置 → 运行参数」中统一配置。
              </div>
            </div>
            {(() => {
              const groups: { name: string; fields: ConfigFieldDef[] }[] = []
              for (const f of AGENT_CONFIG_FIELDS) {
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
                                <option value="">默认</option>
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
              <button onClick={() => setConfigObj(JSON.parse(JSON.stringify(configOriginal)))} className="glass-medium border border-[var(--border)] text-[var(--text-primary)] px-3.5 py-2 rounded-[var(--radius)] text-sm cursor-pointer hover:bg-[var(--bg-hover)] transition-all">重置</button>
              <button onClick={handleSaveConfig} disabled={saving} className="bg-accent-gradient text-white border-none px-3.5 py-2 rounded-[var(--radius)] text-sm font-semibold cursor-pointer hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5 transition-all">{saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        )}
        {tab === 'integrations' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Plug size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                集成配置属于当前{lexicon.entities.employee}。飞书、微信和钉钉的机器人凭据、默认接收会话会保存在这个 profile 里，
                因此可以做到一个{lexicon.entities.employee}对应一个飞书机器人。
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
                    <div className="text-sm font-semibold text-[var(--text-primary)]">飞书机器人</div>
                    <div className="text-xs text-[var(--text-dim)]">用于飞书/Lark 消息接入和日程结果外发</div>
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
                      placeholder={hasSavedFeishuSecret ? '已保存，留空保持不变' : '请输入 App Secret'}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">默认接收会话 ID</label>
                    <input
                      value={feishuHomeChannel}
                      onChange={(e) => setFeishuHomeChannel(e.target.value)}
                      placeholder="oc_xxx / ou_xxx"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">域名</label>
                      <select
                        value={feishuDomain}
                        onChange={(e) => setFeishuDomain(e.target.value)}
                        className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                      >
                        <option value="feishu">飞书</option>
                        <option value="larksuite">Lark</option>
                      </select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">连接模式</label>
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
                    <div className="text-sm font-semibold text-[var(--text-primary)]">微信接入</div>
                    <div className="text-xs text-[var(--text-dim)]">用于微信消息接入和日程结果外发</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">账号 ID</label>
                    <input
                      value={weixinAccountId}
                      onChange={(e) => setWeixinAccountId(e.target.value)}
                      placeholder="可选，按接入服务要求填写"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Token</label>
                    <input
                      value={weixinToken}
                      onChange={(e) => setWeixinToken(e.target.value)}
                      type="password"
                      placeholder={hasSavedWeixinToken ? '已保存，留空保持不变' : '请输入 Token'}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">默认接收对象 ID</label>
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
                    <div className="text-sm font-semibold text-[var(--text-primary)]">钉钉机器人</div>
                    <div className="text-xs text-[var(--text-dim)]">用于钉钉消息接入和日程结果外发</div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Client ID / AppKey</label>
                    <input
                      value={dingtalkClientId}
                      onChange={(e) => setDingtalkClientId(e.target.value)}
                      placeholder="从钉钉开发者控制台获取"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">Client Secret / AppSecret</label>
                    <input
                      value={dingtalkClientSecret}
                      onChange={(e) => setDingtalkClientSecret(e.target.value)}
                      type="password"
                      placeholder={hasSavedDingtalkSecret ? '已保存，留空保持不变' : '请输入 Client Secret'}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]">默认接收会话 ID</label>
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
                保存后会重启当前{lexicon.entities.employee}，让后台网关和日程调度读取最新配置。
              </p>
              <button
                onClick={handleSaveIntegrations}
                disabled={saving}
                className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 cursor-pointer transition-all"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {saving ? '保存中...' : '保存集成'}
              </button>
            </div>
          </div>
        )}
        {tab === 'tools' && (
          <div className="flex flex-col gap-4 max-w-3xl">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Zap size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                工具是员工可以使用的<strong className="text-[var(--text-primary)]">能力</strong>，
                就像一个人掌握的技能工具箱，启用越多能力越强。
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {ALL_TOOLS.map(t => {
                const meta = TOOL_META[t]
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
              <div className="text-sm font-medium text-[var(--text-primary)] mb-3">其他已启用工具</div>
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
                            安装
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
                            {(detailSkill as InstalledSkill).enabled ? '停用' : '启用'}
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
                            移除
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
                        <p className="text-sm">{isBundledSkill ? '技能预览不可用，请安装后查看' : '技能说明加载失败'}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
              <Puzzle size={18} className="text-[var(--accent)] shrink-0 mt-0.5" />
              <div className="text-sm text-[var(--text-secondary)] leading-relaxed">
                技能是员工可以学习的<strong className="text-[var(--text-primary)]">专业知识包</strong>，
                就像一个人通过学习获得的新能力。
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border)] gap-1">
              <button
                onClick={() => setSkillTab('installed')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${skillTab === 'installed' ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-primary)]'}`}
              >
                已安装 ({skills.length})
              </button>
              <button
                onClick={() => setSkillTab('browse')}
                className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${skillTab === 'browse' ? 'text-[var(--accent)] border-[var(--accent)]' : 'text-[var(--text-dim)] border-transparent hover:text-[var(--text-primary)]'}`}
              >
                技能库 ({bundledSkills.length})
              </button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)]" />
              <input
                value={skillSearch}
                onChange={(e) => setSkillSearch(e.target.value)}
                placeholder={skillTab === 'installed' ? '搜索已安装技能...' : '搜索技能库...'}
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
                  全部
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
                            {s.enabled ? '已启用' : '已停用'}
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
                        {s.stats && <span>{s.stats.uses} 次使用 · XP {s.stats.xp}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--text-dim)]">
                  <div className="text-4xl mb-3 opacity-30">🧩</div>
                  <p className="text-sm">暂无已安装技能</p>
                  <p className="text-xs mt-1 text-[var(--text-dim)]/70">切换到技能库浏览可用技能</p>
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
                              <span className="text-[11px] px-2.5 py-0.5 rounded-xl bg-[rgba(34,197,94,0.1)] text-[var(--success)] font-medium shrink-0">已安装</span>
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
                                安装
                              </button>
                            )}
                          </div>
                          {s.description && (
                            <div className="text-xs text-[var(--text-dim)] leading-relaxed mt-2">{s.description}</div>
                          )}
                          <div className="flex items-center gap-2 mt-3 text-[11px] text-[var(--text-dim)]">
                            <span className="px-2 py-0.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">{s.type}</span>
                            <span>{s.source}</span>
                            {s.requiredTools && s.requiredTools.length > 0 && <span>需要 {s.requiredTools.join(', ')}</span>}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              ) : (
                <div className="text-center py-12 text-[var(--text-dim)]">
                  <div className="text-4xl mb-3 opacity-30">📚</div>
                  <p className="text-sm">暂无可用技能</p>
                </div>
              )
            )}

            {/* Custom URL install */}
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3 flex items-center gap-2">
              <input
                value={skillInstallUrl}
                onChange={(e) => setSkillInstallUrl(e.target.value)}
                placeholder="输入技能 URL 或名称安装..."
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
                安装
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
