import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalog } from '@/lib/data/catalog';
import { createMemoryDb } from '@/lib/db/client';
import { upsertCharacter } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';

import { readRatings } from './rating-plan';

test('a levelled character with nothing equipped is rated on level and talents alone', async () => {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  await upsertCharacter(db, profileId, {
    characterId: 10000022, travelerElement: null, level: 90, ascension: 6, constellation: 0,
    talent: { auto: 1, skill: 8, burst: 8 }, talentBonus: null,
  }, { source: 'good', observedAt: '2026-09-16T00:00:00.000Z' });

  const rating = (await readRatings(await getCatalog('es'), db)).get(10000022);
  assert.ok(rating);
  assert.equal(rating.parts.level, 1);
  assert.equal(rating.parts.talents, 1);
  assert.equal(rating.parts.weapon, 0, 'no weapon held');
  assert.equal(rating.parts.artifacts, 0, 'nothing worn');
  assert.equal(rating.parts.akasha, null, 'no UID, no Akasha');
  // Level 20 and talents 30 of the 90, scaled to a hundred.
  assert.equal(rating.score, Math.round((50 / 90) * 100));
});
