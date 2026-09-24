/**
 * The site's own origin, for anything that has to be absolute: canonical
 * URLs, the sitemap, Open Graph images.
 *
 * `NEXT_PUBLIC_SITE_URL` when set — the custom domain, once there is one —
 * then the production host Vercel states, and locally a placeholder so the
 * value is always defined rather than Next warning on every build.
 */
export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
  ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000');
