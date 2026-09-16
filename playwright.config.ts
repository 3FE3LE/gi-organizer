import { defineConfig } from '@playwright/test';

/**
 * Browser tests, against a throwaway database.
 *
 * The unit suite covers the engine and never touches the DOM, which is exactly
 * why it missed a form that saved correctly and then blanked itself on screen.
 * These are here for that class of bug and no other: a handful of paths, in a
 * real browser, asserting what the player ends up looking at.
 *
 * `GI_DB_PATH` points somewhere disposable, so a run can never write to the
 * player's own file — it wins over a configured libSQL server for exactly that
 * reason. `e2e/seed.mts` rebuilds it before the server starts.
 */
const PORT = 3111;
const DB = 'e2e/.tmp/test.db';
const DIST = '.next-e2e';

/**
 * `GI_TEST_PROFILE` names the profile every row is written under, and tells
 * the proxy there is nobody to sign in as. Both are ignored under `VERCEL`, so
 * neither can weaken a deployment.
 */
const TEST_ENV = `GI_DB_PATH=${DB} GI_TEST_PROFILE=local`;

export default defineConfig({
  testDir: './e2e',
  // One worker: the app is a single SQLite file and these tests write to it.
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    /*
     * Built and served, not `next dev`.
     *
     * Every one of these tests is about what a form does after it saves, which
     * is client behaviour and needs the page hydrated. A dev server delivers
     * its client chunks over the HMR socket, and where that socket cannot be
     * established — a container, a port-forwarded WSL host — the page arrives
     * as server-rendered HTML that never wakes up: the selects hold their
     * values, the submit button does nothing, and no Server Action is ever
     * posted. Nothing is wrong with the app, and the whole suite fails.
     *
     * Its own `distDir`, so a dev server already open on this project keeps its
     * lock and its cache. See `distDir` in next.config.ts.
     */
    command:
      `${TEST_ENV} node --import ./scripts/test-loader.mjs e2e/seed.mts` +
      ` && NEXT_DIST_DIR=${DIST} pnpm exec next build` +
      ` && ${TEST_ENV} NEXT_DIST_DIR=${DIST} pnpm exec next start --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/es/characters`,
    reuseExistingServer: false,
    // A production build, so the budget is a build and not a dev boot.
    timeout: 300_000,
    stdout: 'pipe',
  },
});
