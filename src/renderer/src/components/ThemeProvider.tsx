import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import type { ThemeMode, AccentColor } from '../../../preload/index'

type ResolvedMode = 'dark' | 'light'

interface ThemeContextValue {
  mode: ThemeMode
  accent: AccentColor
  resolvedMode: ResolvedMode
  setMode: (mode: ThemeMode) => void
  setAccent: (accent: AccentColor) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  accent: 'violet',
  resolvedMode: 'dark',
  setMode: () => {},
  setAccent: () => {}
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

function applyToDOM(resolvedMode: ResolvedMode, accent: AccentColor): void {
  document.documentElement.setAttribute('data-mode', resolvedMode)
  document.documentElement.setAttribute('data-accent', accent)
}

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [mode, setModeState] = useState<ThemeMode>('dark')
  const [accent, setAccentState] = useState<AccentColor>('violet')
  const [resolvedMode, setResolvedMode] = useState<ResolvedMode>('dark')

  useEffect(() => {
    Promise.all([
      window.hermesAPI.getThemeMode(),
      window.hermesAPI.getAccentColor()
    ]).then(([savedMode, savedAccent]) => {
      const m = (savedMode || 'dark') as ThemeMode
      const a = (savedAccent || 'violet') as AccentColor
      setModeState(m)
      setAccentState(a)
      const r = resolveMode(m)
      setResolvedMode(r)
      applyToDOM(r, a)
    }).catch(() => {
      applyToDOM('dark', 'violet')
    })
  }, [])

  useEffect(() => {
    if (mode !== 'auto') return
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (): void => {
      const r = getSystemMode()
      setResolvedMode(r)
      applyToDOM(r, accent)
    }
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [mode, accent])

  const setMode = useCallback((newMode: ThemeMode) => {
    setModeState(newMode)
    const r = resolveMode(newMode)
    setResolvedMode(r)
    applyToDOM(r, accent)
    window.hermesAPI.setThemeMode(newMode).catch(() => {})
  }, [accent])

  const setAccent = useCallback((newAccent: AccentColor) => {
    setAccentState(newAccent)
    applyToDOM(resolvedMode, newAccent)
    window.hermesAPI.setAccentColor(newAccent).catch(() => {})
  }, [resolvedMode])

  return (
    <ThemeContext.Provider value={{ mode, accent, resolvedMode, setMode, setAccent }}>
      {children}
    </ThemeContext.Provider>
  )
}
