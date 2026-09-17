import { cookies } from 'next/headers';
import { locale as rootLocale } from 'next/root-params';
import { getRequestConfig } from 'next-intl/server';

import { isLocale } from '@/lib/data/locales';

/**
 * The interface only ships Spanish and English messages, independent of the
 * four locales the game-data catalog serves — see `@/lib/data/locales`. A
 * Japanese or Chinese reader still gets the catalog in their language; the
 * chrome around it falls back to Spanish, the same default the catalog
 * itself uses when nothing more specific is available.
 *
 * `next/root-params` reads the `[locale]` segment without going through
 * middleware or the legacy `setRequestLocale` — the segment is already
 * validated per page with `isLocale`, so this only has to decide which
 * message file that validated value maps to.
 */
function resolveUiLocale(value: string | undefined) {
  if (value && isLocale(value)) return value === 'en' ? 'en' : 'es';
  return 'es';
}

export default getRequestConfig(async ({ locale: explicit }) => {
  let locale: string;

  if (explicit) {
    locale = resolveUiLocale(explicit);
  } else {
    try {
      locale = resolveUiLocale(await rootLocale());
    } catch {
      // Server Actions and Route Handlers cannot read root params — see
      // `src/components/sync-locale-cookie.tsx`, which is the only other
      // place that writes this cookie, mirroring whatever the page last
      // resolved so a translated action result answers in the right
      // language instead of silently falling back to Spanish.
      const stored = (await cookies()).get('ui-locale')?.value;
      locale = stored === 'en' ? 'en' : 'es';
    }
  }

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
