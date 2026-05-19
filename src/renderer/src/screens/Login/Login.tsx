import { useState, type FormEvent } from 'react'
import { Lock, Eye, EyeOff, Loader2 } from 'lucide-react'
import logoImg from '../../assets/logo.png'
import loginBg from '../../assets/login-bg.jpg'
import WindowControls from '../../components/WindowControls'
import { useTheme } from '../../components/ThemeProvider'

interface LoginProps {
  onSuccess: () => void
}

export default function Login({ onSuccess }: LoginProps): React.ReactElement {
  const { lexicon } = useTheme()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

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
        style={{ filter: 'brightness(0.4)' }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 60% at 50% 50%, rgba(124,106,239,0.15), transparent)'
        }}
      />

      <div
        className="relative glass-heavy border border-[var(--border)] rounded-[var(--radius-xl)] w-[420px] text-center animate-slide-up shadow-[0_24px_80px_rgba(0,0,0,0.3)]"
        style={{ padding: '56px 48px 48px', WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <img
          src={logoImg}
          alt="落云.Hermes"
          className="block mx-auto mb-4"
          style={{ width: 120, height: 120, filter: 'drop-shadow(0 0 24px rgba(124,106,239,0.3))' }}
        />
        <h1
          className="text-accent-gradient mb-2"
          style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.5px' }}
        >
          落云.Hermes
        </h1>
        <p className="text-[var(--text-dim)] mb-10" style={{ fontSize: 14 }}>
          {lexicon.appSubtitle}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col" style={{ gap: 16 }}>
          <div className="relative">
            <Lock
              size={16}
              className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-dim)] opacity-40 pointer-events-none"
            />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="输入密码解锁"
              autoFocus
              disabled={loading}
              className="w-full glass-medium border border-[var(--border)] rounded-xl text-[var(--text-primary)] placeholder-[var(--text-dim)] outline-none transition-all focus:border-[var(--border-focus)] focus:shadow-[0_0_0_3px_var(--accent-glow)]"
              style={{ padding: '14px 44px', fontSize: 15 }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-dim)] hover:text-[var(--text-primary)] transition-colors p-1"
            >
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>

          {error && (
            <p className="text-[var(--danger)]" style={{ fontSize: 13, minHeight: 20 }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !password.trim()}
            className="w-full bg-accent-gradient text-white border-none font-semibold rounded-xl cursor-pointer transition-all hover:opacity-90 hover:shadow-[0_4px_16px_rgba(124,106,239,0.25)] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{ padding: '16px 0', fontSize: 16 }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 size={18} className="animate-spin" />
                解锁中...
              </span>
            ) : (
              '进入落云'
            )}
          </button>
        </form>

        <p className="text-[var(--text-dim)]" style={{ marginTop: 32, fontSize: 12, opacity: 0.4 }}>
          落云.Hermes v0.1.0
        </p>
      </div>
    </div>
  )
}
