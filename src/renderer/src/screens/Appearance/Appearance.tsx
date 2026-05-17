import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Upload,
  X,
  Check,
  Loader2,
  Save,
  Palette,
  Image
} from 'lucide-react'
import { useTheme, ALL_THEMES } from '../../components/ThemeProvider'
import type { ThemeName } from '../../../../preload/index'
import { showToast } from '../../App'

const THEME_META: Record<ThemeName, { name: string; bg: string; accent: string; accent2: string; text: string }> = {
  dark: { name: '暗夜', bg: '#0d0d0f', accent: '#7c6aef', accent2: '#5b8def', text: '#e4e4e7' },
  light: { name: '明亮', bg: '#f5f5f7', accent: '#6c5ce7', accent2: '#4f8bef', text: '#1d1d1f' },
  ocean: { name: '深海', bg: '#0a1628', accent: '#4a9ed6', accent2: '#3ab0c2', text: '#d4e4f0' },
  'ocean-light': { name: '浅海', bg: '#eef5fa', accent: '#2e7eb8', accent2: '#2a9aaa', text: '#1e3a54' },
  forest: { name: '森林', bg: '#0e1a12', accent: '#4a9e5c', accent2: '#3a9080', text: '#d2e4d6' },
  'forest-light': { name: '翠林', bg: '#eef5f0', accent: '#2e7e3e', accent2: '#2a8a7a', text: '#1e3a24' },
  sunset: { name: '落日', bg: '#1a1410', accent: '#d08040', accent2: '#c86050', text: '#e8ddd0' },
  'sunset-light': { name: '暖阳', bg: '#f8f0e8', accent: '#b87030', accent2: '#c05848', text: '#3a2818' },
  lavender: { name: '薰衣草', bg: '#16121e', accent: '#9080c8', accent2: '#7878c0', text: '#ddd4e8' },
  'lavender-light': { name: '浅紫', bg: '#f2eef6', accent: '#7060a8', accent2: '#6068a8', text: '#2e2240' },
  midnight: { name: '午夜', bg: '#0c0c18', accent: '#7878c0', accent2: '#6868b0', text: '#c8c8dc' },
  rose: { name: '玫瑰', bg: '#1a1218', accent: '#c87090', accent2: '#d0a070', text: '#e4d4dc' },
  'rose-light': { name: '粉黛', bg: '#f6eef2', accent: '#a85878', accent2: '#b89060', text: '#3a2030' },
  slate: { name: '石板', bg: '#111318', accent: '#7a8a9e', accent2: '#5c6a7e', text: '#cdd2da' }
}

interface WallpaperItem {
  id: string
  name: string
  url: string
  gradient?: string
}

const WALLPAPERS: WallpaperItem[] = [
  { id: 'none', name: '无壁纸', url: '', gradient: '' },
  { id: 'starry', name: '星空', url: '', gradient: 'radial-gradient(ellipse at 20% 50%, #1a1a4e 0%, transparent 50%), radial-gradient(ellipse at 80% 20%, #2d1b69 0%, transparent 40%), radial-gradient(ellipse at 50% 80%, #0c0c2e 0%, transparent 60%), linear-gradient(135deg, #0c0c2e, #1a1a4e, #2d1b69, #0f0c29)' },
  { id: 'mountain', name: '山峦', url: '', gradient: 'linear-gradient(180deg, #1a1a2e 0%, #2c3e50 30%, #4a6741 50%, #8b6914 75%, #d4a017 100%)' },
  { id: 'ocean', name: '海洋', url: '', gradient: 'linear-gradient(180deg, #0a1628 0%, #0d3b66 30%, #1a6b8a 60%, #0a3d62 100%)' },
  { id: 'forest', name: '密林', url: '', gradient: 'radial-gradient(ellipse at 30% 40%, #1a3a1a 0%, transparent 50%), radial-gradient(ellipse at 70% 60%, #2d5a27 0%, transparent 40%), linear-gradient(135deg, #0a1a0a, #1a3a1a, #2d5a27, #0d2b0d)' },
  { id: 'city', name: '都市', url: '', gradient: 'linear-gradient(135deg, #1a0a2e 0%, #2d1b69 30%, #e91e63 60%, #0c0c1d 100%)' },
  { id: 'aurora', name: '极光', url: '', gradient: 'linear-gradient(180deg, #0a0a2e 0%, #1a4a3a 30%, #2ecc71 50%, #8e44ad 80%, #0a0a2e 100%)' },
  { id: 'sunset', name: '晚霞', url: '', gradient: 'linear-gradient(180deg, #1a0a04 0%, #c0392b 30%, #e67e22 60%, #f39c12 100%)' },
  { id: 'abstract', name: '抽象', url: '', gradient: 'conic-gradient(from 45deg at 50% 50%, #1a0a2e, #6c3483, #2e86c1, #1a5276, #1a0a2e)' },
  { id: 'sakura', name: '樱花', url: '', gradient: 'radial-gradient(ellipse at 30% 30%, #d4a0a0 0%, transparent 40%), radial-gradient(ellipse at 70% 70%, #6b3a5d 0%, transparent 40%), linear-gradient(135deg, #1a0f14, #6b3a5d, #d4a0a0, #1a0f14)' },
  { id: 'desert', name: '沙漠', url: '', gradient: 'linear-gradient(180deg, #0a0a1a 0%, #1a1a3e 30%, #c19a6b 70%, #8b7355 100%)' }
]

type Section = 'theme' | 'wallpaper'

export default function Appearance(): React.ReactElement {
  const { theme, setTheme } = useTheme()
  const [section, setSection] = useState<Section>('theme')
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<'idle' | 'success' | 'error'>('idle')

  const [selectedTheme, setSelectedTheme] = useState<ThemeName>(theme)
  const [selectedWallpaper, setSelectedWallpaper] = useState('none')
  const [wallpaperOpacity, setWallpaperOpacity] = useState(85)
  const [wallpaperBlur, setWallpaperBlur] = useState(40)

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [customWallpaperUrl, setCustomWallpaperUrl] = useState('')

  const applyWallpaper = useCallback((wpId: string, opacity: number, blur: number, customUrl?: string) => {
    const layer = document.getElementById('wallpaperLayer')
    const overlay = document.getElementById('wallpaperOverlay')
    if (!layer || !overlay) return
    const wp = WALLPAPERS.find((w) => w.id === wpId)
    if (wpId === 'custom' && (customUrl || customWallpaperUrl)) {
      const url = customUrl || customWallpaperUrl
      layer.style.background = ''
      if (url.startsWith('data:')) {
        layer.style.backgroundImage = `url(${url})`
      } else {
        layer.style.backgroundImage = `url(wallpaper://${url})`
      }
      layer.style.backgroundSize = 'cover'
      layer.style.backgroundPosition = 'center'
      layer.style.opacity = '1'
    } else if (wp?.gradient) {
      layer.style.backgroundImage = ''
      layer.style.background = wp.gradient
      layer.style.opacity = '1'
    } else {
      layer.style.background = ''
      layer.style.opacity = '0'
    }
    if (wpId !== 'none') {
      const overlayOpacity = Math.max(0, Math.min(1, 1 - opacity / 100))
      overlay.style.opacity = overlayOpacity.toFixed(2)
      const blurVal = `blur(${blur}px) saturate(180%)`
      overlay.style.backdropFilter = blurVal
      ;(overlay.style as unknown as Record<string, string>).webkitBackdropFilter = blurVal
    } else {
      overlay.style.opacity = '0'
      overlay.style.backdropFilter = ''
      ;(overlay.style as unknown as Record<string, string>).webkitBackdropFilter = ''
    }
  }, [customWallpaperUrl])

  useEffect(() => {
    window.hermesAPI.getAppConfig().then(async (config) => {
      const c = config as unknown as Record<string, Record<string, unknown>>
      const u = c.ui || {}
      const savedTheme = (u.theme as ThemeName) || 'dark'
      const savedWallpaper = (u.wallpaper as string) || 'none'
      const savedOpacity = (u.wallpaper_opacity as number) || 85
      const savedBlur = (u.wallpaper_blur as number) || 40
      let savedCustomUrl = (u.wallpaper_custom_url as string) || ''
      if (savedCustomUrl && savedCustomUrl.startsWith('data:')) {
        try {
          const result = await window.hermesAPI.saveWallpaperFile(savedCustomUrl)
          if (result.success && result.path) {
            savedCustomUrl = result.path
          }
        } catch { /* keep old data url */ }
      }
      setSelectedTheme(savedTheme)
      setSelectedWallpaper(savedWallpaper)
      setWallpaperOpacity(savedOpacity)
      setWallpaperBlur(savedBlur)
      if (savedCustomUrl) setCustomWallpaperUrl(savedCustomUrl)
      setTimeout(() => {
        applyWallpaper(savedWallpaper, savedOpacity, savedBlur, savedCustomUrl)
      }, 100)
    }).catch(() => {})
  }, [applyWallpaper])

  useEffect(() => {
    setSelectedTheme(theme)
  }, [theme])

  const handleThemeSelect = useCallback((t: ThemeName) => {
    setSelectedTheme(t)
    document.documentElement.classList.add('theme-transitioning')
    setTheme(t)
    setTimeout(() => {
      document.documentElement.classList.remove('theme-transitioning')
    }, 500)
  }, [setTheme])

  const handleWallpaperSelect = useCallback((wpId: string) => {
    setSelectedWallpaper(wpId)
    applyWallpaper(wpId, wallpaperOpacity, wallpaperBlur)
  }, [applyWallpaper, wallpaperOpacity, wallpaperBlur])

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string
      try {
        const result = await window.hermesAPI.saveWallpaperFile(dataUrl)
        if (result.success && result.path) {
          setCustomWallpaperUrl(result.path)
          setSelectedWallpaper('custom')
          applyWallpaper('custom', wallpaperOpacity, wallpaperBlur, result.path)
        } else {
          showToast('壁纸保存失败: ' + (result.error || '未知错误'), 'error')
        }
      } catch {
        showToast('壁纸保存失败', 'error')
      }
    }
    reader.readAsDataURL(file)
  }, [applyWallpaper, wallpaperOpacity, wallpaperBlur])

  const handleClearWallpaper = useCallback(() => {
    setSelectedWallpaper('none')
    setCustomWallpaperUrl('')
    applyWallpaper('none', wallpaperOpacity, wallpaperBlur)
  }, [applyWallpaper, wallpaperOpacity, wallpaperBlur])

  const handleSave = async (): Promise<void> => {
    setSaving(true)
    setSaveResult('idle')
    try {
      const currentConfig = await window.hermesAPI.getAppConfig()
      const newConfig = { ...currentConfig }
      if (!newConfig.ui) newConfig.ui = {}
      ;(newConfig.ui as Record<string, unknown>).theme = selectedTheme
      ;(newConfig.ui as Record<string, unknown>).wallpaper = selectedWallpaper
      ;(newConfig.ui as Record<string, unknown>).wallpaper_opacity = wallpaperOpacity
      ;(newConfig.ui as Record<string, unknown>).wallpaper_blur = wallpaperBlur
      if (selectedWallpaper === 'custom' && customWallpaperUrl) {
        ;(newConfig.ui as Record<string, unknown>).wallpaper_custom_url = customWallpaperUrl
      }
      await window.hermesAPI.setAppConfig(newConfig)
      setSaveResult('success')
    } catch {
      setSaveResult('error')
    } finally {
      setSaving(false)
      setTimeout(() => setSaveResult('idle'), 2000)
    }
  }

  const sectionItems: { key: Section; label: string; icon: React.ReactNode }[] = [
    { key: 'theme', label: '主题', icon: <Palette size={16} /> },
    { key: 'wallpaper', label: '壁纸', icon: <Image size={16} /> }
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="drag-region flex items-center border-b border-[var(--border)] glass-medium shrink-0" style={{ paddingTop: 36, paddingBottom: 12, paddingLeft: 24 }}>
        <h2 style={{ fontSize: 17, fontWeight: 600 }}>外观</h2>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[180px] shrink-0 border-r border-[var(--border)] bg-[var(--bg-glass-light)] p-3">
          <h2 className="mb-4 px-2 text-sm font-semibold text-[var(--text-primary)]">外观</h2>
          <nav className="space-y-1">
            {sectionItems.map((s) => (
              <button
                key={s.key}
                onClick={() => setSection(s.key)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  section === s.key
                    ? 'bg-[var(--accent-glow)] text-[var(--accent)] font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                }`}
              >
                {s.icon}
                {s.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl p-6">
            {section === 'theme' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">主题换肤</h3>
                <div className="grid grid-cols-4 gap-3">
                  {ALL_THEMES.map((t) => {
                    const meta = THEME_META[t]
                    const isActive = selectedTheme === t
                    return (
                      <button
                        key={t}
                        onClick={() => handleThemeSelect(t)}
                        className={`group flex flex-col items-center gap-2.5 rounded-xl border-2 p-3 transition-all ${
                          isActive
                            ? 'border-[var(--accent)] bg-[var(--accent-glow)] shadow-[0_0_20px_var(--accent-glow)]'
                            : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--text-dim)]'
                        }`}
                      >
                        <div
                          className="relative h-14 w-full overflow-hidden rounded-lg"
                          style={{ background: meta.bg }}
                        >
                          <div
                            className="absolute left-2 top-2 h-3 w-3 rounded-full"
                            style={{ background: meta.accent }}
                          />
                          <div
                            className="absolute bottom-2 left-6 right-2 h-1.5 rounded-full"
                            style={{ background: meta.accent2 }}
                          />
                          <div
                            className="absolute right-2 top-2 h-2 w-2 rounded-full opacity-50"
                            style={{ background: meta.text }}
                          />
                          {isActive && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                              <Check size={18} className="text-white" />
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]">
                          {meta.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            {section === 'wallpaper' && (
              <section className="animate-fade-in">
                <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">壁纸管理</h3>

                <div className="mb-5 space-y-4 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5">
                  <div className="flex gap-3">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      <Upload size={14} /> 上传壁纸
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <button
                      onClick={handleClearWallpaper}
                      className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-4 py-2 text-sm text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                      <X size={14} /> 移除壁纸
                    </button>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm text-[var(--text-secondary)]">不透明度</label>
                      <span className="text-xs font-mono text-[var(--text-dim)]">{wallpaperOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={wallpaperOpacity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setWallpaperOpacity(v)
                        if (selectedWallpaper !== 'none') applyWallpaper(selectedWallpaper, v, wallpaperBlur)
                      }}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm text-[var(--text-secondary)]">模糊度</label>
                      <span className="text-xs font-mono text-[var(--text-dim)]">{wallpaperBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={40}
                      value={wallpaperBlur}
                      onChange={(e) => {
                        const v = parseInt(e.target.value, 10)
                        setWallpaperBlur(v)
                        if (selectedWallpaper !== 'none') applyWallpaper(selectedWallpaper, wallpaperOpacity, v)
                      }}
                      className="w-full accent-[var(--accent)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-3">
                  {WALLPAPERS.map((wp) => {
                    const isActive = selectedWallpaper === wp.id
                    return (
                      <button
                        key={wp.id}
                        onClick={() => handleWallpaperSelect(wp.id)}
                        className={`group relative flex flex-col items-center overflow-hidden rounded-xl border-2 transition-all ${
                          isActive
                            ? 'border-[var(--accent)] shadow-[0_0_16px_var(--accent-glow)]'
                            : 'border-[var(--border)] hover:border-[var(--text-dim)]'
                        }`}
                      >
                        <div
                          className="h-16 w-full"
                          style={
                            wp.gradient
                              ? { background: wp.gradient }
                              : { background: 'var(--bg-surface)' }
                          }
                        />
                        {wp.id !== 'none' && (
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent px-2 pb-1.5 pt-4">
                            <span className="text-[10px] font-medium text-white">{wp.name}</span>
                          </div>
                        )}
                        {isActive && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                            <Check size={18} className="text-white" />
                          </div>
                        )}
                        {wp.id === 'none' && (
                          <span className="py-1.5 text-[10px] text-[var(--text-dim)]">无壁纸</span>
                        )}
                      </button>
                    )
                  })}
                </div>
              </section>
            )}

            <div className="mt-8 flex items-center gap-3 border-t border-[var(--border)] pt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : saveResult === 'success' ? (
                  <Check size={16} />
                ) : saveResult === 'error' ? (
                  <X size={16} />
                ) : (
                  <Save size={16} />
                )}
                {saving ? '保存中...' : saveResult === 'success' ? '✓ 已保存' : saveResult === 'error' ? '保存失败' : '保存设置'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
