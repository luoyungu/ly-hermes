import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import zhCN from './locales/zh-CN'
import en from './locales/en'
import { DEFAULT_LOCALE, type AppLocale } from './types'

export { buildClassicLexicon } from './build-lexicon'
export { translateError } from './error-map'
export type { ThemeLexicon } from './lexicon-types'
export { DEFAULT_LOCALE, normalizeLocale, SUPPORTED_LOCALES, type AppLocale } from './types'

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    en: { translation: en },
  },
  lng: DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
})

export function applyDocumentLocale(locale: AppLocale): void {
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN'
}

export async function changeLocale(locale: AppLocale): Promise<void> {
  await i18n.changeLanguage(locale)
  applyDocumentLocale(locale)
}

export default i18n
