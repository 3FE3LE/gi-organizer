/**
 * Locale registry.
 *
 * `genshinDb` is the language name the `genshin-db` package expects.
 * `amber` is the path segment Project Amber uses, kept here so a later
 * live-data fetch (banners, beta content) stays consistent with the
 * generated strings.
 */
export const LOCALES = {
  es: { label: 'Español', genshinDb: 'Spanish', amber: 'es' },
  en: { label: 'English', genshinDb: 'English', amber: 'en' },
  ja: { label: '日本語', genshinDb: 'Japanese', amber: 'jp' },
  'zh-Hans': { label: '简体中文', genshinDb: 'ChineseSimplified', amber: 'chs' },
} as const;

export type Locale = keyof typeof LOCALES;

export const LOCALE_CODES = Object.keys(LOCALES) as Locale[];

export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: string): value is Locale {
  return value in LOCALES;
}
