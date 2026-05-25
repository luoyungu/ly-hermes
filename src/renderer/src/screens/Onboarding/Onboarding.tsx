import { useState, useEffect, useCallback, useRef } from 'react'
import { Download, Check, ChevronRight, Eye, EyeOff, AlertCircle, Loader2, Server, Monitor } from 'lucide-react'
import logoImg from '../../assets/logo.png'
import loginBg from '../../assets/login-bg.jpg'
import { PROVIDER_PRESETS, PROVIDER_API_KEY_MAP } from '../../shared/employee-shared'
import { showToast } from '../../App'
import WindowControls from '../../components/WindowControls'

import type { DeploymentMode } from '../../../../preload/index'

interface InstallProgress {
  step: number
  totalSteps: number
  title: string
  detail: string
  log: string
}

interface OnboardingProps {
  onComplete: () => void
}

type Step = 'mode' | 'install' | 'apikey' | 'remote' | 'password'

const STAGE_LABELS = [
  '检查 Python',
  '检查 Git',
  '准备 Agent',
  '创建虚拟环境',
  '安装依赖',
  '完成设置',
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<Step>('mode')
  const [deploymentMode, setDeploymentMode] = useState<DeploymentMode | null>(null)
  const [installStatus, setInstallStatus] = useState<'checking' | 'not-installed' | 'installing' | 'installed' | 'error'>('checking')
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null)
  const [installLog, setInstallLog] = useState<string[]>([])
  const [installError, setInstallError] = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  const [provider, setProvider] = useState('deepseek')
  const [modelId, setModelId] = useState(PROVIDER_PRESETS.find(p => p.id === 'deepseek')?.models[0]?.id || '')
  const [apiKey, setApiKey] = useState('')

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [settingUp, setSettingUp] = useState(false)
  const [setupError, setSetupError] = useState('')

  const [remoteName, setRemoteName] = useState('')
  const [remoteHost, setRemoteHost] = useState('')
  const [remotePort, setRemotePort] = useState(8787)
  const [remoteToken, setRemoteToken] = useState('')
  const [remoteTesting, setRemoteTesting] = useState(false)
  const [remoteError, setRemoteError] = useState('')

  useEffect(() => {
    if (step === 'install') {
      checkInstall()
    }
  }, [step])

  useEffect(() => {
    const unsub = window.hermesAPI.onInstallProgress((p) => {
      setInstallProgress(p)
      if (p.detail) {
        setInstallLog(prev => [...prev, p.detail])
      }
    })
    return unsub
  }, [])

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [installLog])

  const checkInstall = useCallback(async () => {
    setInstallStatus('checking')
    try {
      const status = await window.hermesAPI.checkInstall()
      if (status.installed) {
        setInstallStatus('installed')
      } else {
        setInstallStatus('not-installed')
      }
    } catch {
      setInstallStatus('not-installed')
    }
  }, [])

  const handleInstall = useCallback(async () => {
    setInstallStatus('installing')
    setInstallLog([])
    setInstallError('')
    try {
      const result = await window.hermesAPI.startInstall()
      if (result.success) {
        setInstallStatus('installed')
      } else {
        setInstallError(result.error || '安装失败')
        setInstallStatus('error')
      }
    } catch (e: unknown) {
      setInstallError((e as Error).message || '安装失败')
      setInstallStatus('error')
    }
  }, [])

  const handleSaveApiKey = useCallback(async () => {
    try {
      const preset = PROVIDER_PRESETS.find(p => p.id === provider)
      const envInfo = PROVIDER_API_KEY_MAP[provider]
      if (!preset || !envInfo) return
      const savedModelId = modelId.trim() || preset.models[0]?.id || ''
      await window.hermesAPI.setModelConfig({
        model: savedModelId,
        provider: preset.id,
        baseUrl: preset.baseUrl,
      })
      await window.hermesAPI.addSavedModel(
        `${preset.label} · ${savedModelId}`,
        preset.id,
        savedModelId,
        preset.baseUrl,
        apiKey.trim()
      )
      if (apiKey.trim()) {
        const envObj: Record<string, string> = {}
        envObj[envInfo.envKey] = apiKey.trim()
        await window.hermesAPI.setEmployeeEnv('default', envObj)
      }
      setStep('password')
    } catch {
      showToast('API 密钥保存失败，可以稍后在设置中配置', 'error')
      setStep('password')
    }
  }, [apiKey, modelId, provider])

  const handleSkipApiKey = useCallback(async () => {
    try {
      const preset = PROVIDER_PRESETS.find(p => p.id === provider)
      if (preset) {
        const savedModelId = modelId.trim() || preset.models[0]?.id || ''
        if (savedModelId) {
          await window.hermesAPI.setModelConfig({
            model: savedModelId,
            provider: preset.id,
            baseUrl: preset.baseUrl,
          })
          await window.hermesAPI.addSavedModel(
            `${preset.label} · ${savedModelId}`,
            preset.id,
            savedModelId,
            preset.baseUrl,
            ''
          )
        }
      }
    } catch {
      /* 稍后可在设置中补全 */
    }
    setStep('password')
  }, [modelId, provider])

  const handleSelectMode = useCallback(async (mode: DeploymentMode) => {
    setDeploymentMode(mode)
    await window.hermesAPI.setDeploymentMode(mode)
    if (mode === 'local') {
      setStep('install')
    } else {
      setStep('remote')
    }
  }, [])

  const handleSaveRemote = useCallback(async () => {
    if (!remoteHost.trim() || !remoteToken.trim()) {
      setRemoteError('请填写主机地址和 API Token')
      return
    }
    setRemoteTesting(true)
    setRemoteError('')
    try {
      const result = await window.hermesAPI.saveRemoteConnection({
        name: remoteName.trim() || '远程节点',
        host: remoteHost.trim(),
        port: remotePort || 8787,
        api_token: remoteToken.trim(),
      })
      if (result.success) {
        setStep('password')
      } else {
        setRemoteError(result.error || '连接失败')
      }
    } catch (e: unknown) {
      setRemoteError((e as Error).message || '连接失败')
    } finally {
      setRemoteTesting(false)
    }
  }, [remoteHost, remoteName, remotePort, remoteToken])

  const handleSetupPassword = useCallback(async () => {
    if (password.length < 4) return
    if (password !== confirmPassword) return
    setSettingUp(true)
    setSetupError('')
    try {
      const result = await window.hermesAPI.authSetupPassword(password)
      if (result.success) {
        onComplete()
      } else {
        setSetupError(result.error || '设置密码失败')
      }
    } catch (e: unknown) {
      setSetupError((e as Error).message || '设置密码失败')
    } finally {
      setSettingUp(false)
    }
  }, [password, confirmPassword, onComplete])

  const localSteps: Step[] = ['install', 'apikey', 'password']
  const clientSteps: Step[] = ['remote', 'password']
  const activeSteps = deploymentMode === 'client_only' ? clientSteps : localSteps
  const currentStepIndex = step === 'mode'
    ? -1
    : activeSteps.indexOf(step)

  const installTotalSteps = installProgress?.totalSteps || STAGE_LABELS.length
  const selectedPreset = PROVIDER_PRESETS.find(p => p.id === provider)
  const selectedPresetModels = selectedPreset?.models || []
  const modelSelectValue = selectedPresetModels.some(m => m.id === modelId) ? modelId : '_custom'
  const isCustomModelId = modelSelectValue === '_custom'

  const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron')
  const isWindowsElectron = isElectron && navigator.userAgent.includes('Windows')

  return (
    <div
      data-mode="light"
      className="fixed inset-0 flex items-center justify-center overflow-hidden"
      style={{ background: 'var(--bg-primary)' }}
    >
      <img
        src={loginBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{ filter: 'brightness(0.92) saturate(0.95)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.35) 0%, rgba(245,245,247,0.75) 100%), radial-gradient(ellipse 80% 60% at 50% 40%, rgba(124,106,239,0.08), transparent 70%)',
        }}
      />
      {isWindowsElectron && <div className="drag-region absolute left-0 right-0 top-0 h-10 z-40" />}
      {isWindowsElectron && (
      <div className="absolute top-0 right-0 z-50" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <WindowControls />
      </div>
      )}
      <div className="relative w-full max-w-[480px] mx-4 animate-slide-up">
        <div className="text-center mb-8">
          <div className="mx-auto mb-4 w-24 h-24 rounded-2xl overflow-hidden" style={{ boxShadow: '0 8px 40px rgba(124,106,239,0.18), 0 2px 8px rgba(0,0,0,0.06)' }}>
            <img src={logoImg} alt="落云.Hermes" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-2xl font-bold text-accent-gradient" style={{ letterSpacing: '-0.5px' }}>欢迎使用 落云.Hermes</h1>
          <p className="text-sm text-[var(--text-secondary)] mt-2">让我们完成初始设置，开始你的 AI 之旅</p>
        </div>

        {step !== 'mode' && (
          <div className="flex items-center justify-center gap-2 mb-8">
            {activeSteps.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                  i < currentStepIndex ? 'bg-[var(--accent)] text-white' :
                  i === currentStepIndex ? 'bg-[var(--accent)] text-white ring-4 ring-[var(--accent-glow)]' :
                  'bg-[var(--bg-surface)] text-[var(--text-dim)] border border-[var(--border)]'
                }`}>
                  {i < currentStepIndex ? <Check size={14} /> : i + 1}
                </div>
                {i < activeSteps.length - 1 && <div className={`w-8 h-0.5 rounded ${i < currentStepIndex ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'}`} />}
              </div>
            ))}
          </div>
        )}

        <div className="glass-medium border border-[var(--border)] rounded-[var(--radius-xl)] p-6 min-h-[320px] flex flex-col" style={{
          boxShadow: '0 16px 64px rgba(0,0,0,0.08)'
        }}>
          {step === 'mode' && (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">选择使用方式</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">本机运行 AI 员工，或连接远程 Hermes 节点</p>
              <div className="flex-1 flex flex-col gap-3">
                <button
                  onClick={() => handleSelectMode('local')}
                  className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left cursor-pointer hover:border-[var(--accent)] transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center shrink-0">
                    <Monitor size={22} className="text-[var(--accent)]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">本机模式</div>
                    <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">在本机安装并运行 Hermes Agent，可管理 AI 员工，也可开启远程连接供其他客户端访问。</p>
                  </div>
                </button>
                <button
                  onClick={() => handleSelectMode('client_only')}
                  className="flex items-start gap-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 text-left cursor-pointer hover:border-[var(--accent)] transition-colors"
                >
                  <div className="w-12 h-12 rounded-xl bg-[var(--accent-glow)] flex items-center justify-center shrink-0">
                    <Server size={22} className="text-[var(--accent)]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-[var(--text-primary)]">远程客户端</div>
                    <p className="mt-1 text-xs text-[var(--text-dim)] leading-relaxed">仅作为客户端连接一台远程 Hermes 节点，无需在本机安装 Agent。</p>
                  </div>
                </button>
              </div>
            </>
          )}

          {step === 'install' && (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">安装 Hermes Agent</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">Hermes Agent 是 AI 员工的运行引擎，需要先安装它</p>

              {installStatus === 'checking' && (
                <div className="flex-1 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-[var(--accent)]" />
                  <span className="ml-3 text-sm text-[var(--text-secondary)]">检测安装状态...</span>
                </div>
              )}

              {installStatus === 'not-installed' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[var(--accent-glow)] flex items-center justify-center">
                    <Download size={28} className="text-[var(--accent)]" />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] text-center">未检测到 Hermes Agent。Windows 下会自动检测并尝试安装 Python 3.12 与 Git。</p>
                  <div className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 text-xs leading-relaxed text-[var(--text-dim)]">
                    如果自动安装 Python 失败，请手动安装 Python 3.11+ 并勾选 Add python.exe to PATH；如果缺少 Git，安装器会优先通过 winget 静默安装 Git for Windows，失败时会降级为压缩包安装 Agent。
                  </div>
                  <button onClick={handleInstall} className="flex items-center gap-2 rounded-xl bg-accent-gradient px-6 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-all">
                    <Download size={16} /> 开始安装
                  </button>
                </div>
              )}

              {installStatus === 'installing' && (
                <div className="flex-1 flex flex-col">
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-[var(--text-primary)]">{installProgress?.title || '准备中...'}</span>
                      <span className="text-xs text-[var(--text-dim)]">{installProgress?.step || 0}/{installTotalSteps}</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-[var(--bg-surface)] overflow-hidden">
                      <div className="h-full rounded-full bg-accent-gradient transition-all duration-300" style={{ width: `${((installProgress?.step || 0) / installTotalSteps) * 100}%` }} />
                    </div>
                  </div>
                  <div className="flex gap-1.5 mb-3">
                    {STAGE_LABELS.map((label, i) => (
                      <div key={i} className={`flex-1 text-center text-[10px] py-1 rounded ${
                        i < (installProgress?.step || 0) - 1 ? 'text-[var(--accent)]' :
                        i === (installProgress?.step || 0) - 1 ? 'text-[var(--text-primary)] font-medium' :
                        'text-[var(--text-dim)]'
                      }`}>{label}</div>
                    ))}
                  </div>
                  <div
                    ref={logRef}
                    className="flex-1 min-h-[120px] max-h-[160px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 font-mono text-[11px] leading-relaxed text-[var(--text-secondary)]"
                  >
                    {installLog.map((line, i) => (
                      <div key={i} className="text-[var(--text-secondary)] break-words">{line}</div>
                    ))}
                    {!installLog.length && (
                      <div className="text-[var(--text-dim)] animate-pulse">
                        {installProgress?.detail || '等待安装输出...'}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {installStatus === 'installed' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[rgba(34,197,94,0.1)] flex items-center justify-center">
                    <Check size={28} className="text-[var(--success)]" />
                  </div>
                  <p className="text-sm text-[var(--text-secondary)]">Hermes Agent 已就绪</p>
                  <button onClick={() => setStep('apikey')} className="flex items-center gap-2 rounded-xl bg-accent-gradient px-6 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-all">
                    下一步 <ChevronRight size={16} />
                  </button>
                </div>
              )}

              {installStatus === 'error' && (
                <div className="flex-1 flex flex-col items-center justify-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[rgba(239,68,68,0.1)] flex items-center justify-center">
                    <AlertCircle size={28} className="text-[var(--danger)]" />
                  </div>
                  <p className="text-sm text-[var(--danger)] text-center">{installError || '安装失败'}</p>
                  {installError.includes('Python') && (
                    <div className="w-full rounded-lg border border-[rgba(239,68,68,0.25)] bg-[rgba(239,68,68,0.08)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                      安装好 Python 后无需重装客户端，直接点击“重试安装”即可继续安装 Hermes Agent。
                    </div>
                  )}
                  <button onClick={handleInstall} className="flex items-center gap-2 rounded-xl bg-accent-gradient px-6 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-all">
                    <Download size={16} /> 重试安装
                  </button>
                  <div className="mt-2 w-full">
                    <p className="text-xs text-[var(--text-dim)] mb-2 text-center">安装器已记录错误信息，可重试或到设置中查看日志：</p>
                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 font-mono text-[11px] text-[var(--text-secondary)] overflow-x-auto whitespace-pre-wrap break-words">
                      {installError || '请检查网络环境后重试安装'}
                    </div>
                  </div>
                </div>
              )}

              {installStatus !== 'installing' && (
                <div className="flex items-center mt-4">
                  <button onClick={() => setStep('mode')} className="text-sm text-[var(--text-dim)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
                    上一步
                  </button>
                </div>
              )}
            </>
          )}

          {step === 'apikey' && (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">配置 AI 模型</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">选择服务商、模型 ID 并填入 API 密钥，也可以稍后配置</p>

              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">服务商</label>
                  <select
                    value={provider}
                    onChange={(e) => {
                      const nextProvider = e.target.value
                      const nextPreset = PROVIDER_PRESETS.find(p => p.id === nextProvider)
                      setProvider(nextProvider)
                      setModelId(nextPreset?.models[0]?.id || '')
                    }}
                    className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] bg-transparent cursor-pointer"
                  >
                    {PROVIDER_PRESETS.map(p => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">模型 ID</label>
                  <select
                    value={modelSelectValue}
                    onChange={(e) => {
                      const nextModel = e.target.value
                      setModelId(nextModel === '_custom' ? '' : nextModel)
                    }}
                    className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)] bg-transparent cursor-pointer"
                  >
                    {selectedPresetModels.map(m => (
                      <option key={m.id} value={m.id}>{m.label} · {m.id}</option>
                    ))}
                    <option value="_custom">自定义模型 ID...</option>
                  </select>
                  {isCustomModelId && (
                    <input
                      type="text"
                      value={modelId}
                      onChange={(e) => setModelId(e.target.value)}
                      placeholder="输入模型 ID"
                      className="mt-2 w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  )}
                  <p className="mt-1.5 text-xs text-[var(--text-dim)]">
                    将写入配置：{modelId.trim() || selectedPresetModels[0]?.id || '未选择模型'}
                  </p>
                </div>

                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">
                    {PROVIDER_API_KEY_MAP[provider]?.label || 'API 密钥'}
                  </label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                <button onClick={() => setStep('mode')} className="text-sm text-[var(--text-dim)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
                  上一步
                </button>
                <div className="flex items-center gap-3">
                  <button onClick={handleSkipApiKey} className="text-sm text-[var(--text-dim)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
                    稍后配置
                  </button>
                  <button onClick={handleSaveApiKey} className="flex items-center gap-2 rounded-xl bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 transition-all">
                    下一步 <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          )}

          {step === 'remote' && (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">连接远程节点</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">输入远程 Hermes 节点的地址和 API Token</p>
              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">节点名称（可选）</label>
                  <input
                    type="text"
                    value={remoteName}
                    onChange={(e) => setRemoteName(e.target.value)}
                    placeholder="我的服务器"
                    className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">主机地址</label>
                    <input
                      type="text"
                      value={remoteHost}
                      onChange={(e) => setRemoteHost(e.target.value)}
                      placeholder="192.168.1.100"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                  <div className="w-28">
                    <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">端口</label>
                    <input
                      type="number"
                      value={remotePort}
                      onChange={(e) => setRemotePort(Number(e.target.value) || 8787)}
                      min={1024}
                      max={65535}
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--border-focus)]"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">API Token</label>
                  <input
                    type="password"
                    value={remoteToken}
                    onChange={(e) => setRemoteToken(e.target.value)}
                    placeholder="远程节点提供的 Token"
                    className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                  />
                </div>
                {remoteError && (
                  <p className="text-xs text-[var(--danger)]">{remoteError}</p>
                )}
              </div>
              <div className="flex items-center justify-between mt-6">
                <button onClick={() => setStep('mode')} className="text-sm text-[var(--text-dim)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors">
                  上一步
                </button>
                <button
                  onClick={handleSaveRemote}
                  disabled={remoteTesting || !remoteHost.trim() || !remoteToken.trim()}
                  className="flex items-center gap-2 rounded-xl bg-accent-gradient px-5 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {remoteTesting ? <Loader2 size={14} className="animate-spin" /> : null}
                  {remoteTesting ? '连接中...' : '测试并继续'} <ChevronRight size={16} />
                </button>
              </div>
            </>
          )}

          {step === 'password' && (
            <>
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-1">设置登录密码</h2>
              <p className="text-sm text-[var(--text-secondary)] mb-5">设置一个密码来保护你的 Hermes 桌面端</p>

              <div className="flex-1 flex flex-col gap-4">
                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">密码</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="至少 4 个字符"
                      className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)] pr-10"
                    />
                    <button onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-secondary)] cursor-pointer">
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="mb-1.5 text-sm text-[var(--text-secondary)] font-medium">确认密码</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入密码"
                    className="w-full glass-medium border border-[var(--border)] rounded-[var(--radius)] px-3.5 py-2.5 text-sm text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none focus:border-[var(--border-focus)]"
                  />
                  {confirmPassword && password !== confirmPassword && (
                    <p className="text-xs text-[var(--danger)] mt-1.5">两次密码不一致</p>
                  )}
                </div>
                {setupError && (
                  <p className="text-xs text-[var(--danger)]">{setupError}</p>
                )}
              </div>

              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setStep(deploymentMode === 'client_only' ? 'remote' : 'apikey')}
                  className="text-sm text-[var(--text-dim)] hover:text-[var(--text-secondary)] cursor-pointer transition-colors"
                >
                  上一步
                </button>
                <button
                  onClick={handleSetupPassword}
                  disabled={password.length < 4 || password !== confirmPassword || settingUp}
                  className="flex items-center gap-2 rounded-xl bg-accent-gradient px-6 py-2.5 text-sm font-medium text-white cursor-pointer hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {settingUp ? <Loader2 size={14} className="animate-spin" /> : null}
                  {settingUp ? '设置中...' : '完成设置'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
