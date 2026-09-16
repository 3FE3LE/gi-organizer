import type { NextConfig } from 'next';

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
      { source: '/:locale/farming', destination: '/:locale/plan/farmeo', permanent: false },
      { source: '/:locale/inventory', destination: '/:locale/datos', permanent: false },
      { source: '/:locale/import', destination: '/:locale/datos/importar', permanent: false },
      { source: '/:locale/history', destination: '/:locale/datos/historial', permanent: false },
    ];
  },
};

export default nextConfig;
