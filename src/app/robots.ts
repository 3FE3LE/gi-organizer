import type { MetadataRoute } from 'next';

import { siteUrl } from '@/lib/site';

/**
 * Only the landing is for crawlers.
 *
 * Every other route is one player's account behind a sign-in: a crawler that
 * followed a link into it would meet the sign-in page, and what is behind it
 * should never be indexed anyway. So the sections are disallowed outright, and
 * the landing's own pages carry `index` while the rest carry `noindex` — see
 * `app/[locale]/layout.tsx` — in case a link reaches them some other way.
 */
export default function robots(): MetadataRoute.Robots {
  const sections = ['characters', 'build', 'teams', 'artifacts', 'plan', 'data'];

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/es', '/en'],
      disallow: [
        ...sections.map((section) => `/*/${section}`),
        '/api/',
        '/sign-in',
        '/sign-up',
      ],
    },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
