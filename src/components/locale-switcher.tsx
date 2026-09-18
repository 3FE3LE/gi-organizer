'use client';

import { useTranslations } from 'next-intl';
import { usePathname, useRouter } from 'next/navigation';

import { LOCALES, LOCALE_CODES, type Locale } from '@/lib/data/locales';

export function LocaleSwitcher({ current }: { current: Locale }) {
  const t = useTranslations('nav');
  const router = useRouter();
  const pathname = usePathname();

  // The locale is always the first path segment, so swapping it keeps the user
  // on the same entity — ids are language-neutral by design.
  function change(next: string) {
    const segments = pathname.split('/');
    segments[1] = next;
    router.push(segments.join('/'));
  }

  return (
    <select
      aria-label={t('language')}
      value={current}
      onChange={(event) => change(event.target.value)}
      className="field py-1.5 text-sm"
    >
      {LOCALE_CODES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALES[locale].label}
        </option>
      ))}
    </select>
  );
}
