import { useState, useEffect, createContext, useContext, useCallback } from 'react'
import type { ThemeName } from '../../../preload/index'

interface ThemeContextValue {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: 'dark',
  setTheme: () => {}
})

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

const ALL_THEMES: ThemeName[] = ['dark', 'light', 'ocean', 'ocean-light', 'forest', 'forest-light', 'sunset', 'sunset-light', 'lavender', 'lavender-light', 'midnight', 'rose', 'rose-light', 'slate']

export { ALL_THEMES }

export function ThemeProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [theme, setThemeState] = useState<ThemeName>('dark')

  useEffect(() => {
    window.hermesAPI.getTheme().then((savedTheme) => {
      if (ALL_THEMES.includes(savedTheme as ThemeName)) {
        setThemeState(savedTheme as ThemeName)
        document.documentElement.setAttribute('data-theme', savedTheme)
      }
    }).catch(() => {
      document.documentElement.setAttribute('data-theme', 'dark')
    })
  }, [])

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme)
    document.documentElement.setAttribute('data-theme', newTheme)
    window.hermesAPI.setTheme(newTheme).catch(() => {})
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}
