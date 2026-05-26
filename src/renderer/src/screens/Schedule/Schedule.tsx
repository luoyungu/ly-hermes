import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { translateError } from '../../../../shared/i18n'
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

const getSchedulePresets = (t: TFunction) => [
  { label: t('schedule.presetEvery30m'), value: 'every 30m' },
  { label: t('schedule.presetEvery1h'), value: 'every 1h' },
  { label: t('schedule.presetEvery2h'), value: 'every 2h' },
  { label: t('schedule.presetEvery6h'), value: 'every 6h' },
  { label: t('schedule.presetDaily9'), value: '0 9 * * *' },
  { label: t('schedule.presetDaily18'), value: '0 18 * * *' },
  { label: t('schedule.presetWeeklyMon9'), value: '0 9 * * 1' },
  { label: t('schedule.presetMonthly1st9'), value: '0 9 1 * *' },
]

type ExternalDelivery = 'none' | 'feishu' | 'weixin' | 'dingtalk'

const formatDeliverTarget = (deliver: string | undefined, t: TFunction): string => {
  if (!deliver) return ''
  return deliver.split(',').map(part => {
    const target = part.trim()
    if (target === 'local') return t('schedule.desktopHistory')
    if (target === 'origin') return t('schedule.originPlatform')
    if (target === 'feishu') return t('schedule.feishu')
    if (target === 'weixin') return t('schedule.weixin')
    if (target === 'dingtalk') return t('schedule.dingtalk')
    if (target.startsWith('feishu:')) return `${t('schedule.feishu')}:${target.slice('feishu:'.length)}`
    if (target.startsWith('weixin:')) return `${t('schedule.weixin')}:${target.slice('weixin:'.length)}`
    if (target.startsWith('dingtalk:')) return `${t('schedule.dingtalk')}:${target.slice('dingtalk:'.length)}`
    return target
  }).join(' + ')
}

function formatRelativeTime(d: string | null | undefined, t: TFunction): string {
  if (!d) return '-'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    const now = Date.now()
    const diff = date.getTime() - now
    if (Math.abs(diff) < 60000) return t('schedule.relativeJustNow')
    const absDiff = Math.abs(diff)
    const isFuture = diff > 0
    if (absDiff < 3600000) {
      const mins = Math.floor(absDiff / 60000)
      return isFuture ? t('schedule.relativeMinutesLater', { count: mins }) : t('schedule.relativeMinutesAgo', { count: mins })
    }
    if (absDiff < 86400000) {
      const hours = Math.floor(absDiff / 3600000)
      return isFuture ? t('schedule.relativeHoursLater', { count: hours }) : t('schedule.relativeHoursAgo', { count: hours })
    }
    const days = Math.floor(absDiff / 86400000)
    return isFuture ? t('schedule.relativeDaysLater', { count: days }) : t('schedule.relativeDaysAgo', { count: days })
  } catch {
    return d
  }
}

function formatFullDate(d: string | null | undefined, locale: string): string {
  if (!d) return '-'
  try {
    const date = new Date(d)
    if (isNaN(date.getTime())) return d
    return date.toLocaleString(locale, {
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
  const { t, i18n } = useTranslation()
  const locale = i18n.language === 'en' ? 'en' : 'zh-CN'
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
      showToast(t('schedule.pausedToast'))
      refreshJobs()
    } catch { showToast(t('schedule.pauseFailed'), 'error') }
  }

  const handleResume = async (jobId: string, profileName: string): Promise<void> => {
    try {
      await window.hermesAPI.resumeCronJob(jobId, profileName)
      showToast(t('schedule.resumedToast'))
      refreshJobs()
    } catch { showToast(t('schedule.resumeFailed'), 'error') }
  }

  const handleTrigger = async (jobId: string, profileName: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.triggerCronJob(jobId, profileName)
      if (result.success) {
        showToast(t('schedule.triggeredToast'))
      } else {
        showToast(translateError(result.output, t) || t('schedule.triggerFailed'), 'error')
      }
      refreshJobs()
    } catch { showToast(t('schedule.triggerFailed'), 'error') }
  }

  const handleFixDelivery = async (jobId: string, profileName: string): Promise<void> => {
    try {
      const result = await window.hermesAPI.updateCronJobDeliver(jobId, 'local', profileName)
      if (result.success) {
        showToast(t('schedule.fixedLocalToast'))
      } else {
        showToast(translateError(result.output, t) || t('schedule.fixFailed'), 'error')
      }
      refreshJobs()
    } catch { showToast(t('schedule.fixFailed'), 'error') }
  }

  const handleDelete = async (jobId: string, profileName: string): Promise<void> => {
    try {
      await window.hermesAPI.deleteCronJob(jobId, profileName)
      showToast(t('common.deleteSuccess'))
      refreshJobs()
    } catch { showToast(t('common.deleteFailed'), 'error') }
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
              <span className="text-[13px] font-medium">{t('schedule.all')}</span>
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
              <RefreshCw size={16} /> {t('common.refresh')}
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
                locale={locale}
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
          locale={locale}
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
  locale,
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
  locale: string
  showEmployee: boolean
  onClick: () => void
  onPause: () => void
  onResume: () => void
  onTrigger: () => void
  onFixDelivery: () => void
  onDelete: () => void
  onEdit: () => void
}): React.ReactElement {
  const { t } = useTranslation()
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
                  {job.enabled ? t('schedule.active') : t('schedule.paused')}
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
                    <span className="text-[var(--text-dim)]">{t('schedule.nextRun')}:</span>
                    <span className="text-[var(--text-secondary)] font-medium" title={formatFullDate(job.next_run_at, locale)}>{formatRelativeTime(job.next_run_at, t)}</span>
                  </div>
                )}
                {job.last_run_at && (
                  <div className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-[var(--text-dim)]">{t('schedule.lastRun')}:</span>
                    <span className="text-[var(--text-secondary)]" title={formatFullDate(job.last_run_at, locale)}>{formatRelativeTime(job.last_run_at, t)}</span>
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
                  <span className="flex-1">{t('schedule.deliveryFixHint')}</span>
                  <button
                    onClick={onFixDelivery}
                    className="rounded-md border border-[rgba(234,179,8,0.35)] px-2 py-1 text-[11px] font-medium hover:bg-[rgba(234,179,8,0.12)] cursor-pointer"
                  >
                    {t('schedule.deliveryFixBtn')}
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
            {job.enabled ? (
              <button onClick={onPause} title={t('schedule.pause')} className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] cursor-pointer transition-all">
                <Pause size={14} />
              </button>
            ) : (
              <button onClick={onResume} title={t('schedule.resume')} className="w-8 h-8 rounded-lg border border-[rgba(34,197,94,0.3)] flex items-center justify-center text-[var(--success)] hover:bg-[rgba(34,197,94,0.1)] cursor-pointer transition-all">
                <Play size={14} />
              </button>
            )}
            <button onClick={onTrigger} title={t('schedule.triggerNow')} className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] cursor-pointer transition-all">
              <Play size={14} />
            </button>
            <button onClick={onEdit} title={t('common.edit')} className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[var(--bg-hover)] hover:text-[var(--accent)] cursor-pointer transition-all">
              <Pencil size={14} />
            </button>
            <Popconfirm title={lexicon.schedule.deleteConfirm} onConfirm={onDelete}>
              <button title={t('common.delete')} className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)] cursor-pointer transition-all">
                <Trash2 size={14} />
              </button>
            </Popconfirm>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-1.5 py-2 border-t border-[var(--border)] text-[11px] text-[var(--text-dim)] opacity-0 group-hover:opacity-100 transition-opacity">
        <span>{t('schedule.clickForDetail')}</span>
        <ChevronRight size={12} />
      </div>
    </div>
  )
}

function JobDetail({
  job,
  lexicon,
  locale,
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
  locale: string
  showEmployee: boolean
  onClose: () => void
  onEdit: () => void
  onPause: () => void
  onResume: () => void
  onTrigger: () => void
  onDelete: () => void
  onFixDelivery: () => void
}): React.ReactElement {
  const { t } = useTranslation()
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
              {job.enabled ? t('schedule.active') : t('schedule.paused')}
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
                <span>{t('schedule.scheduleRule')}</span>
              </div>
              <div className="font-mono text-sm text-[var(--text-primary)]">{job.schedule_display || job.schedule}</div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Activity size={12} className="text-[var(--accent)]" />
                <span>{t('schedule.lastStatus')}</span>
              </div>
              <div className={`text-sm font-medium ${job.last_status ? (job.last_status === 'ok' || job.last_status === 'success' ? 'text-[var(--success)]' : 'text-[var(--danger)]') : 'text-[var(--text-dim)]'}`}>
                {job.last_status || t('schedule.notExecuted')}
              </div>
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Zap size={12} className="text-[var(--accent)]" />
                <span>{t('schedule.nextExecution')}</span>
              </div>
              <div className="text-sm text-[var(--text-primary)]" title={formatFullDate(job.next_run_at, locale)}>{formatRelativeTime(job.next_run_at, t)}</div>
              {job.next_run_at && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{formatFullDate(job.next_run_at, locale)}</div>}
            </div>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-3.5">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-1.5">
                <Clock size={12} className="text-[var(--text-dim)]" />
                <span>{t('schedule.lastExecution')}</span>
              </div>
              <div className="text-sm text-[var(--text-primary)]" title={formatFullDate(job.last_run_at, locale)}>{formatRelativeTime(job.last_run_at, t)}</div>
              {job.last_run_at && <div className="text-[11px] text-[var(--text-dim)] mt-0.5">{formatFullDate(job.last_run_at, locale)}</div>}
            </div>
          </div>

          {job.prompt && (
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
              <div className="flex items-center gap-2 text-[11px] text-[var(--text-dim)] mb-2">
                <FileText size={12} className="text-[var(--accent)]" />
                <span>{t('schedule.prompt')}</span>
              </div>
              <pre className="text-[13px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">{job.prompt}</pre>
            </div>
          )}

          {(hasDeliver || hasSkills || job.repeat || job.script) && (
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-lg)] p-4 space-y-3">
              <div className="text-[11px] text-[var(--text-dim)] font-medium">{t('schedule.configDetails')}</div>
              {hasDeliver && (
                <div className="flex items-center gap-2.5">
                  <Send size={14} className="text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">{t('schedule.deliverTarget')}</div>
                    <div className="text-[13px] text-[var(--text-primary)]">{formatDeliverTarget(job.deliver, t)}</div>
                  </div>
                </div>
              )}
              {hasSkills && (
                <div className="flex items-center gap-2.5">
                  <Brain size={14} className="text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">{t('schedule.skillsUsed')}</div>
                    <div className="text-[13px] text-[var(--text-primary)]">{job.skills}</div>
                  </div>
                </div>
              )}
              {job.repeat && (
                <div className="flex items-center gap-2.5">
                  <Repeat size={14} className="text-[var(--text-dim)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">{t('schedule.repeatExec')}</div>
                    <div className="text-[13px] text-[var(--text-primary)]">{job.repeat}</div>
                  </div>
                </div>
              )}
              {job.script && (
                <div className="flex items-center gap-2.5">
                  <FileText size={14} className="text-[var(--accent)] shrink-0" />
                  <div>
                    <div className="text-[11px] text-[var(--text-dim)]">{t('schedule.linkedScript')}</div>
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
                <span>{t('schedule.execError')}</span>
              </div>
              <pre className="text-[13px] text-[var(--danger)] whitespace-pre-wrap leading-relaxed">{job.last_error}</pre>
            </div>
          )}

          {deliveryNeedsFix && (
            <div className="rounded-[var(--radius-lg)] border border-[rgba(234,179,8,0.28)] bg-[rgba(234,179,8,0.06)] p-4">
              <div className="flex items-center gap-2 text-[11px] text-[var(--warning)] font-medium mb-2">
                <AlertCircle size={13} />
                <span>{t('schedule.deliveryIssue')}</span>
              </div>
              <p className="text-[13px] text-[var(--warning)] mb-3">{t('schedule.deliveryFixHint')}</p>
              <button
                onClick={onFixDelivery}
                className="rounded-[var(--radius)] border border-[rgba(234,179,8,0.35)] px-3 py-1.5 text-xs font-medium text-[var(--warning)] hover:bg-[rgba(234,179,8,0.12)] cursor-pointer"
              >
                {t('schedule.deliveryFixSave')}
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 px-6 py-4 border-t border-[var(--border)] shrink-0">
          <button
            onClick={onEdit}
            className="flex items-center gap-1.5 rounded-[var(--radius)] bg-accent-gradient px-4 py-2 text-sm font-medium text-white hover:opacity-90 cursor-pointer transition-all"
          >
            <Pencil size={14} /> {t('common.edit')}
          </button>
          {job.enabled ? (
            <button onClick={onPause} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all">
              <Pause size={14} /> {t('schedule.pause')}
            </button>
          ) : (
            <button onClick={onResume} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(34,197,94,0.3)] px-4 py-2 text-sm text-[var(--success)] hover:bg-[rgba(34,197,94,0.1)] cursor-pointer transition-all">
              <Play size={14} /> {t('schedule.resume')}
            </button>
          )}
          <button onClick={onTrigger} className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] cursor-pointer transition-all">
            <Play size={14} /> {t('schedule.triggerNow')}
          </button>
          <div className="flex-1" />
          <Popconfirm title={lexicon.schedule.deleteConfirm} onConfirm={onDelete}>
            <button className="flex items-center gap-1.5 rounded-[var(--radius)] border border-[rgba(239,68,68,0.25)] px-4 py-2 text-sm text-[var(--danger)] hover:bg-[rgba(239,68,68,0.1)] cursor-pointer transition-all">
              <Trash2 size={14} /> {t('common.delete')}
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
  const { t } = useTranslation()
  const schedulePresets = getSchedulePresets(t)
  const [name, setName] = useState(job.name || '')
  const [schedule, setSchedule] = useState(job.schedule || '')
  const [prompt, setPrompt] = useState(job.prompt || '')
  const [saving, setSaving] = useState(false)
  const [showPresets, setShowPresets] = useState(false)

  const handleSave = async (): Promise<void> => {
    if (!schedule.trim()) { showToast(t('schedule.enterScheduleRule'), 'error'); return }
    if (!prompt.trim()) { showToast(t('schedule.enterPrompt'), 'error'); return }
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
        showToast(t('common.saved'))
        onSaved()
      } else {
        showToast(translateError(result.output, t) || t('common.saveFailed'), 'error')
      }
    } catch { showToast(t('common.saveFailed'), 'error') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center">
      <div className="absolute inset-0 bg-[rgba(0,0,0,0.5)] backdrop-blur-sm" onClick={onCancel} />
      <div className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[90%] max-w-[560px] animate-scale-in shadow-[0_24px_80px_rgba(0,0,0,0.4)] max-h-[85vh] overflow-y-auto">
        <div className="flex justify-between items-center px-6 border-b border-[var(--border)] h-14">
          <h3 className="text-[17px] font-semibold tracking-[-0.2px]">{t('schedule.editSchedule')}</h3>
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
              placeholder={t('schedule.namePlaceholder')}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><Clock size={14} /> {t('schedule.scheduleRule')}</label>
            <div className="relative">
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder={t('schedule.schedulePlaceholder')}
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] pr-16"
              />
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                {t('schedule.presets')}
              </button>
              {showPresets && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl glass-heavy border border-[var(--border)] z-10 shadow-lg p-2 grid grid-cols-2 gap-1">
                  {schedulePresets.map(p => (
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
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('schedule.prompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lexicon.schedule.promptPlaceholder}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[100px] transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          {(job.deliver || job.repeat || job.skills || job.script || job.last_status) && (
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5 space-y-2">
              <div className="text-xs font-medium text-[var(--text-dim)] mb-1">{t('schedule.readonlyInfo')}</div>
              {job.deliver && (
                <div className="flex items-center gap-2 text-xs">
                  <Send size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--text-dim)]">{t('schedule.deliverLabel')}:</span>
                  <span className="text-[var(--text-secondary)]">{formatDeliverTarget(job.deliver, t)}</span>
                </div>
              )}
              {job.repeat && (
                <div className="flex items-center gap-2 text-xs">
                  <Repeat size={12} className="text-[var(--text-dim)]" />
                  <span className="text-[var(--text-dim)]">{t('schedule.execLabel')}:</span>
                  <span className="text-[var(--text-secondary)]">{job.repeat}</span>
                </div>
              )}
              {job.skills && (
                <div className="flex items-center gap-2 text-xs">
                  <Brain size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--text-dim)]">{t('schedule.skillsLabel')}:</span>
                  <span className="text-[var(--text-secondary)]">{job.skills}</span>
                </div>
              )}
              {job.script && (
                <div className="flex items-center gap-2 text-xs">
                  <FileText size={12} className="text-[var(--accent)]" />
                  <span className="text-[var(--text-dim)]">{t('schedule.scriptLabel')}:</span>
                  <code className="text-[var(--accent)] bg-[var(--accent-glow)] px-1.5 py-0.5 rounded text-[11px] font-mono">{job.script}</code>
                </div>
              )}
              {job.last_status && (
                <div className="flex items-center gap-2 text-xs">
                  <Activity size={12} className="text-[var(--text-dim)]" />
                  <span className="text-[var(--text-dim)]">{t('schedule.lastStatus')}:</span>
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
            {saving ? t('common.saving') : t('common.save')}
          </button>
          <button
            onClick={onCancel}
            className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            {t('common.cancel')}
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
  const { t } = useTranslation()
  const { uiTheme } = useTheme()
  const schedulePresets = getSchedulePresets(t)
  const isCultivation = uiTheme === 'cultivation'
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
        showToast(t('schedule.configureFeishuFirst'), 'error')
        return null
      }
      if (!chatId) {
        showToast(t('schedule.enterFeishuChatId'), 'error')
        return null
      }
      targets.push(`feishu:${chatId}`)
    }
    if (externalDelivery === 'weixin') {
      const chatId = weixinChatId.trim()
      if (!hasWeixinConfig) {
        showToast(t('schedule.configureWeixinFirst'), 'error')
        return null
      }
      if (!chatId) {
        showToast(t('schedule.enterWeixinTargetId'), 'error')
        return null
      }
      targets.push(`weixin:${chatId}`)
    }
    if (externalDelivery === 'dingtalk') {
      const chatId = dingtalkChatId.trim()
      if (!hasDingtalkConfig) {
        showToast(t('schedule.configureDingtalkFirst'), 'error')
        return null
      }
      if (!chatId) {
        showToast(t('schedule.enterDingtalkChatId'), 'error')
        return null
      }
      targets.push(`dingtalk:${chatId}`)
    }
    return targets.join(',')
  }

  const handleCreate = async (): Promise<void> => {
    if (!selectedEmployee) { showToast(t('manage.enterName', { entity: lexicon.entities.employee }), 'error'); return }
    if (!schedule.trim()) { showToast(t('schedule.enterScheduleRule'), 'error'); return }
    if (!prompt.trim()) { showToast(t('schedule.enterPrompt'), 'error'); return }
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
        showToast(translateError(result.output, t) || t('common.createFailed'), 'error')
      }
    } catch { showToast(t('common.createFailed'), 'error') }
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
              placeholder={isCultivation ? t('schedule.nameExampleCultivation') : t('schedule.nameExample')}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><Clock size={14} /> {t('schedule.scheduleRule')}</label>
            <div className="relative">
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder={t('schedule.schedulePlaceholder')}
                className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)] pr-16"
              />
              <button
                onClick={() => setShowPresets(!showPresets)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[var(--accent)] hover:underline cursor-pointer"
              >
                {t('schedule.presets')}
              </button>
              {showPresets && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-xl glass-heavy border border-[var(--border)] z-10 shadow-lg p-2 grid grid-cols-2 gap-1">
                  {schedulePresets.map(p => (
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
              {t('schedule.scheduleFormatHint')}
            </p>
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('schedule.prompt')}</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={lexicon.schedule.promptPlaceholder}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[100px] transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">{t('schedule.resultDelivery')}</label>
            <div className="glass-medium border border-[var(--border)] rounded-[var(--radius)] p-3.5 text-sm text-[var(--text-primary)] space-y-3">
              <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2">
                <div className="min-w-0">
                  <div className="font-medium">{t('schedule.desktopHistory')}</div>
                  <div className="text-[11px] text-[var(--text-dim)] truncate">
                    {t('schedule.desktopHistoryDesc', { name: currentEmployee?.displayName || selectedEmployee })}
                  </div>
                </div>
                <span className="rounded-full bg-[rgba(34,197,94,0.12)] px-2 py-0.5 text-[11px] font-medium text-[var(--success)]">{t('schedule.alwaysOn')}</span>
              </div>

              <div className="grid grid-cols-4 gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-1">
                {([
                  ['none', t('schedule.noExternal')],
                  ['feishu', t('schedule.feishu')],
                  ['weixin', t('schedule.weixin')],
                  ['dingtalk', t('schedule.dingtalk')],
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
                    {hasFeishuConfig ? t('schedule.feishuConfigOk') : t('schedule.feishuConfigMissing')}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-dim)]">{t('schedule.receiveChatId')}</label>
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
                    {hasWeixinConfig ? t('schedule.weixinConfigOk') : t('schedule.weixinConfigMissing')}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-dim)]">{t('schedule.receiveTargetId')}</label>
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
                    {hasDingtalkConfig ? t('schedule.dingtalkConfigOk') : t('schedule.dingtalkConfigMissing')}
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] text-[var(--text-dim)]">{t('schedule.receiveChatId')}</label>
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
                  <Loader2 size={12} className="animate-spin" /> {t('schedule.loadingDeliveryConfig')}
                </div>
              )}
            </div>
            <p className="mt-1.5 text-[11px] text-[var(--text-dim)]">
              {t('schedule.deliveryHint')}
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
            {creating ? t('common.creating') : lexicon.schedule.createSchedule}
          </button>
          <button
            onClick={onCancel}
            className="rounded-[var(--radius)] border border-[var(--border)] px-5 py-2.5 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] cursor-pointer"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}
