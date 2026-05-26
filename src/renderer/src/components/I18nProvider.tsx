import { useState, useEffect, useCallback, createContext, useContext } from 'react'
import { I18nextProvider } from 'react-i18next'
import i18n, { applyDocumentLocale, changeLocale, normalizeLocale, type AppLocale } from '../../../shared/i18n'

interface LocaleContextValue {
  locale: AppLocale
  setLocale: (locale: AppLocale) => Promise<void>
  ready: boolean
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: 'zh-CN',
  setLocale: async () => {},
  ready: false,
})

export function useLocale(): LocaleContextValue {
  return useContext(LocaleContext)
}

export function I18nProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [locale, setLocaleState] = useState<AppLocale>('zh-CN')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const saved = window.hermesAPI?.getLanguage
          ? await window.hermesAPI.getLanguage()
          : null
        const next = normalizeLocale(saved)
        await changeLocale(next)
        setLocaleState(next)
      } catch {
        applyDocumentLocale('zh-CN')
      } finally {
        setReady(true)
      }
    }
    void load()
  }, [])

  const setLocale = useCallback(async (next: AppLocale) => {
    await changeLocale(next)
    setLocaleState(next)
    if (window.hermesAPI?.setLanguage) {
      await window.hermesAPI.setLanguage(next).catch(() => {})
    }
  }, [])

  if (!ready) {
    return <div className="h-screen bg-[var(--bg-primary)]" />
  }

  return (
    <I18nextProvider i18n={i18n}>
      <LocaleContext.Provider value={{ locale, setLocale, ready }}>
        {children}
      </LocaleContext.Provider>
    </I18nextProvider>
  )
}
