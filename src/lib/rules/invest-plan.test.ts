import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalog } from '@/lib/data/catalog';
import { createMemoryDb } from '@/lib/db/client';
import { upsertCharacter } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';

import { investPlan } from './invest-plan';

const VENTI = 10000022;

async function ventiAt80() {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  await upsertCharacter(db, profileId, {
    characterId: VENTI, travelerElement: null, level: 80, ascension: 5, constellation: 0,
    talent: { auto: 1, skill: 8, burst: 8 }, talentBonus: null,
  }, { source: 'good', observedAt: '2026-09-16T00:00:00.000Z' });
  return db;
}

test('a character at 80 is offered 90 and their talents, each with a gain and a price', async () => {
  const plan = await investPlan(await getCatalog('es'), await ventiAt80());
  const byKind = new Map(plan.steps.map((step) => [`${step.kind}:${step.talent ?? ''}`, step]));

  const level = byKind.get('character:');
  assert.ok(level, 'the level step is offered');
  assert.equal(level.to, 90);
  // Base stats and the level factor together: a few percent, not a doubling.
  assert.ok(level.gain > 0.02 && level.gain < 0.2, `level gain ${level.gain}`);
  assert.ok(level.resin > 0, 'an empty bag has to farm for it');

  const burst = byKind.get('talent:burst');
  assert.ok(burst && burst.gain > 0, 'the burst step adds something');
  assert.equal(byKind.get('talent:auto'), undefined, 'the normal attack is not a target');

  assert.equal(plan.packages.length, 1);
  assert.ok(plan.packages[0].gain > level.gain, 'the whole climb is worth more than one step');
});
