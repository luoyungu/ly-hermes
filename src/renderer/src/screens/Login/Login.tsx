import { useState, useEffect, type FormEvent } from 'react'
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import logoImg from '../../assets/logo.png'
import loginBg from '../../assets/login-bg.jpg'
import WindowControls from '../../components/WindowControls'
import { useTheme } from '../../components/ThemeProvider'

interface LoginProps {
  onSuccess: () => void
}

export default function Login({ onSuccess }: LoginProps): React.ReactElement {
  const { lexicon, resolvedMode } = useTheme()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isDark = resolvedMode === 'dark'
  const [appVersion, setAppVersion] = useState('')

  useEffect(() => {
    window.hermesAPI.getAppVersion().then(v => setAppVersion(v)).catch(() => {})
  }, [])

  const handleSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (!password.trim()) return

    setLoading(true)
    setError('')

    try {
      const result = await window.hermesAPI.authLogin(password)
      if (result.success) {
        onSuccess()
      } else {
        setError(result.error || '认证失败')
      }
    } catch {
      setError('连接错误')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full items-center justify-center relative overflow-hidden" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="absolute top-0 right-0 z-50" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <WindowControls />
      </div>
      <img
        src={loginBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: isDark ? 'brightness(0.55) saturate(1.2)' : 'brightness(0.7) saturate(0.9)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: isDark
            ? 'linear-gradient(180deg, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%), radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124,106,239,0.08), transparent)'
            : 'linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.3) 100%), radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124,106,239,0.06), transparent)'
        }}
      />

      <div
        className="relative border rounded-[var(--radius-xl)] w-[420px] text-center animate-slide-up"
        style={{
          padding: '48px 44px 44px',
          WebkitAppRegion: 'no-drag',
          background: isDark
            ? 'rgba(13,13,15,0.5)'
            : 'rgba(255,255,255,0.55)',
          backdropFilter: 'blur(32px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(32px) saturate(1.5)',
          borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
          boxShadow: isDark
            ? '0 24px 80px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)'
            : '0 24px 80px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6)',
        } as React.CSSProperties}
      >
        <div
          className="mx-auto mb-5"
          style={{
            width: 140,
            height: 140,
            borderRadius: 32,
            overflow: 'hidden',
            boxShadow: isDark
              ? '0 8px 32px rgba(124,106,239,0.2), 0 2px 8px rgba(0,0,0,0.3)'
              : '0 8px 32px rgba(124,106,239,0.15), 0 2px 8px rgba(0,0,0,0.08)',
          }}
        >
          <img
            src={logoImg}
            alt="落云.Hermes"
            className="w-full h-full object-cover"
          />
        </div>
        <h1
          className="text-accent-gradient mb-1.5"
          style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-0.5px' }}
        >
          落云.Hermes
        </h1>
        <p className="text-[var(--text-dim)] mb-9" style={{ fontSize: 13.5 }}>
          {lexicon.appSubtitle}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 14 }}>
          <div className="relative">
            <Lock
              size={15}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)] opacity-40 pointer-events-none"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码解锁"
              autoFocus
              disabled={loading}
              className="w-full border rounded-xl text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              style={{
                padding: '13px 44px',
                fontSize: 14.5,
                background: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-1"
            >
              {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
            </button>
          </div>

          {error && (
            <p className="text-[var(--danger)]" style={{ fontSize: 12.5, minHeight: 18 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-accent-gradient text-white border-none font-semibold rounded-xl cursor-pointer transition-all hover:opacity-90 hover:shadow-[0_4px_16px_rgba(124,106,239,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{ padding: '14px 0', fontSize: 15 }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={17} className="animate-spin" />
                解锁中...
              </span>
            ) : (
              '进入落云'
            )}
          </button>
        </form>

        <p className="text-[var(--text-dim)]" style={{ marginTop: 28, fontSize: 11, opacity: 0.35 }}>
          落云.Hermes{appVersion ? ` v${appVersion}` : ''}
        </p>
      </div>
    </div>
  )
}
