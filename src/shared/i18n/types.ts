export type AppLocale = 'zh-CN' | 'en'

export const SUPPORTED_LOCALES: AppLocale[] = ['zh-CN', 'en']

export const DEFAULT_LOCALE: AppLocale = 'zh-CN'

export function normalizeLocale(value: string | null | undefined): AppLocale {
  if (value === 'en' || value === 'en-US') return 'en'
  return 'zh-CN'
}
