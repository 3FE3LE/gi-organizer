'use client';

import { usePathname, useRouter } from 'next/navigation';

import { LOCALES, LOCALE_CODES, type Locale } from '@/lib/data/locales';

export function LocaleSwitcher({ current }: { current: Locale }) {
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
      aria-label="Idioma"
      value={current}
      onChange={(event) => change(event.target.value)}
      className="rounded border border-edge bg-surface px-2 py-1 text-sm text-text"
    >
      {LOCALE_CODES.map((locale) => (
        <option key={locale} value={locale}>
          {LOCALES[locale].label}
        </option>
      ))}
    </select>
  );
}
