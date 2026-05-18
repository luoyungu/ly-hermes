import { useCallback } from 'react'
import { Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from '../../components/ThemeProvider'
import type { ThemeMode, AccentColor } from '../../../../preload/index'

const MODE_OPTIONS: Array<{ value: ThemeMode; label: string; icon: React.ReactNode; desc: string }> = [
  { value: 'dark', label: '暗夜', icon: <Moon size={20} />, desc: '始终使用深色外观' },
  { value: 'light', label: '明亮', icon: <Sun size={20} />, desc: '始终使用浅色外观' },
  { value: 'auto', label: '跟随系统', icon: <Monitor size={20} />, desc: '自动匹配系统外观设置' },
]

const ACCENT_OPTIONS: Array<{ value: AccentColor; label: string; color: string }> = [
  { value: 'violet', label: '紫罗兰', color: '#7c6aef' },
  { value: 'indigo', label: '靛蓝', color: '#7878c0' },
  { value: 'blue', label: '海蓝', color: '#4a9ed6' },
  { value: 'green', label: '翠绿', color: '#4a9e5c' },
  { value: 'orange', label: '暖橙', color: '#d08040' },
  { value: 'lavender', label: '薰衣草', color: '#9080c8' },
  { value: 'rose', label: '玫瑰', color: '#c87090' },
  { value: 'slate', label: '石板灰', color: '#7a8a9e' },
]

export default function Appearance(): React.ReactElement {
  const { mode, accent, setMode, setAccent } = useTheme()

  const handleModeChange = useCallback((newMode: ThemeMode) => {
    document.documentElement.classList.add('theme-transitioning')
    setMode(newMode)
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning')
    }, 500)
  }, [setMode])

  const handleAccentChange = useCallback((newAccent: AccentColor) => {
    document.documentElement.classList.add('theme-transitioning')
    setAccent(newAccent)
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning')
    }, 500)
  }, [setAccent])

  return (
    <div className="flex h-full flex-col">
      <div className="drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: 36, paddingBottom: 12, paddingLeft: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>外观</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl p-6 space-y-8">

          <section>
            <h3 className="mb-4 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">模式</h3>
            <div className="grid grid-cols-3 gap-3">
              {MODE_OPTIONS.map((opt) => {
                const isActive = mode === opt.value
                return (
                  <button
                    key={opt.value}
                    onClick={() => handleModeChange(opt.value)}
                    className={`group flex flex-col items-center gap-3 rounded-xl border-2 p-5 transition-all cursor-pointer ${
                      isActive
                        ? 'border-[var(--accent)] bg-[var(--accent-glow)] shadow-[0_0_20px_var(--accent-glow)]'
                        : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--text-dim)]'
                    }`}
                  >
                    <div className={`flex h-12 w-12 items-center justify-center rounded-full transition-colors ${
                      isActive ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-hover)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]'
                    }`}>
                      {opt.icon}
                    </div>
                    <div className="text-center">
                      <div className={`text-sm font-medium ${isActive ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>
                        {opt.label}
                      </div>
                      <div className="mt-0.5 text-[11px] text-[var(--text-dim)] leading-snug">
                        {opt.desc}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          <section>
            <h3 className="mb-4 text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider">主题色</h3>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
              <div className="flex items-center gap-4 flex-wrap">
                {ACCENT_OPTIONS.map((opt) => {
                  const isActive = accent === opt.value
                  return (
                    <button
                      key={opt.value}
                      onClick={() => handleAccentChange(opt.value)}
                      className="group flex flex-col items-center gap-2 cursor-pointer"
                      title={opt.label}
                    >
                      <div className={`relative h-9 w-9 rounded-full transition-all ${
                        isActive ? 'ring-2 ring-offset-2 ring-offset-[var(--bg-surface)]' : 'hover:scale-110'
                      }`} style={{
                        backgroundColor: opt.color,
                        ['--tw-ring-color' as string]: opt.color,
                      }}>
                        {isActive && (
                          <svg className="absolute inset-0 h-full w-full text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className={`text-[10px] transition-colors ${
                        isActive ? 'text-[var(--text-primary)] font-medium' : 'text-[var(--text-dim)] group-hover:text-[var(--text-secondary)]'
                      }`}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </section>

        </div>
      </div>
    </div>
  )
}
