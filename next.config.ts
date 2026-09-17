import type { NextConfig } from 'next';
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

const nextConfig: NextConfig = {
  /**
   * The browser suite builds into its own directory.
   *
   * `next dev` holds a lock per output directory, so without this a Playwright
   * run and the dev server the author already has open cannot coexist — and a
   * test suite that requires closing the editor's server is a suite nobody
   * runs.
   */
  distDir: process.env.NEXT_DIST_DIR || '.next',

  /**
   * `libsql` carries a native binding, which the bundler cannot inline. Left to
   * be traced and copied instead, so the function ships the `.node` file.
   */
  serverExternalPackages: ['@libsql/client', 'libsql'],

  /**
   * The code here is already written for it — `progress-form.tsx` reaches for
   * `useWatch` over `form.watch` precisely so the compiler does not bail on
   * that component — but the flag was never set, so none of it was memoised.
   *
   * Runs through `babel-plugin-react-compiler`, which Next applies only to
   * files that hold JSX or hooks; the rest of the build stays on SWC.
   */
  reactCompiler: true,

  /**
   * A URL that matches no route has no `[locale]` to render a layout from, so
   * `[locale]/not-found.tsx` cannot serve it — see `src/app/global-not-found.tsx`,
   * which renders its own document instead. Still flagged experimental.
   */
  experimental: {
    globalNotFound: true,
  },

  images: {
    // Kept in sync with `ASSET_HOSTS` in src/lib/data/assets.ts, which documents
    // why two hosts are needed.
    remotePatterns: [
      { protocol: 'https', hostname: 'enka.network', pathname: '/ui/**' },
      { protocol: 'https', hostname: 'gi.yatta.moe', pathname: '/assets/UI/**' },
    ],
    // Asset names are immutable within and across patches: a patch adds names,
    // it never repoints an existing one, so an optimized variant cannot go stale.
    minimumCacheTTL: 31_536_000,
  },

  /**
   * The five pages that became two sections. Kept as redirects rather than
   * deleted outright so a bookmark from before the reshuffle still lands
   * somewhere useful.
   */
  async redirects() {
    return [
      { source: '/:locale/agenda', destination: '/:locale/plan', permanent: false },
      { source: '/:locale/farming', destination: '/:locale/plan?range=all', permanent: false },
      { source: '/:locale/inventory', destination: '/:locale/data', permanent: false },
      { source: '/:locale/import', destination: '/:locale/data/import', permanent: false },
      { source: '/:locale/history', destination: '/:locale/data/history', permanent: false },
    ];
  },
};

export default withNextIntl(nextConfig);
