import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';

import { readRoster, upsertCharacter } from './characters';
import { getProfileId } from './db';

const VENTI = 10000022;

const venti = (level: number, skill: number) => ({
  characterId: VENTI, travelerElement: null, level, ascension: level >= 80 ? 5 : 4, constellation: 0,
  talent: { auto: 1, skill, burst: 6 }, talentBonus: null,
});

test('a partial source moves progress up, and never down', async () => {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  const at = '2026-09-16T00:00:00.000Z';

  await upsertCharacter(db, profileId, venti(80, 6), { source: 'good', observedAt: at });

  // The showcase is ahead on the skill and behind on the level.
  await upsertCharacter(db, profileId, venti(70, 8), { source: 'enka', observedAt: at, onlyForward: true });
  const [row] = await readRoster(db, profileId);

  assert.equal(row.level, 80, 'an older showcase does not undo a newer scan');
  assert.equal(row.ascension, 5);
  assert.equal(row.talent.skill, 8, 'what it has newer does come through');
});

test('a full source still writes what it says', async () => {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  const at = '2026-09-16T00:00:00.000Z';

  await upsertCharacter(db, profileId, venti(80, 6), { source: 'good', observedAt: at });
  await upsertCharacter(db, profileId, venti(70, 6), { source: 'good', observedAt: at });

  assert.equal((await readRoster(db, profileId))[0].level, 70);
});
