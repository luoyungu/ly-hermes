import { useState, useEffect, useCallback, useRef } from 'react'
import { usePlatform } from '../../hooks/usePlatform'
import {
  Plus,
  Trash2,
  Play,
  Pause,
  RefreshCw,
  Clock,
  Calendar,
  AlertCircle,
  Loader2,
  Check,
  X,
  ChevronDown,
  UserPlus,
  Pencil,
  Zap,
  Send,
  ChevronRight,
  FileText,
  Brain,
  Repeat,
  Activity
} from 'lucide-react'
import type { EmployeeInfo } from '../../../../preload/index'
import { showToast } from '../../App'
import { mapStatus } from '../../shared/employee-shared'
import Popconfirm from '../../components/Popconfirm'
import { useTheme } from '../../components/ThemeProvider'

interface CronJobDisplay {
  id: string
  name: string
  schedule: string
  schedule_display?: string
  prompt?: string
  enabled: boolean
  state?: string
  last_run_at?: string | null
  next_run_at?: string | null
  last_status?: string | null
  last_error?: string | null
  last_delivery_error?: string | null
  profile?: string
  deliver?: string
  repeat?: string | null
  skills?: string | null
  script?: string | null
}

interface JobWithProfile extends CronJobDisplay {
  profileName: string
  employeeAvatar: string
  employeeDisplayName: string
}

const SCHEDULE_PRESETS = [
  { label: '每30分钟', value: 'every 30m' },
  { label: '每1小时', value: 'every 1h' },
  { label: '每2小时', value: 'every 2h' },
  { label: '每6小时', value: 'every 6h' },
  { label: '每天9点', value: '0 9 * * *' },
  { label: '每天18点', value: '0 18 * * *' },
  { label: '每周一9点', value: '0 9 * * 1' },
  { label: '每月1号9点', value: '0 9 1 * *' },
]

type ExternalDelivery = 'none' | 'feishu' | 'weixin' | 'dingtalk'

const formatDeliverTarget = (deliver?: string): string => {
  if (!deliver) return ''
  return deliver.split(',').map(part => {
    const target = part.trim()
    if (target === 'local') return '桌面历史'
    if (target === 'origin') return '来源平台'
    if (target === 'feishu') return '飞书'
    if (target === 'weixin') return '微信'
    if (target === 'dingtalk') return '钉钉'
    if (target.startsWith('feishu:')) return `飞书:${target.slice('feishu:'.length)}`
    if (target.startsWith('weixin:')) return `微信:${target.slice('weixin:'.length)}`
    if (target.startsWith('dingtalk:')) return `钉钉:${target.slice('dingtalk:'.length)}`
    return target
  }).join(' + ')
}

function formatRelativeTime(d: string | null | undefined): string {
  if (!d) return '-'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    const now = Date.now()
    const diff = date.getTime() - now
    if (Math.abs(diff) < 60000) return '刚刚'
    const absDiff = Math.abs(diff)
    const isFuture = diff > 0
    if (absDiff < 3600000) {
      const mins = Math.floor(absDiff / 60000)
      return isFuture ? `${mins}分钟后` : `${mins}分钟前`
    }
    if (absDiff < 86400000) {
      const hours = Math.floor(absDiff / 3600000)
      return isFuture ? `${hours}小时后` : `${hours}小时前`
    }
    const days = Math.floor(absDiff / 86400000)
    return isFuture ? `${days}天后` : `${days}天前`
  } catch {
    return d
  }
}

function formatFullDate(d: string | null | undefined): string {
  if (!d) return '-'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  } catch {
    return d
  }
}

export default function Schedule(): React.ReactElement {
  const { isMac } = usePlatform()
  const { lexicon } = useTheme()
  const [employees, setEmployees] = useState<EmployeeInfo[]>([])
  const [allJobs, setAllJobs] = useState<JobWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [editingJob, setEditingJob] = useState<JobWithProfile | null>(null)
  const [detailJob, setDetailJob] = useState<JobWithProfile | null>(null)
  const [filterEmployee, setFilterEmployee] = useState<string>('')

  const loadEmployees = useCallback(async () => {
    try {
      const list = await window.hermesAPI.listEmployees()
      const mapped = (list || []).map(e => ({ ...e, status: mapStatus(e.status || '') }))
      setEmployees(mapped)
    } catch { setEmployees([]) }
  }, [])

  const loadAllJobs = useCallback(async (empList: EmployeeInfo[]) => {
    setLoading(true)
    try {
      const allResults: JobWithProfile[] = []
      for (const emp of empList) {
        try {
          const result = await window.hermesAPI.getCronJobs(emp.name)
          const jobs = (Array.isArray(result) ? result : []) as CronJobDisplay[]
          for (const job of jobs) {
            allResults.push({
              ...job,
              profileName: emp.name,
              employeeAvatar: emp.avatar || '🧑‍💼',
              employeeDisplayName: emp.displayName || emp.name,
            })
          }
        } catch { /* skip */ }
      }
      allResults.sort((a, b) => {
        if (a.enabled !== b.enabled) return a.enabled ? -1 : 1
        return (a.next_run_at || '').localeCompare(b.next_run_at || '')
      })
      setAllJobs(allResults)
    } catch { setAllJobs([]) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    loadEmployees()
  }, [loadEmployees])

  useEffect(() => {
    if (employees.length > 0) {
      loadAllJobs(employees)
    }
  }, [employees, loadAllJobs])

  const refreshJobs = useCallback(async () => {
    await loadAllJobs(employees)
  }, [employees, loadAllJobs])

  const handlePause = async (jobId: string, profileName: string): Promise<void> => {
    try {
      await window.hermesAPI.pauseCronJob(jobId, profileName)
      showToast('已暂停')
      refreshJobs()
    } catch { showToast('暂停失败', 'error') }
  }

  const handleResume = async (jobId: string, profileName: string): Promise<void> => {
    try {
      await window.hermesAPI.resumeCronJob(jobId, profileName)
      showToast('已恢复')
      refreshJobs()
    } catch { showToast('恢复失败', 'error') }
  }

  const handleTrigger = async (jobId: string, profileName: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.triggerCronJob(jobId, profileName)
      if (result.success) {
        showToast('已触发')
      } else {
        showToast(result.output || '触发失败', 'error')
      }
      refreshJobs()
    } catch { showToast('触发失败', 'error') }
  }

  const handleFixDelivery = async (jobId: string, profileName: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.updateCronJobDeliver(jobId, 'local', profileName)
      if (result.success) {
        showToast('已改为本地保存')
      } else {
        showToast(result.output || '修复失败', 'error')
      }
      refreshJobs()
    } catch { showToast('修复失败', 'error') }
  }

  const handleDelete = async (jobId: string, profileName: string): Promise<void> => {
    try {
      await window.hermesAPI.deleteCronJob(jobId, profileName)
      showToast('已删除')
      refreshJobs()
    } catch { showToast('删除失败', 'error') }
  }

  const filteredJobs = filterEmployee
    ? allJobs.filter(j => j.profileName === filterEmployee)
    : allJobs

  const employeesWithJobs = employees.filter(emp =>
    allJobs.some(j => j.profileName === emp.name)
  )

  return (
    <div className="flex h-full flex-col">
      <div className="screen-header drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: isMac ? 20 : 0, paddingBottom: isMac ? 20 : 0 }}>
        <h2 className="screen-header-title">{lexicon.schedule.title}</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 pt-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 overflow-x-auto">
            <button
              onClick={() => setFilterEmployee('')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--radius-lg)] border cursor-pointer transition-all whitespace-nowrap ${
                !filterEmployee
                  ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[rgba(124,106,239,0.3)] hover:text-[var(--text-primary)]'
              }`}
            >
              <span className="text-base">📋</span>
              <span className="text-[13px] font-medium">全部</span>
              <span className="text-[11px] opacity-60">{allJobs.length}</span>
            </button>
            {employeesWithJobs.map(emp => {
              const empJobs = allJobs.filter(j => j.profileName === emp.name)
              const isActive = filterEmployee === emp.name
              return (
                <button
                  key={emp.name}
                  onClick={() => setFilterEmployee(isActive ? '' : emp.name)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-[var(--radius-lg)] border cursor-pointer transition-all whitespace-nowrap ${
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--accent-glow)] text-[var(--accent)]'
                      : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[rgba(124,106,239,0.3)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <span className="text-base">{emp.avatar || '🧑‍💼'}</span>
                  <span className="text-[13px] font-medium">{emp.displayName || emp.name}</span>
                  <span className="text-[11px] opacity-60">{empJobs.length}</span>
                </button>
              )
            })}
          </div>
          <div className="flex items-center gap-2.5 shrink-0 ml-4">
            <button
              onClick={refreshJobs}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--border)] px-4 py-2.5 text-sm text-[var(--text-secondary)] cursor-pointer hover:bg-[var(--bg-hover)] transition-all"
            >
              <RefreshCw size={16} /> 刷新
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-[var(--radius-lg)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-all"
            >
              <Plus size={16} /> {lexicon.schedule.newSchedule}
            </button>
          </div>
        </div>

        <div className="px-6 pb-6">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
            </div>
          ) : filteredJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
              <Calendar size={56} className="mb-4 opacity-20" />
              <p className="text-base font-medium text-[var(--text-secondary)] mb-1">
                {filterEmployee ? lexicon.schedule.emptyForEmployee : lexicon.schedule.empty}
              </p>
              <p className="text-sm mb-5">{lexicon.schedule.emptyHint}</p>
              <button
                onClick={() => setShowCreate(true)}
                className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 cursor-pointer transition-all"
              >
              <Plus size={16} /> {lexicon.schedule.createSchedule}
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {filteredJobs.map(job => (
              <JobCard
                key={job.profileName + ':' + job.id}
                job={job}
                lexicon={lexicon}
                showEmployee={!filterEmployee}
                onClick={() => setDetailJob(job)}
                onPause={() => handlePause(job.id, job.profileName)}
                onResume={() => handleResume(job.id, job.profileName)}
                onTrigger={() => handleTrigger(job.id, job.profileName)}
                onFixDelivery={() => handleFixDelivery(job.id, job.profileName)}
                onDelete={() => handleDelete(job.id, job.profileName)}
                onEdit={() => setEditingJob(job)}
              />
            ))}
          </div>
        )}
      </div>
      </div>

      {detailJob && (
        <JobDetail
          job={detailJob}
          lexicon={lexicon}
          showEmployee={!filterEmployee}
          onClose={() => setDetailJob(null)}
          onEdit={() => { setDetailJob(null); setEditingJob(detailJob) }}
          onPause={() => { handlePause(detailJob.id, detailJob.profileName); setDetailJob(null) }}
          onResume={() => { handleResume(detailJob.id, detailJob.profileName); setDetailJob(null) }}
          onTrigger={() => handleTrigger(detailJob.id, detailJob.profileName)}
          onDelete={() => { handleDelete(detailJob.id, detailJob.profileName); setDetailJob(null) }}
          onFixDelivery={() => { handleFixDelivery(detailJob.id, detailJob.profileName); setDetailJob(null) }}
        />
      )}

      {showCreate && (
        <CreateJob
          employees={employees}
          lexicon={lexicon}
          onCreated={() => { setShowCreate(false); refreshJobs() }}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {editingJob && (
        <EditJob
          job={editingJob}
          lexicon={lexicon}
          onSaved={() => { setEditingJob(null); refreshJobs() }}
          onCancel={() => setEditingJob(null)}
        />
      )}
    </div>
  )
}

function JobCard({
  job,
  lexicon,
  showEmployee,
  onClick,
  onPause,
  onResume,
  onTrigger,
  onFixDelivery,
  onDelete,
  onEdit
}: {
  job: JobWithProfile
  lexicon: ReturnType<typeof useTheme>['lexicon']
  showEmployee: boolean
  onClick: () => void
  onPause: () => void
  onResume: () => void
  onTrigger: () => void
  onFixDelivery: () => void
  onDelete: () => void
  onEdit: () => void
}): React.ReactElement {
  const deliveryError = job.last_delivery_error || ''
  const deliveryNeedsFix = job.deliver === 'origin' || /no delivery target resolved|deliver=origin/i.test(`${job.last_error || ''} ${deliveryError}`)
  const lastRunFailed = job.last_status && job.last_status !== 'ok' && job.last_status !== 'success'

  return (
    <div
      className={`glass-medium border rounded-[var(--radius-lg)] transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] cursor-pointer group ${job.enabled ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-60'}`}
      onClick={onClick}
    >
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0 flex-1">
            <div className="flex flex-col items-center gap-1 pt-1">
              <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${job.enabled ? 'bg-[var(--success)] shadow-[0_0_6px_rgba(34,197,94,0.3)]' : 'bg-[var(--text-dim)]'}`} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[15px] text-[var(--text-primary)]">{job.name || lexicon.schedule.unnamed}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                  job.enabled
                    ? 'bg-[rgba(34,197,94,0.1)] text-[var(--success)]'
                    : 'bg-[rgba(156,163,175,0.1)] text-[var(--text-dim)]'
                }`}>
                  {job.enabled ? '活跃' : '暂停'}
                </span>
                {showEmployee && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full glass-medium border border-[var(--border)] text-[11px] text-[var(--text-dim)]">
                    <span className="text-xs">{job.employeeAvatar}</span>
                    <span>{job.employeeDisplayName}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 mt-2 text-xs text-[var(--text-dim)]">
                <Clock size={12} className="text-[var(--accent)]" />
                <span className="font-mono text-[var(--text-secondary)]">{job.schedule_display || job.schedule}</span>
              </div>

              {job.prompt && (
                <p className="mt-2.5 text-[13px] text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{job.prompt}</p>
              )}

              <div className="flex items-center gap-3 mt-3 flex-wrap">
                {job.next_run_at && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Zap size={11} className="text-[var(--accent)]" />
                    <span className="text-[var(--text-dim)]">下次:</span>
                    <span className="text-[var(--text-secondary)] font-medium" title={formatFullDate(job.next_run_at)}>{formatRelativeTime(job.next_run_at)}</span>
                  </div>
                )}
                {job.last_run_at && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[var(--text-dim)]">上次:</span>
                    <span className="text-[var(--text-secondary)]" title={formatFullDate(job.last_run_at)}>{formatRelativeTime(job.last_run_at)}</span>
                    {lastRunFailed && <AlertCircle size={11} className="text-[var(--danger)]" />}
                  </div>
                )}
                {job.repeat && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <Repeat size={11} className="text-[var(--text-dim)]" />
                    <span className="text-[var(--text-secondary)]">{job.repeat}</span>
                  </div>
                )}
              </div>

              {job.last_error && (
                <div className="flex items-start gap-1.5 mt-2.5 text-xs text-[var(--danger)]">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  <span className="line-clamp-1">{job.last_error}</span>
                </div>
              )}
              {deliveryNeedsFix && (
                <div className="mt-2.5 flex items-center gap-2 rounded-lg border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] px-2.5 py-2 text-xs text-[var(--warning)]" onClick={e => e.stopPropagation()}>
                  <AlertCircle size={13} className="shrink-0" />
                  <span className="flex-1">桌面端没有可解析的 origin 来源，建议改为桌面历史。</span>
                  <button
                    onClick={onFixDelivery}
                    className="rounded-md border border-[rgba(234,179,8,0.35)] px-2 py-1 text-[11px] font-medium hover:bg-[rgba(234,179,8,0.12)] cursor-pointer"
                  >
                    改为桌面
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            {job.enabled ? (
              <button onClick={onPause} title="暂停" className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer transition-all">
                <Pause size={14} />
              </button>
            ) : (
              <button onClick={onResume} title="恢复" className="w-8 h-8 rounded-lg border border-[rgba(34,197,94,0.3)] flex items-center justify-center text-[var(--success)] hover:bg-[rgba(34,197,94,0.1)] cursor-pointer transition-all">
                <Play size={14} />
              </button>
            )}
            <button onClick={onTrigger} title="立即执行" className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] cursor-pointer transition-all">
              <Play size={14} />
            </button>
            <button onClick={onEdit} title="编辑" className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] cursor-pointer transition-all">
              <Pencil size={14} />
            </button>
            <Popconfirm title={lexicon.schedule.deleteConfirm} onConfirm={onDelete}>
              <button title="删除" className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)] cursor-pointer transition-all">
                <Trash2 size={14} />
              </button>
            </Popconfirm>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-dim)] opacity-0 group-hover:opacity-100 transition-opacity">
        <span>点击查看详情</span>
        <ChevronRight size={12} />
      </div>
    </div>
  )
}

function JobDetail({
  job,
  lexicon,
  showEmployee,
  onClose,
  onEdit,
  onPause,
  onResume,
  onTrigger,
  onDelete,
  onFixDelivery
}: {
  job: JobWithProfile
  lexicon: ReturnType<typeof useTheme>['lexicon']
  showEmployee: boolean
  onClose: () => void
  onEdit: () => void
  onPause: () => void
  onResume: () => void
  onTrigger: () => void
  onDelete: () => void
  onFixDelivery: () => void
}): React.ReactElement {
  const deliveryError = job.last_delivery_error || ''
  const deliveryNeedsFix = job.deliver === 'origin' || /no delivery target resolved|deliver=origin/i.test(`${job.last_error || ''} ${deliveryError}`)
  const hasDeliver = job.deliver && job.deliver !== 'local'
  const hasSkills = job.skills && job.skills.trim().length > 0

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[640px] animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)] max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center px-6 border-b border-[var(--border)] h-14 shrink-0">
          <div className="flex items-center gap-3">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${job.enabled ? 'bg-[var(--success)] shadow-[0_0_6px_rgba(34,197,94,0.3)]' : 'bg-[var(--text-dim)]'}`} />
            <h3 className="text-[17px] font-semibold tracking-[-0.2px]">{job.name || lexicon.schedule.unnamed}</h3>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
              job.enabled
                ? 'bg-[rgba(34,197,94,0.1)] text-[var(--success)]'
                : 'bg-[rgba(156,163,175,0.1)] text-[var(--text-dim)]'
            }`}>
              {job.enabled ? '活跃' : '暂停'}
            </span>
          </div>
          <button onClick={onClose} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {showEmployee && (
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex items-center justify-center text-base">{job.employeeAvatar}</div>
              <span className="text-sm font-medium text-[var(--text-primary)]">{job.employeeDisplayName}</span>
              <span className="text-[var(--text-dim)] text-xs">·</span>
              <span className="font-mono text-xs text-[var(--text-dim)]">ID: {job.id}</span>
            </div>
          )}

          {!showEmployee && (
            <div className="flex items-center gap-2 text-xs text-[var(--text-dim)]">
              <span className="font-mono">ID: {job.id}</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Clock size={12} className="text-[var(--accent)]" />
                <span>调度规则</span>
              </div>
              <div className="font-mono text-sm text-[var(--text-primary)]">{job.schedule_display || job.schedule}</div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Activity size={12} className="text-[var(--accent)]" />
                <span>上次状态</span>
              </div>
              <div className={`text-sm font-medium ${job.last_status ? (job.last_status === 'ok' || job.last_status === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]') : 'text-[var(--text-dim)]'}`}>
                {job.last_status || '未执行'}
              </div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Zap size={12} className="text-[var(--accent)]" />
                <span>下次执行</span>
              </div>
              <div className="text-sm text-[var(--text-primary)]" title={formatFullDate(job.next_run_at)}>{formatRelativeTime(job.next_run_at)}</div>
              {job.next_run_at && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{formatFullDate(job.next_run_at)}</div>}
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Clock size={12} className="text-[var(--text-dim)]" />
                <span>上次执行</span>
              </div>
              <div className="text-sm text-[var(--text-primary)]" title={formatFullDate(job.last_run_at)}>{formatRelativeTime(job.last_run_at)}</div>
              {job.last_run_at && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{formatFullDate(job.last_run_at)}</div>}
            </div>
          </div>

          {job.prompt && (
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-2">
                <FileText size={12} className="text-[var(--accent)]" />
                <span>提示词</span>
              </div>
              <pre className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{job.prompt}</pre>
            </div>
          )}

          {(hasDeliver || hasSkills || job.repeat || job.script) && (
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
              <div className="text-[11px] text-[var(--text-dim)] font-medium">配置详情</div>
              {hasDeliver && (
                <div className="flex items-center gap-2.5">
                  <Send size={14} className="text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">投递目标</div>
                    <div className="text-[13px] text-[var(--text-primary)]">{formatDeliverTarget(job.deliver)}</div>
                  </div>
                </div>
              )}
              {hasSkills && (
                <div className="flex items-center gap-2.5">
                  <Brain size={14} className="text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">使用技能</div>
                    <div className="text-[13px] text-[var(--text-primary)]">{job.skills}</div>
                  </div>
                </div>
              )}
              {job.repeat && (
                <div className="flex items-center gap-2.5">
                  <Repeat size={14} className="text-[var(--text-dim)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">重复执行</div>
                    <div className="text-[13px] text-[var(--text-primary)]">{job.repeat}</div>
                  </div>
                </div>
              )}
              {job.script && (
                <div className="flex items-center gap-2.5">
                  <FileText size={14} className="text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">关联脚本</div>
                    <code className="text-[13px] text-[var(--accent)] bg-[var(--accent-glow)] px-1.5 py-0.5 rounded font-mono">{job.script}</code>
                  </div>
                </div>
              )}
            </div>
          )}

          {job.last_error && (
            <div className="rounded-[var(--radius-lg)] border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.06)] p-4">
              <div className="flex items-center gap-2 text-[11px] text-[var(--danger)] font-medium mb-2">
                <AlertCircle size={13} />
                <span>执行错误</span>
              </div>
              <pre className="text-[13px] text-[var(--danger)] whitespace-pre-wrap leading-relaxed">{job.last_error}</pre>
            </div>
          )}

          {deliveryNeedsFix && (
            <div className="rounded-[var(--radius-lg)] border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.06)] p-4">
              <div className="flex items-center gap-2 text-[11px] text-[var(--warning)] font-medium mb-2">
                <AlertCircle size={13} />
                <span>投递问题</span>
              </div>
              <p className="text-[13px] text-[var(--warning)] mb-3">桌面端没有可解析的 origin 来源，建议改为桌面历史。</p>
              <button
                onClick={onFixDelivery}
                className="rounded-[var(--radius)] border border-[rgba(234,179,8,0.35)] px-3 py-1.5 text-xs font-medium text-[var(--warning)] hover:bg-[rgba(234,179,8,0.12)] cursor-pointer"
              >
                改为桌面保存
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-[var(--radius)] bg-accent-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer transition-all"
          >
            <Pencil size={14} /> 编辑
          </button>
          {job.enabled ? (
            <button onClick={onPause} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all">
              <Pause size={14} /> 暂停
            </button>
          ) : (
            <button onClick={onResume} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(34,197,94,0.3)] px-4 py-2 text-sm text-[var(--success)] hover:bg-[rgba(34,197,94,0.1)] cursor-pointer transition-all">
              <Play size={14} /> 恢复
            </button>
          )}
          <button onClick={onTrigger} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all">
            <Play size={14} /> 立即执行
          </button>
          <div className="flex-1" />
          <Popconfirm title={lexicon.schedule.deleteConfirm} onConfirm={onDelete}>
            <button className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(239,68,68,0.25)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[rgba(239,68,68,0.1)] cursor-pointer transition-all">
              <Trash2 size={14} /> 删除
            </button>
          </Popconfirm>
        </div>
      </div>
    </div>
  )
}

function EditJob({
  job,
  lexicon,
  onSaved,
  onCancel
}: {
  job: JobWithProfile
  lexicon: ReturnType<typeof useTheme>['lexicon']
  onSaved: () => void
  onCancel: () => void
}): React.ReactElement {
  const [name, setName] = useState(job.name || '')
  const [schedule, setSchedule] = useState(job.schedule || '')
  const [prompt, setPrompt] = useState(job.prompt || '')
  const [saving, setSaving] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

  const handleSave = async (): Promise<void> => {
    if (!schedule.trim()) { showToast('请输入调度规则', 'error'); return }
    if (!prompt.trim()) { showToast('请输入提示词', 'error'); return }
    setSaving(true)
    try {
      const updates: Record<string, string> = {}
      if (name.trim() !== (job.name || '')) updates.name = name.trim()
      if (schedule.trim() !== job.schedule) updates.schedule = schedule.trim()
      if (prompt.trim() !== (job.prompt || '')) updates.prompt = prompt.trim()

      if (Object.keys(updates).length === 0) {
        onSaved()
        return
      }

      const result = await window.hermesAPI.updateCronJob(job.id, updates, job.profileName)
      if (result.success) {
        showToast('已保存')
        onSaved()
      } else {
        showToast(result.output || '保存失败', 'error')
      }
    } catch { showToast('保存失败', 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[560px] animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)] max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 border-b border-[var(--border)] h-14">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px]">编辑日程</h3>
          <button onClick={onCancel} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg glass-medium border border-[var(--border)] text-sm text-[var(--text-dim)]">
            <span>{job.employeeAvatar}</span>
            <span className="text-[var(--text-secondary)]">{job.employeeDisplayName}</span>
            <span className="text-[var(--text-dim)]">·</span>
            <span className="font-mono text-xs">{job.id}</span>
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{lexicon.schedule.scheduleName}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="日程名称"
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><Clock size={14} /> 调度规则</label>
            <div className="relative">
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="例如: every 30m / 0 9 * * *"
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] pr-16"
              />
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                预设
              </button>
              {showPresets && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl glass-heavy border border-[var(--border)] z-10 shadow-lg p-2 grid grid-cols-2 gap-1">
                  {SCHEDULE_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => { setSchedule(p.value); setShowPresets(false) }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer transition-colors"
                    >
                      <Clock size={11} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lexicon.schedule.promptPlaceholder}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[100px] transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          {(job.deliver || job.repeat || job.skills || job.script || job.last_status) && (
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5 space-y-2">
              <div className="text-xs font-medium text-[var(--text-dim)] mb-1">只读信息</div>
              {job.deliver && (
                <div className="flex items-center gap-2 text-xs">
                  <Send size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--text-dim)]">投递:</span>
                  <span className="text-[var(--text-secondary)]">{formatDeliverTarget(job.deliver)}</span>
                </div>
              )}
              {job.repeat && (
                <div className="flex items-center gap-2 text-xs">
                  <Repeat size={12} className="text-[var(--text-dim)]" />
                  <span className="text-[var(--text-dim)]">执行:</span>
                  <span className="text-[var(--text-secondary)]">{job.repeat}</span>
                </div>
              )}
              {job.skills && (
                <div className="flex items-center gap-2 text-xs">
                  <Brain size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--text-dim)]">技能:</span>
                  <span className="text-[var(--text-secondary)]">{job.skills}</span>
                </div>
              )}
              {job.script && (
                <div className="flex items-center gap-2 text-xs">
                  <FileText size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--text-dim)]">脚本:</span>
                  <code className="text-[var(--accent)] bg-[var(--accent-glow)] px-1.5 py-0.5 rounded text-[11px] font-mono">{job.script}</code>
                </div>
              )}
              {job.last_status && (
                <div className="flex items-center gap-2 text-xs">
                  <Activity size={12} className="text-[var(--text-dim)]" />
                  <span className="text-[var(--text-dim)]">上次状态:</span>
                  <span className={job.last_status === 'ok' || job.last_status === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]'}>{job.last_status}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={handleSave}
            disabled={saving || !schedule.trim() || !prompt.trim()}
            className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
            {saving ? '保存中...' : '保存'}
          </button>
          <button
            onClick={onCancel}
            className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}

function CreateJob({
  employees,
  lexicon,
  onCreated,
  onCancel
}: {
  employees: EmployeeInfo[]
  lexicon: ReturnType<typeof useTheme>['lexicon']
  onCreated: () => void
  onCancel: () => void
}): React.ReactElement {
  const [selectedEmployee, setSelectedEmployee] = useState<string>(employees[0]?.name || '')
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [prompt, setPrompt] = useState('')
  const [externalDelivery, setExternalDelivery] = useState<ExternalDelivery>('none')
  const [feishuChatId, setFeishuChatId] = useState('')
  const [hasFeishuConfig, setHasFeishuConfig] = useState(false)
  const [weixinChatId, setWeixinChatId] = useState('')
  const [hasWeixinConfig, setHasWeixinConfig] = useState(false)
  const [dingtalkChatId, setDingtalkChatId] = useState('')
  const [hasDingtalkConfig, setHasDingtalkConfig] = useState(false)
  const [loadingDeliveryConfig, setLoadingDeliveryConfig] = useState(false)
  const [creating, setCreating] = useState(false)
  const [showPresets, setShowPresets] = useState(false)
  const [showEmployeePicker, setShowEmployeePicker] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent): void => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowEmployeePicker(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => { document.removeEventListener('mousedown', handleClickOutside) }
  }, [])

  const currentEmployee = employees.find(e => e.name === selectedEmployee)

  useEffect(() => {
    if (!selectedEmployee) return
    let cancelled = false
    setLoadingDeliveryConfig(true)
    window.hermesAPI.getEmployeeEnv(selectedEmployee)
      .then((env) => {
        if (cancelled) return
        setHasFeishuConfig(Boolean(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET))
        setFeishuChatId(env.FEISHU_HOME_CHANNEL || '')
        setHasWeixinConfig(Boolean(env.WEIXIN_TOKEN || env.WEIXIN_ACCOUNT_ID))
        setWeixinChatId(env.WEIXIN_HOME_CHANNEL || '')
        setHasDingtalkConfig(Boolean(env.DINGTALK_CLIENT_ID && env.DINGTALK_CLIENT_SECRET))
        setDingtalkChatId(env.DINGTALK_HOME_CHANNEL || '')
      })
      .catch(() => {
        if (cancelled) return
        setHasFeishuConfig(false)
        setFeishuChatId('')
        setHasWeixinConfig(false)
        setWeixinChatId('')
        setHasDingtalkConfig(false)
        setDingtalkChatId('')
      })
      .finally(() => {
        if (!cancelled) setLoadingDeliveryConfig(false)
      })
    return () => { cancelled = true }
  }, [selectedEmployee])

  const buildDelivery = (): string | null => {
    const targets = ['local']
    if (externalDelivery === 'feishu') {
      const chatId = feishuChatId.trim()
      if (!hasFeishuConfig) {
        showToast('请先在员工详情的「集成」里配置飞书机器人', 'error')
        return null
      }
      if (!chatId) {
        showToast('请输入飞书接收会话 ID', 'error')
        return null
      }
      targets.push(`feishu:${chatId}`)
    }
    if (externalDelivery === 'weixin') {
      const chatId = weixinChatId.trim()
      if (!hasWeixinConfig) {
        showToast('请先在员工详情的「集成」里配置微信接入', 'error')
        return null
      }
      if (!chatId) {
        showToast('请输入微信接收对象 ID', 'error')
        return null
      }
      targets.push(`weixin:${chatId}`)
    }
    if (externalDelivery === 'dingtalk') {
      const chatId = dingtalkChatId.trim()
      if (!hasDingtalkConfig) {
        showToast('请先在员工详情的「集成」里配置钉钉机器人', 'error')
        return null
      }
      if (!chatId) {
        showToast('请输入钉钉接收会话 ID', 'error')
        return null
      }
      targets.push(`dingtalk:${chatId}`)
    }
    return targets.join(',')
  }

  const handleCreate = async (): Promise<void> => {
    if (!selectedEmployee) { showToast(`请选择${lexicon.entities.employee}`, 'error'); return }
    if (!schedule.trim()) { showToast('请输入调度规则', 'error'); return }
    if (!prompt.trim()) { showToast('请输入提示词', 'error'); return }
    const deliver = buildDelivery()
    if (!deliver) return
    setCreating(true)
    try {
      const result = await window.hermesAPI.createCronJob({
        name: name.trim() || undefined,
        schedule: schedule.trim(),
        prompt: prompt.trim(),
        deliver,
        profile: selectedEmployee
      })
      if (result.success) {
        showToast(lexicon.schedule.success)
        onCreated()
      } else {
        showToast(result.output || '创建失败', 'error')
      }
    } catch { showToast('创建失败', 'error') }
    finally { setCreating(false) }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[560px] animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)] max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 border-b border-[var(--border)] h-14">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px]">{lexicon.schedule.createSchedule}</h3>
          <button onClick={onCancel} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><UserPlus size={14} /> {lexicon.entities.selectEmployee}</label>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowEmployeePicker(!showEmployeePicker)}
                className="flex items-center justify-between w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)] transition-all"
              >
                <span className="flex items-center gap-2">
                  <span>{currentEmployee?.avatar || '🧑‍💼'}</span>
                  <span>{currentEmployee?.displayName || lexicon.entities.selectEmployee}</span>
                </span>
                <ChevronDown size={14} className="text-[var(--text-dim)]" />
              </button>
              {showEmployeePicker && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl glass-heavy border border-[var(--border)] z-10 shadow-lg max-h-[200px] overflow-y-auto">
                  {employees.map(emp => (
                    <button
                      key={emp.name}
                      onClick={() => { setSelectedEmployee(emp.name); setShowEmployeePicker(false) }}
                      className={`flex items-center gap-2.5 w-full px-3.5 py-2.5 text-sm cursor-pointer transition-colors ${
                        selectedEmployee === emp.name
                          ? 'bg-[var(--accent-glow)] text-[var(--accent)]'
                          : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
                      }`}
                    >
                      <span>{emp.avatar || '🧑‍💼'}</span>
                      <span>{emp.displayName || emp.name}</span>
                      {selectedEmployee === emp.name && <Check size={14} className="ml-auto" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{lexicon.schedule.scheduleName}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={lexicon.schedule.title === '法旨' ? '例如: 每日巡山札记' : '例如: 每日新闻摘要'}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><Clock size={14} /> 调度规则</label>
            <div className="relative">
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="例如: every 30m / 0 9 * * *"
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] pr-16"
              />
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                预设
              </button>
              {showPresets && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl glass-heavy border border-[var(--border)] z-10 shadow-lg p-2 grid grid-cols-2 gap-1">
                  {SCHEDULE_PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => { setSchedule(p.value); setShowPresets(false) }}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] rounded-lg cursor-pointer transition-colors"
                    >
                      <Clock size={11} />
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-dim)]">
              支持: 间隔(every 30m)、Cron(0 9 * * *)、一次性(2026-06-01T10:00)
            </p>
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">提示词</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lexicon.schedule.promptPlaceholder}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[100px] transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">结果投递</label>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5 text-sm text-[var(--text-primary)] space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">桌面历史</div>
                  <div className="text-[11px] text-[var(--text-dim)] truncate">
                    写入 {currentEmployee?.displayName || selectedEmployee} 的日程会话
                  </div>
                </div>
                <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]">固定开启</span>
              </div>

              <div className="grid grid-cols-4 gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
                {([
                  ['none', '不外发'],
                  ['feishu', '飞书'],
                  ['weixin', '微信'],
                  ['dingtalk', '钉钉'],
                ] as Array<[ExternalDelivery, string]>).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setExternalDelivery(value)}
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-all cursor-pointer ${
                      externalDelivery === value
                        ? 'bg-[var(--accent-glow)] text-[var(--accent)] shadow-sm'
                        : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {externalDelivery === 'feishu' && (
                <div className="space-y-3 border-t border-[var(--border)] pt-3">
                  <div className={`rounded-lg border px-3 py-2 text-xs ${hasFeishuConfig ? 'border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] text-[var(--success)]' : 'border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] text-[var(--warning)]'}`}>
                    {hasFeishuConfig ? '已读取到该员工的飞书机器人配置' : '该员工还没有飞书机器人配置，请先到员工详情的「集成」里保存'}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-dim)]">接收会话 ID</label>
                    <input
                      value={feishuChatId}
                      onChange={(e) => setFeishuChatId(e.target.value)}
                      placeholder="例如 oc_xxx / ou_xxx"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>
              )}

              {externalDelivery === 'weixin' && (
                <div className="space-y-3 border-t border-[var(--border)] pt-3">
                  <div className={`rounded-lg border px-3 py-2 text-xs ${hasWeixinConfig ? 'border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] text-[var(--success)]' : 'border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] text-[var(--warning)]'}`}>
                    {hasWeixinConfig ? '已读取到该员工的微信接入配置' : '该员工还没有微信接入配置，请先到员工详情的「集成」里保存'}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-dim)]">接收对象 ID</label>
                    <input
                      value={weixinChatId}
                      onChange={(e) => setWeixinChatId(e.target.value)}
                      placeholder="wxid_xxx / filehelper / xxx@chatroom"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>
              )}

              {externalDelivery === 'dingtalk' && (
                <div className="space-y-3 border-t border-[var(--border)] pt-3">
                  <div className={`rounded-lg border px-3 py-2 text-xs ${hasDingtalkConfig ? 'border-[rgba(34,197,94,0.25)] bg-[rgba(34,197,94,0.08)] text-[var(--success)]' : 'border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.08)] text-[var(--warning)]'}`}>
                    {hasDingtalkConfig ? '已读取到该员工的钉钉机器人配置' : '该员工还没有钉钉机器人配置，请先到员工详情的「集成」里保存'}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-dim)]">接收会话 ID</label>
                    <input
                      value={dingtalkChatId}
                      onChange={(e) => setDingtalkChatId(e.target.value)}
                      placeholder="例如 cid_xxx / openConversationId"
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>
              )}

              {loadingDeliveryConfig && (
                <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-dim)]">
                  <Loader2 size={12} className="animate-spin" /> 正在读取该 agent 的投递配置
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-dim)]">
              外部凭据在员工详情的「集成」里维护；这里仅选择本次日程是否额外投递到飞书、微信或钉钉。
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={handleCreate}
            disabled={creating || !selectedEmployee || !schedule.trim() || !prompt.trim()}
            className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {creating ? '创建中...' : lexicon.schedule.createSchedule}
          </button>
          <button
            onClick={onCancel}
            className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            取消
          </button>
        </div>
      </div>
    </div>
  )
}
