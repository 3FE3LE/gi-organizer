import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/** The landing, once per interface language, each naming the other. */
export default function sitemap(): MetadataRoute.Sitemap {
  const languages = { es: `${siteUrl}/es`, en: `${siteUrl}/en` };

  return (['es', 'en'] as const).map((locale) => ({
    url: `${siteUrl}/${locale}`,
    changeFrequency: 'monthly',
    priority: locale === 'es' ? 1 : 0.9,
    alternates: { languages },
  }));
}
