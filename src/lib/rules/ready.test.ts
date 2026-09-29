import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalog } from '@/lib/data/catalog';
import { createMemoryDb } from '@/lib/db/client';
import { setDismissed, upsertCharacter } from '@/lib/player/characters';
import { getProfileId, persistMaterialStock } from '@/lib/player/db';

import { readyToLevel } from './ready';

const VENTI = 10000022;
const MORA = 202;
const HEROS_WIT = 104003;

async function ventiAtOne(stock: [number, number][]) {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  await upsertCharacter(db, profileId, {
    characterId: VENTI, travelerElement: null, level: 1, ascension: 0, constellation: 0,
    talent: { auto: 1, skill: 1, burst: 1 }, talentBonus: null,
  }, { source: 'good', observedAt: '2026-09-16T00:00:00.000Z' });
  await persistMaterialStock(db, profileId, stock.map(([materialId, count]) => ({ materialId, count })), '2026-09-16T00:00:00.000Z');
  return { db, profileId };
}

test('books and mora take a character to the cap of their phase', async () => {
  const { db } = await ventiAtOne([[HEROS_WIT, 20], [MORA, 1_000_000]]);
  const ready = await readyToLevel(await getCatalog('es'), db);

  assert.deepEqual(ready.characters[0]?.to, { level: 20, ascension: 0 }, 'no gems, so no phase one');
  assert.equal(ready.fates, 0);
});

test('with no mora nothing moves, and the page is told why', async () => {
  const { db } = await ventiAtOne([[HEROS_WIT, 20], [MORA, 100]]);
  const ready = await readyToLevel(await getCatalog('es'), db);

  assert.equal(ready.characters.length + ready.talents.length, 0);
  assert.ok(ready.cheapestStep !== null && ready.mora < ready.cheapestStep);
});

test('someone out of the plan is left out, unless asked for by name', async () => {
  const { db, profileId } = await ventiAtOne([[HEROS_WIT, 20], [MORA, 1_000_000]]);
  await setDismissed(db, profileId, [VENTI], true);
  const catalog = await getCatalog('es');

  assert.equal((await readyToLevel(catalog, db)).characters.length, 0);
  assert.equal((await readyToLevel(catalog, db, new Set([VENTI]))).characters.length, 1);
});
