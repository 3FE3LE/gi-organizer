/**
 * Locale registry.
 *
 * `amber` is the path segment Project Amber uses for the language: the catalog
 * is downloaded and built per locale by it — see `scripts/fetch-yatta.mts`.
 */
export const LOCALES = {
  es: { label: 'Español', amber: 'es' },
  en: { label: 'English', amber: 'en' },
  ja: { label: '日本語', amber: 'jp' },
  'zh-Hans': { label: '简体中文', amber: 'chs' },
} as const;

export type Locale = keyof typeof LOCALES;

export const LOCALE_CODES = Object.keys(LOCALES) as Locale[];

export const DEFAULT_LOCALE: Locale = 'es';

export function isLocale(value: string): value is Locale {
  return value in LOCALES;
}
