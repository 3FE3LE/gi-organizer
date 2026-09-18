import { getTranslations } from 'next-intl/server';
import { locale as rootLocale } from 'next/root-params';
import Link from 'next/link';

import { DEFAULT_LOCALE, isLocale } from '@/lib/data/locales';

/**
 * Where `notFound()` lands: an unknown locale, a character id the catalog does
 * not hold, a build that was deleted in another tab.
 *
 * The way back is the roster rather than the site root, because the root only
 * redirects there anyway and a 404 that offers a redirect is a 404 that costs
 * a second request.
 */
export default async function NotFound() {
  const t = await getTranslations('ui');

  // The segment is unreadable when nothing matched it at all — which is the
  // case this file is rendered for half the time.
  let locale: string = DEFAULT_LOCALE;
  try {
    const segment = await rootLocale();
    if (segment && isLocale(segment)) locale = segment;
  } catch {
    locale = DEFAULT_LOCALE;
  }

  return (
    <div className="max-w-prose space-y-3">
      <h1 className="text-lg font-medium">{t('notFoundTitle')}</h1>
      <p className="text-sm text-muted">{t('notFoundBody')}</p>
      <Link
        href={`/${locale}/characters`}
        className="btn btn-primary"
      >
        {t('notFoundLink')}
      </Link>
    </div>
  );
}
