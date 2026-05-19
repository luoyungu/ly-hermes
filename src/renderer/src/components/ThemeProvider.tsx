import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { ThemeMode, AccentColor, UiTheme } from '../../../preload/index'
import { DEFAULT_UI_THEME, getThemePreset, type ThemeLexicon } from '../theme/presets'

type ResolvedMode = 'dark' | 'light'

interface ThemeContextValue {
  mode: ThemeMode
  accent: AccentColor
  uiTheme: UiTheme
  resolvedMode: ResolvedMode
  lexicon: ThemeLexicon
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentColor) => void
  setUiTheme: (theme: UiTheme) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  accent: 'violet',
  uiTheme: DEFAULT_UI_THEME,
  resolvedMode: 'dark',
  lexicon: getThemePreset(DEFAULT_UI_THEME).lexicon,
  setMode: () => {},
  setAccent: () => {},
  setUiTheme: () => {}
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

function getSystemMode(): ResolvedMode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function resolveMode(mode: ThemeMode): ResolvedMode {
  return mode === 'auto' ? getSystemMode() : mode
}

function applyToDOM(resolvedMode: ResolvedMode, accent: AccentColor, uiTheme: UiTheme): void {
  document.documentElement.setAttribute('data-mode', resolvedMode)
  document.documentElement.setAttribute('data-accent', accent)
  document.documentElement.setAttribute('data-ui-theme', uiTheme)
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [accent, setAccentState] = useState<AccentColor>('violet')
  const [uiTheme, setUiThemeState] = useState<UiTheme>(DEFAULT_UI_THEME)
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>('dark')
  const lexicon = getThemePreset(uiTheme).lexicon

  useEffect(() => {
    Promise.all([
      window.hermesAPI.getThemeMode(),
      window.hermesAPI.getAccentColor(),
      window.hermesAPI.getUiTheme()
    ]).then(([savedMode, savedAccent, savedUiTheme]) => {
      const m = (savedMode || 'dark') as ThemeMode
      const a = (savedAccent || 'violet') as AccentColor
      const t = (savedUiTheme || DEFAULT_UI_THEME) as UiTheme
      setModeState(m)
      setAccentState(a)
      setUiThemeState(t)
      const r = resolveMode(m)
      setResolvedMode(r)
      applyToDOM(r, a, t)
    }).catch(() => {
      applyToDOM('dark', 'violet', DEFAULT_UI_THEME)
    })
  }, [])

  useEffect(() => {
    applyToDOM(resolvedMode, accent, uiTheme)
  }, [accent, resolvedMode, uiTheme])

  useEffect(() => {
    if (mode !== 'auto') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => {
      const r = getSystemMode()
      setResolvedMode(r)
      applyToDOM(r, accent, uiTheme)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mode, accent, uiTheme])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    const r = resolveMode(newMode)
    setResolvedMode(r)
    applyToDOM(r, accent, uiTheme)
    window.hermesAPI.setThemeMode(newMode).catch(() => {})
  }, [accent, uiTheme])

  const setAccent = useCallback((newAccent: AccentColor) => {
    setAccentState(newAccent)
    applyToDOM(resolvedMode, newAccent, uiTheme)
    window.hermesAPI.setAccentColor(newAccent).catch(() => {})
  }, [resolvedMode, uiTheme])

  const setUiTheme = useCallback((newUiTheme: UiTheme) => {
    setUiThemeState(newUiTheme)
    applyToDOM(resolvedMode, accent, newUiTheme)
    window.hermesAPI.setUiTheme(newUiTheme).catch(() => {})
  }, [accent, resolvedMode])

  return (
    <ThemeContext.Provider value={{ mode, accent, uiTheme, resolvedMode, lexicon, setMode, setAccent, setUiTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
