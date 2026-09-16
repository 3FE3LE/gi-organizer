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
 * player's own file. `e2e/seed.mts` rebuilds it before the server starts.
 */
const PORT = 3111;
const DB = 'e2e/.tmp/test.db';

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
    // Its own `distDir`, so a dev server already open on this project keeps its
    // lock and its cache. See `next.config.ts`.
    command:
      `GI_DB_PATH=${DB} node --import ./scripts/test-loader.mjs e2e/seed.mts` +
      ` && GI_DB_PATH=${DB} NEXT_DIST_DIR=.next-e2e pnpm exec next dev --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/es/characters`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'pipe',
  },
});
