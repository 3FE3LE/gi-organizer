/**
 * The database the browser tests run against.
 *
 * Built from nothing every run, so a test can never pass because of something
 * the player happened to own, and can never write to their real file. The
 * schema comes from the app's own migrations — seeding through raw SQL would
 * be a second definition of the tables to keep in step.
 *
 * Run through `scripts/test-loader.mjs`, which resolves the `@/` alias and
 * stubs `server-only`, exactly as `pnpm test` does.
 */
import { rmSync } from 'node:fs';

import { getDb } from '@/lib/db/client';
import { upsertCharacter } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import { saveBuild } from '@/lib/player/builds';

/** Venti. Anemo, four-star weapon, present in every version of the catalog. */
export const SEEDED_CHARACTER = 10000022;

const file = process.env.GI_DB_PATH;
if (!file) throw new Error('GI_DB_PATH must point at the test database');

for (const suffix of ['', '-wal', '-shm']) rmSync(`${file}${suffix}`, { force: true });

const db = getDb();
const profileId = await getProfileId(db);

await upsertCharacter(db, profileId, {
  characterId: SEEDED_CHARACTER,
  travelerElement: null,
  level: 80,
  ascension: 5,
  constellation: 0,
  talent: { auto: 1, skill: 1, burst: 1 },
  talentBonus: null,
}, { source: 'manual', observedAt: new Date().toISOString() });

// One goal, deliberately blank: the tests are about filling it in and having
// what they filled still be there afterwards.
await saveBuild({
  characterId: SEEDED_CHARACTER,
  role: null,
  objective: null,
  weaponId: null,
  weaponRefinement: null,
  setPlan: [],
  mainStats: {},
  substats: [],
  goals: [],
  notes: null,
}, db);

console.log(`seeded ${file}`);
