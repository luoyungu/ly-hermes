import { useState, useEffect, useCallback, useRef } from 'react'
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
  UserPlus
} from 'lucide-react'
import type { EmployeeInfo } from '../../../../preload/index'
import { showToast } from '../../App'
import { mapStatus } from '../../shared/employee-shared'
import Popconfirm from '../../components/Popconfirm'

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
  last_error?: string | null
  profile?: string
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

export default function Schedule(): React.ReactElement {
  const [employees, setEmployees] = useState<EmployeeInfo[]>([])
  const [allJobs, setAllJobs] = useState<JobWithProfile[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
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
        } catch { /* skip this employee's jobs */ }
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
      await window.hermesAPI.triggerCronJob(jobId, profileName)
      showToast('已触发')
      refreshJobs()
    } catch { showToast('触发失败', 'error') }
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

  const activeCount = filteredJobs.filter(j => j.enabled).length
  const pausedCount = filteredJobs.filter(j => !j.enabled).length

  return (
    <div className="flex h-full flex-col">
      <div className="drag-region flex items-center justify-between border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: 36, paddingBottom: 12, paddingLeft: 24, paddingRight: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>日程</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="no-drag flex items-center gap-1.5 rounded-[var(--radius)] bg-accent-gradient px-3.5 py-1.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-all"
        >
          <Plus size={15} /> 新建日程
        </button>
      </div>

      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterEmployee('')}
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer transition-all ${!filterEmployee ? 'bg-[var(--accent-glow)] text-[var(--accent)] border border-[rgba(124,106,239,0.3)]' : 'text-[var(--text-dim)] hover:text-[var(--text-primary)] border border-transparent'}`}
          >
            全部 ({allJobs.length})
          </button>
          <span className="text-[var(--text-dim)] text-xs">活跃 {activeCount}</span>
          <span className="text-[var(--text-dim)] text-xs">·</span>
          <span className="text-[var(--text-dim)] text-xs">暂停 {pausedCount}</span>
        </div>
        <div className="flex-1" />
        {filterEmployee && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full glass-medium border border-[var(--border)] text-xs text-[var(--text-secondary)]">
            <span>{employees.find(e => e.name === filterEmployee)?.avatar}</span>
            <span>{employees.find(e => e.name === filterEmployee)?.displayName}</span>
            <button onClick={() => setFilterEmployee('')} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] cursor-pointer"><X size={12} /></button>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={28} className="animate-spin text-[var(--accent)]" />
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[var(--text-dim)]">
            <Calendar size={56} className="mb-4 opacity-20" />
            <p className="text-base font-medium text-[var(--text-secondary)] mb-1">
              {filterEmployee ? '该员工暂无日程' : '暂无日程任务'}
            </p>
            <p className="text-sm mb-5">创建日程让虚拟员工自动执行定时任务</p>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 cursor-pointer transition-all"
            >
              <Plus size={16} /> 创建日程
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJobs.map(job => (
              <JobCard
                key={job.profileName + ':' + job.id}
                job={job}
                showEmployee={!filterEmployee}
                onPause={() => handlePause(job.id, job.profileName)}
                onResume={() => handleResume(job.id, job.profileName)}
                onTrigger={() => handleTrigger(job.id, job.profileName)}
                onDelete={() => handleDelete(job.id, job.profileName)}
                onFilterByEmployee={() => setFilterEmployee(job.profileName)}
              />
            ))}
          </div>
        )}
      </div>

      {showCreate && (
        <CreateJob
          employees={employees}
          onCreated={() => { setShowCreate(false); refreshJobs() }}
          onCancel={() => setShowCreate(false)}
        />
      )}
    </div>
  )
}

function JobCard({
  job,
  showEmployee,
  onPause,
  onResume,
  onTrigger,
  onDelete,
  onFilterByEmployee
}: {
  job: JobWithProfile
  showEmployee: boolean
  onPause: () => void
  onResume: () => void
  onTrigger: () => void
  onDelete: () => void
  onFilterByEmployee: () => void
}): React.ReactElement {
  const formatDate = (d: string | null | undefined): string => {
    if (!d) return '-'
    try { return new Date(d).toLocaleString('zh-CN') } catch { return d }
  }

  return (
    <div className={`glass-medium border rounded-[var(--radius-lg)] p-4 transition-all hover:shadow-[0_2px_12px_rgba(0,0,0,0.08)] ${job.enabled ? 'border-[var(--border)]' : 'border-[var(--border)] opacity-55'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="flex flex-col items-center gap-1 pt-0.5">
            <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${job.enabled ? 'bg-[var(--success)] shadow-[0_0_6px_rgba(34,197,94,0.3)]' : 'bg-[var(--text-dim)]'}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="font-medium text-[var(--text-primary)]">{job.name || '未命名日程'}</span>
              {showEmployee && (
                <button
                  onClick={onFilterByEmployee}
                  className="flex items-center gap-1 px-2 py-0.5 rounded-full glass-medium border border-[var(--border)] text-[11px] text-[var(--text-dim)] hover:text-[var(--text-primary)] hover:border-[var(--accent)] cursor-pointer transition-all"
                >
                  <span className="text-xs">{job.employeeAvatar}</span>
                  <span>{job.employeeDisplayName}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-xs text-[var(--text-dim)]">
              <Clock size={12} />
              <span>{job.schedule_display || job.schedule}</span>
            </div>
            {job.prompt && (
              <p className="mt-2 text-xs text-[var(--text-secondary)] line-clamp-2 leading-relaxed">{job.prompt}</p>
            )}
            <div className="flex items-center gap-4 mt-2.5 text-[11px] text-[var(--text-dim)]">
              <span>下次: {formatDate(job.next_run_at)}</span>
              <span>上次: {formatDate(job.last_run_at)}</span>
            </div>
            {job.last_error && (
              <div className="flex items-start gap-1.5 mt-2 text-xs text-[var(--danger)]">
                <AlertCircle size={12} className="mt-0.5 shrink-0" />
                <span className="line-clamp-1">{job.last_error}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
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
            <RefreshCw size={14} />
          </button>
          <Popconfirm title="确认删除此日程？" onConfirm={onDelete}>
            <button title="删除" className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center text-[var(--text-dim)] hover:bg-[rgba(239,68,68,0.1)] hover:text-[var(--danger)] cursor-pointer transition-all">
              <Trash2 size={14} />
            </button>
          </Popconfirm>
        </div>
      </div>
    </div>
  )
}

function CreateJob({
  employees,
  onCreated,
  onCancel
}: {
  employees: EmployeeInfo[]
  onCreated: () => void
  onCancel: () => void
}): React.ReactElement {
  const [selectedEmployee, setSelectedEmployee] = useState<string>(employees[0]?.name || '')
  const [name, setName] = useState('')
  const [schedule, setSchedule] = useState('')
  const [prompt, setPrompt] = useState('')
  const [deliver, setDeliver] = useState('local')
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

  const handleCreate = async (): Promise<void> => {
    if (!selectedEmployee) { showToast('请选择员工', 'error'); return }
    if (!schedule.trim()) { showToast('请输入调度规则', 'error'); return }
    if (!prompt.trim()) { showToast('请输入提示词', 'error'); return }
    setCreating(true)
    try {
      const result = await window.hermesAPI.createCronJob({
        name: name.trim() || undefined,
        schedule: schedule.trim(),
        prompt: prompt.trim(),
        deliver: deliver || undefined,
        profile: selectedEmployee
      })
      if (result.success) {
        showToast('日程创建成功')
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
          <h3 className="text-[17px] font-semibold tracking-[-0.2px]">创建日程</h3>
          <button onClick={onCancel} className="text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium flex items-center gap-1.5"><UserPlus size={14} /> 选择员工</label>
            <div className="relative" ref={pickerRef}>
              <button
                onClick={() => setShowEmployeePicker(!showEmployeePicker)}
                className="flex items-center justify-between w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] cursor-pointer hover:border-[var(--accent)] transition-all"
              >
                <span className="flex items-center gap-2">
                  <span>{currentEmployee?.avatar || '🧑‍💼'}</span>
                  <span>{currentEmployee?.displayName || '选择员工'}</span>
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
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">日程名称</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如: 每日新闻摘要"
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
              placeholder="描述虚拟员工需要执行的任务..."
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none resize-none min-h-[100px] transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
            />
          </div>

          <div>
            <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">结果投递</label>
            <select
              value={deliver}
              onChange={(e) => setDeliver(e.target.value)}
              className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
            >
              <option value="local">本地保存</option>
              <option value="all">所有已连接平台</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-3 px-6 py-4 border-t border-[var(--border)]">
          <button
            onClick={handleCreate}
            disabled={creating || !selectedEmployee || !schedule.trim() || !prompt.trim()}
            className="flex items-center gap-2 rounded-[var(--radius)] bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
          >
            {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            {creating ? '创建中...' : '创建日程'}
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
