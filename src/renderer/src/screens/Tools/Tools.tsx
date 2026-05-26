import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { translateError } from '../../../../shared/i18n'
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  Server,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  X,
} from 'lucide-react'
import type { EmployeeInfo, McpServerInfo } from '../../../../preload/index'
import { ALL_TOOLS, useEmployeeShared } from '../../shared/employee-shared'
import { showToast } from '../../App'
import Popconfirm from '../../components/Popconfirm'

type Tab = 'builtin' | 'mcp'

const getRiskMeta = (t: TFunction): Record<string, { label: string; level: string; desc: string }> => ({
  terminal: { label: t('tools.riskHigh'), level: 'high', desc: t('tools.riskTerminal') },
  file: { label: t('tools.riskHigh'), level: 'high', desc: t('tools.riskFile') },
  browser: { label: t('tools.riskMedium'), level: 'medium', desc: t('tools.riskBrowser') },
  code_execution: { label: t('tools.riskMedium'), level: 'medium', desc: t('tools.riskCode') },
  web: { label: t('tools.riskLow'), level: 'low', desc: t('tools.riskWeb') },
  memory: { label: t('tools.riskMedium'), level: 'medium', desc: t('tools.riskMemory') },
  cronjob: { label: t('tools.riskMedium'), level: 'medium', desc: t('tools.riskCronjob') },
})

type McpForm = {
  name: string
  transport: string
  command: string
  argsText: string
  url: string
  envText: string
  headersText: string
  timeout: string
  connectTimeout: string
  allowedProfiles: string[]
}

const emptyForm: McpForm = {
  name: '',
  transport: 'stdio',
  command: '',
  argsText: '',
  url: '',
  envText: '',
  headersText: '',
  timeout: '120',
  connectTimeout: '60',
  allowedProfiles: [],
}

const getMcpTemplates = (t: TFunction) => [
  {
    id: 'database-toolbox',
    title: t('tools.templateDbTitle'),
    desc: t('tools.templateDbDesc'),
    form: {
      name: 'db_toolbox',
      transport: 'stdio',
      command: 'toolbox',
      argsText: '--tools-file\n./tools.yaml',
      url: '',
      envText: '',
      headersText: '',
      timeout: '180',
      connectTimeout: '60',
      allowedProfiles: [],
    },
  },
  {
    id: 'local-command',
    title: t('tools.templateLocalTitle'),
    desc: t('tools.templateLocalDesc'),
    form: {
      name: 'my_mcp',
      transport: 'stdio',
      command: 'npx',
      argsText: '-y\n<package-name>',
      url: '',
      envText: '',
      headersText: '',
      timeout: '120',
      connectTimeout: '60',
      allowedProfiles: [],
    },
  },
  {
    id: 'http-server',
    title: t('tools.templateHttpTitle'),
    desc: t('tools.templateHttpDesc'),
    form: {
      name: 'remote_mcp',
      transport: 'http',
      command: '',
      argsText: '',
      url: 'http://127.0.0.1:8000/mcp',
      envText: '',
      headersText: '',
      timeout: '120',
      connectTimeout: '60',
      allowedProfiles: [],
    },
  },
]

function parseKeyValueText(text: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim()
    if (key && value) result[key] = value
  }
  return result
}

function recordToText(record?: Record<string, string>): string {
  return Object.entries(record || {}).map(([key, value]) => `${key}=${value}`).join('\n')
}

function serverToForm(server: McpServerInfo): McpForm {
  return {
    name: server.name,
    transport: server.transport || 'stdio',
    command: server.command || '',
    argsText: (server.args || []).join('\n'),
    url: server.url || '',
    envText: recordToText(server.env),
    headersText: recordToText(server.headers),
    timeout: String(server.timeout || 120),
    connectTimeout: String(server.connect_timeout || 60),
    allowedProfiles: server.allowedProfiles || [],
  }
}

function transportLabel(value: string): string {
  if (value === 'stdio') return 'stdio'
  if (value === 'sse') return 'SSE'
  return 'HTTP'
}

export default function Tools(): React.ReactElement {
  const { t } = useTranslation()
  const { toolMeta } = useEmployeeShared()
  const riskMeta = useMemo(() => getRiskMeta(t), [t])
  const mcpTemplates = useMemo(() => getMcpTemplates(t), [t])
  const [tab, setTab] = useState<Tab>('builtin')
  const [servers, setServers] = useState<McpServerInfo[]>([])
  const [employees, setEmployees] = useState<EmployeeInfo[]>([])
  const [configPath, setConfigPath] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testingName, setTestingName] = useState<string | null>(null)
  const [testOutput, setTestOutput] = useState<Record<string, string>>({})
  const [form, setForm] = useState(emptyForm)
  const [editingName, setEditingName] = useState<string | null>(null)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [aiDescription, setAiDescription] = useState('')
  const [parsing, setParsing] = useState(false)
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [formOpen, setFormOpen] = useState(false)

  const riskCounts = useMemo(() => {
    const counts = { high: 0, medium: 0, low: 0 }
    for (const key of ALL_TOOLS) {
      const level = riskMeta[key]?.level || 'low'
      counts[level as keyof typeof counts] += 1
    }
    return counts
  }, [riskMeta])

  const loadServers = async (): Promise<void> => {
    setLoading(true)
    try {
      const data = await window.hermesAPI.listMcpServers()
      setServers(data.servers || [])
      setConfigPath(data.configPath || '')
    } catch {
      setServers([])
    } finally {
      setLoading(false)
    }
  }

  const loadEmployees = async (): Promise<void> => {
    try {
      const list = await window.hermesAPI.listEmployees()
      const hasDefault = list.some(employee => employee.name === 'default')
      setEmployees(hasDefault ? list : [{ name: 'default', displayName: t('tools.defaultEmployee') } as EmployeeInfo, ...list])
    } catch {
      setEmployees([{ name: 'default', displayName: t('tools.defaultEmployee') } as EmployeeInfo])
    }
  }

  useEffect(() => {
    loadServers()
    loadEmployees()
  }, [])

  const resetForm = (): void => {
    setForm(emptyForm)
    setEditingName(null)
    setShowAdvanced(false)
    setAiDescription('')
    setSelectedTemplateId('')
    setFormOpen(false)
  }

  const openCreateForm = (): void => {
    setForm(emptyForm)
    setEditingName(null)
    setShowAdvanced(false)
    setAiDescription('')
    setSelectedTemplateId('')
    setFormOpen(true)
  }

  const openEditForm = (server: McpServerInfo): void => {
    setEditingName(server.name)
    setForm(serverToForm(server))
    setShowAdvanced(false)
    setAiDescription('')
    setSelectedTemplateId('')
    setFormOpen(true)
  }

  const applyTemplate = (template: ReturnType<typeof getMcpTemplates>[number]): void => {
    setEditingName(null)
    setShowAdvanced(false)
    setSelectedTemplateId(template.id)
    setForm(template.form)
    setFormOpen(true)
  }

  const fillFormFromConfig = (config: Partial<McpServerInfo>): void => {
    setEditingName(null)
    setShowAdvanced(false)
    setSelectedTemplateId('')
    setForm({
      name: config.name || '',
      transport: config.transport || (config.url ? 'http' : 'stdio'),
      command: config.command || '',
      argsText: (config.args || []).join('\n'),
      url: config.url || '',
      envText: recordToText(config.env),
      headersText: recordToText(config.headers),
      timeout: String(config.timeout || 120),
      connectTimeout: String(config.connect_timeout || 60),
      allowedProfiles: [],
    })
    setFormOpen(true)
  }

  const toggleAllowedProfile = (profileName: string): void => {
    setForm(prev => {
      const exists = prev.allowedProfiles.includes(profileName)
      return {
        ...prev,
        allowedProfiles: exists
          ? prev.allowedProfiles.filter(name => name !== profileName)
          : [...prev.allowedProfiles, profileName],
      }
    })
  }

  const handleParseDescription = async (): Promise<void> => {
    const description = aiDescription.trim()
    if (!description) {
      showToast(t('tools.parseFirst'), 'error')
      return
    }
    setParsing(true)
    try {
      const result = await window.hermesAPI.parseMcpDescription(description)
      if (result.success && result.config) {
        fillFormFromConfig(result.config)
        showToast(t('tools.draftGenerated'))
      } else {
        showToast(translateError(result.error, t) || t('tools.parseFailed'), 'error')
      }
    } catch {
      showToast(t('tools.parseFailedCheck'), 'error')
    } finally {
      setParsing(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    try {
      const result = await window.hermesAPI.saveMcpServer({
        name: form.name.trim(),
        transport: form.transport,
        command: form.command.trim(),
        args: form.argsText.split('\n').map(v => v.trim()).filter(Boolean),
        url: form.url.trim(),
        env: parseKeyValueText(form.envText),
        headers: parseKeyValueText(form.headersText),
        timeout: Number(form.timeout || 120),
        connect_timeout: Number(form.connectTimeout || 60),
        allowedProfiles: form.allowedProfiles,
      })
      if (result.success) {
        showToast(t('tools.saved'))
        resetForm()
        await loadServers()
      } else {
        showToast(translateError(result.error, t) || t('common.saveFailed'), 'error')
      }
    } catch {
      showToast(t('common.saveFailed'), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (name: string): Promise<void> => {
    const result = await window.hermesAPI.deleteMcpServer(name)
    if (result.success) {
      showToast(t('tools.deleted'))
      if (editingName === name) resetForm()
      await loadServers()
    } else {
      showToast(translateError(result.error, t) || t('common.deleteFailed'), 'error')
    }
  }

  const handleTest = async (name: string): Promise<void> => {
    setTestingName(name)
    try {
      const result = await window.hermesAPI.testMcpServer(name)
      setTestOutput(prev => ({ ...prev, [name]: result.output || '' }))
      showToast(result.success ? t('tools.testDone') : t('tools.testFailed'), result.success ? 'success' : 'error')
    } catch {
      showToast(t('tools.testFailed'), 'error')
    } finally {
      setTestingName(null)
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="screen-header drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0">
        <h2 className="screen-header-title">{t('tools.title')}</h2>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="w-[240px] shrink-0 border-r border-[var(--border)] glass-medium p-3">
          <button
            onClick={() => setTab('builtin')}
            className={`mb-1 flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm transition-colors ${tab === 'builtin' ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
          >
            <Wrench size={16} /> {t('tools.builtin')}
          </button>
          <button
            onClick={() => setTab('mcp')}
            className={`flex w-full items-center gap-2 rounded-[var(--radius)] px-3 py-2.5 text-sm transition-colors ${tab === 'mcp' ? 'bg-[var(--accent-glow)] text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
          >
            <Server size={16} /> {t('tools.mcpServers')}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'builtin' && (
            <div className="mx-auto max-w-5xl space-y-5">
              <div className="grid grid-cols-3 gap-3">
                <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                  <div className="text-xs text-[var(--text-dim)]">{t('tools.builtinCount')}</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{ALL_TOOLS.length}</div>
                </div>
                <div className="glass-medium border border-[rgba(239,68,68,0.25)] rounded-[var(--radius-lg)] p-4">
                  <div className="text-xs text-[var(--text-dim)]">{t('tools.highRisk')}</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--danger)]">{riskCounts.high}</div>
                </div>
                <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                  <div className="text-xs text-[var(--text-dim)]">{t('tools.mcpExtension')}</div>
                  <div className="mt-1 text-2xl font-semibold text-[var(--text-primary)]">{servers.length}</div>
                </div>
              </div>

              <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
                <ShieldAlert size={18} className="mt-0.5 text-[var(--accent)]" />
                <div className="text-sm leading-relaxed text-[var(--text-secondary)]">
                  {t('tools.builtinHint')}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {ALL_TOOLS.map(key => {
                  const meta = toolMeta[key]
                  const risk = riskMeta[key] || { label: t('tools.riskLow'), level: 'low', desc: t('tools.riskDefault') }
                  return (
                    <div key={key} className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--accent-glow)] text-[var(--accent)]">
                            {meta?.icon || <Wrench size={18} />}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{meta?.label || key}</div>
                            <div className="truncate text-xs text-[var(--text-dim)]">{key}</div>
                          </div>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-1 text-xs ${risk.level === 'high' ? 'bg-[rgba(239,68,68,0.12)] text-[var(--danger)]' : risk.level === 'medium' ? 'bg-[rgba(245,158,11,0.12)] text-[var(--warning)]' : 'bg-[rgba(34,197,94,0.12)] text-[var(--success)]'}`}>
                          {risk.label}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-[var(--text-secondary)]">{meta?.desc}</p>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-dim)]">{risk.desc}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {tab === 'mcp' && (
            <div className="mx-auto max-w-5xl space-y-4">
              <div className="space-y-4">
                <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 flex items-start gap-3">
                  <Database size={18} className="mt-0.5 text-[var(--accent)]" />
                  <div className="min-w-0 flex-1 text-sm leading-relaxed text-[var(--text-secondary)]">
                    {t('tools.mcpHint')}
                    {configPath && <div className="mt-1 truncate text-xs text-[var(--text-dim)]">{configPath}</div>}
                  </div>
                  <button
                    onClick={openCreateForm}
                    className="flex items-center gap-1.5 rounded-[var(--radius)] bg-accent-gradient px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
                  >
                    <Plus size={12} />
                    {t('tools.addMcp')}
                  </button>
                  <button
                    onClick={loadServers}
                    disabled={loading}
                    className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                  >
                    {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {t('common.refresh')}
                  </button>
                </div>

                {servers.length === 0 && !loading && (
                  <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] py-16 text-center">
                    <div className="text-sm text-[var(--text-dim)]">{t('tools.noMcp')}</div>
                    <button
                      onClick={openCreateForm}
                      className="mt-4 inline-flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                    >
                      <Plus size={15} />
                      {t('tools.addMcp')}
                    </button>
                  </div>
                )}

                {servers.map(server => (
                  <div key={server.name} className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-base font-semibold text-[var(--text-primary)]">{server.name}</span>
                          <span className="rounded-full bg-[var(--accent-glow)] px-2 py-0.5 text-xs text-[var(--accent)]">{transportLabel(server.transport)}</span>
                        </div>
                        <div className="mt-1 truncate text-xs text-[var(--text-dim)]">
                          {server.transport === 'stdio' ? `${server.command || ''} ${(server.args || []).join(' ')}` : server.url}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <button
                          onClick={() => openEditForm(server)}
                          className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          onClick={() => handleTest(server.name)}
                          disabled={testingName === server.name}
                          className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] disabled:opacity-40"
                        >
                          {testingName === server.name ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                          {t('tools.test')}
                        </button>
                        <Popconfirm title={t('tools.deleteConfirm', { name: server.name })} onConfirm={() => handleDelete(server.name)}>
                          <button className="rounded-[var(--radius)] border border-[rgba(239,68,68,0.25)] px-2.5 py-1.5 text-xs text-[var(--danger)] hover:bg-[rgba(239,68,68,0.08)]">
                            <Trash2 size={12} />
                          </button>
                        </Popconfirm>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--text-dim)]">
                      <span>timeout {server.timeout || 120}s</span>
                      <span>connect {server.connect_timeout || 60}s</span>
                      <span>{t('tools.authorized')}: {(server.allowedProfiles || []).join(', ') || t('tools.unauthorized')}</span>
                      {server.envKeys.length > 0 && <span>env: {server.envKeys.join(', ')}</span>}
                    </div>
                    {testOutput[server.name] && (
                      <pre className="mt-3 max-h-[180px] overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-xs leading-relaxed text-[var(--text-secondary)] whitespace-pre-wrap">{testOutput[server.name]}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {tab === 'mcp' && formOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center">
            <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={resetForm} />
            <div className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[620px] animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)] max-h-[85vh] overflow-y-auto">
              <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-6">
                  <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    <Plus size={16} className="text-[var(--accent)]" />
                    {editingName ? t('tools.editMcp') : t('tools.addMcp')}
                  </div>
                  <button onClick={resetForm} className="text-[var(--text-dim)] hover:text-[var(--text-primary)]">
                    <X size={16} />
                  </button>
                </div>
                <div className="space-y-4 p-6">
                  {!editingName && (
                    <div className="space-y-3">
                      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
                          <Sparkles size={14} className="text-[var(--accent)]" />
                          {t('tools.aiParseTitle')}
                        </div>
                        <textarea
                          value={aiDescription}
                          onChange={(e) => setAiDescription(e.target.value)}
                          placeholder={t('tools.aiParsePlaceholder')}
                          className="min-h-[96px] w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                        <button
                          type="button"
                          onClick={handleParseDescription}
                          disabled={parsing || !aiDescription.trim()}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
                        >
                          {parsing ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />}
                          {parsing ? t('tools.parsing') : t('tools.aiParseBtn')}
                        </button>
                      </div>

                      <select
                        value={selectedTemplateId}
                        onChange={(e) => {
                          const template = mcpTemplates.find(item => item.id === e.target.value)
                          if (template) applyTemplate(template)
                          else setSelectedTemplateId('')
                        }}
                        className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                      >
                        <option value="">{t('tools.selectTemplate')}</option>
                        {mcpTemplates.map(template => (
                          <option key={template.id} value={template.id}>{template.title} - {template.desc}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t('tools.name')}</label>
                    <input
                      value={form.name}
                      onChange={(e) => setForm(prev => ({ ...prev, name: e.target.value }))}
                      disabled={!!editingName}
                      placeholder={t('tools.namePlaceholder')}
                      className="w-full glass-medium rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] disabled:opacity-60"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t('tools.transport')}</label>
                    <select
                      value={form.transport}
                      onChange={(e) => setForm(prev => ({ ...prev, transport: e.target.value }))}
                      className="w-full glass-medium rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
                    >
                      <option value="stdio">stdio command</option>
                      <option value="http">HTTP / Streamable HTTP</option>
                      <option value="sse">SSE</option>
                    </select>
                  </div>
                  {form.name === 'db_toolbox' && form.command === 'toolbox' && (
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {t('tools.dbToolboxHint')}
                    </div>
                  )}
                  {form.transport === 'stdio' ? (
                    <>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t('tools.command')}</label>
                        <input
                          value={form.command}
                          onChange={(e) => setForm(prev => ({ ...prev, command: e.target.value }))}
                          placeholder={t('tools.commandPlaceholder')}
                          className="w-full glass-medium rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t('tools.args')}</label>
                        <textarea
                          value={form.argsText}
                          onChange={(e) => setForm(prev => ({ ...prev, argsText: e.target.value }))}
                          placeholder={t('tools.argsPlaceholder')}
                          className="min-h-[96px] w-full resize-none glass-medium rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
                        />
                      </div>
                    </>
                  ) : (
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t('tools.url')}</label>
                      <input
                        value={form.url}
                        onChange={(e) => setForm(prev => ({ ...prev, url: e.target.value }))}
                        placeholder={t('tools.urlPlaceholder')}
                        className="w-full glass-medium rounded-[var(--radius)] border border-[var(--border)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
                      />
                    </div>
                  )}
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t('tools.authorizedEmployees')}</label>
                    <div className="grid max-h-[180px] grid-cols-2 gap-2 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                      {employees.map(employee => {
                        const checked = form.allowedProfiles.includes(employee.name)
                        return (
                          <label
                            key={employee.name}
                            className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-sm transition-colors ${checked ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--text-primary)]' : 'border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'}`}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleAllowedProfile(employee.name)}
                              className="accent-[var(--accent)]"
                            />
                            <span className="min-w-0 truncate">{employee.displayName || employee.name}</span>
                          </label>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 text-xs text-[var(--text-dim)]">{t('tools.authorizedHint')}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAdvanced(value => !value)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    {showAdvanced ? t('tools.hideAdvanced') : t('tools.showAdvanced')}
                  </button>
                  {showAdvanced && (
                    <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-surface)] p-3">
                      {form.transport === 'stdio' ? (
                        <textarea
                          value={form.envText}
                          onChange={(e) => setForm(prev => ({ ...prev, envText: e.target.value }))}
                          placeholder={t('tools.envPlaceholder')}
                          className="min-h-[86px] w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                      ) : (
                        <textarea
                          value={form.headersText}
                          onChange={(e) => setForm(prev => ({ ...prev, headersText: e.target.value }))}
                          placeholder={t('tools.headersPlaceholder')}
                          className="min-h-[86px] w-full resize-none rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          value={form.timeout}
                          onChange={(e) => setForm(prev => ({ ...prev, timeout: e.target.value }))}
                          placeholder={t('tools.callTimeout')}
                          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                        <input
                          value={form.connectTimeout}
                          onChange={(e) => setForm(prev => ({ ...prev, connectTimeout: e.target.value }))}
                          placeholder={t('tools.connectTimeout')}
                          className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                      </div>
                    </div>
                  )}
                  <div className="rounded-[var(--radius)] border border-[rgba(245,158,11,0.25)] bg-[rgba(245,158,11,0.08)] p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                    <div className="mb-1 flex items-center gap-1.5 font-medium text-[var(--text-primary)]">
                      <AlertTriangle size={13} className="text-[var(--warning)]" />
                      {t('tools.restartHintTitle')}
                    </div>
                    {t('tools.restartHint')}
                  </div>
                </div>
                <div className="flex items-center gap-3 border-t border-[var(--border)] px-6 py-4">
                  <button
                    onClick={handleSave}
                    disabled={saving || !form.name.trim() || form.allowedProfiles.length === 0}
                    className="flex items-center justify-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                    {saving ? t('common.saving') : t('tools.saveMcp')}
                  </button>
                  <button
                    onClick={resetForm}
                    className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  >
                    {t('common.cancel')}
                  </button>
                </div>
              </div>
          </div>
        )}
      </div>
    </div>
  )
}
