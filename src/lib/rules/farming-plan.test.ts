import assert from 'node:assert/strict';
import { test } from 'node:test';

import { getCatalog } from '@/lib/data/catalog';
import { createMemoryDb } from '@/lib/db/client';
import { setDismissed, upsertCharacter } from '@/lib/player/characters';
import { getProfileId, persistInventory } from '@/lib/player/db';


import { farmingPlan } from './assemble';

/**
 * The plan assumes an owned character with no stated target is headed for the
 * cap, because sixty characters with nothing written down still have sixty
 * characters' worth of demand. That assumption is only defensible because it
 * can be refused, and a refusal has to remove the demand rather than hide the
 * row — otherwise the totals keep counting somebody the player said no to.
 */
const VENTI = 10000022;
const SKYWARD_HARP = 15502;

async function rosterWith(level: number) {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);

  await upsertCharacter(db, profileId, {
    characterId: VENTI,
    travelerElement: null,
    level,
    ascension: 3,
    constellation: 0,
    talent: { auto: 1, skill: 1, burst: 1 },
    talentBonus: null,
  }, { source: 'good', observedAt: '2026-09-16T00:00:00.000Z' });

  return { db, profileId };
}

test('a character with no target is planned for as if headed for the cap', async () => {
  const { db } = await rosterWith(50);
  const plan = await farmingPlan(await getCatalog('es'), db);

  assert.equal(plan.sources, 1);
  assert.equal(plan.roster.length, 1);
  assert.equal(plan.roster[0].hasTarget, false, 'nobody stated one');
  assert.equal(plan.dismissed, 0);
});

test('dismissing removes the demand, not just the row', async () => {
  const { db, profileId } = await rosterWith(50);
  const catalog = await getCatalog('es');

  const count = (plan: Awaited<ReturnType<typeof farmingPlan>>) =>
    plan.schedule.anytime.length
    + plan.schedule.domains.reduce((total, domain) => total + domain.needs.length, 0);

  const before = await farmingPlan(catalog, db);
  assert.ok(count(before) > 0, 'the fixture has to need something');

  // Mora is a cost like any other and lands in `anytime`, so an account-wide
  // shortfall is already counted rather than being a separate feature.
  assert.ok(
    before.schedule.anytime.some((need) => need.materialId === 202),
    'levelling costs mora',
  );

  await setDismissed(db, profileId, [VENTI], true);

  const after = await farmingPlan(catalog, db);
  assert.equal(after.sources, 0);
  assert.equal(count(after), 0);
  assert.equal(after.dismissed, 1);
  assert.equal(after.roster[0].dismissed, true, 'still listed, so it can be taken back');
});

test('dismissing everyone and taking it back are one call each', async () => {
  const { db, profileId } = await rosterWith(50);
  const catalog = await getCatalog('es');

  await setDismissed(db, profileId, null, true);
  assert.equal((await farmingPlan(catalog, db)).sources, 0);

  await setDismissed(db, profileId, null, false);
  assert.equal((await farmingPlan(catalog, db)).sources, 1);
});

/**
 * The weapon somebody is already holding is the plan until they say otherwise.
 * Waiting for it to be written down left the ore out of a plan that had
 * already committed to levelling the character carrying it.
 */
test('an equipped weapon is planned for without a goal naming it', async () => {
  const { db, profileId } = await rosterWith(50);
  const catalog = await getCatalog('es');

  const before = await farmingPlan(catalog, db);
  const weaponRows = (plan: Awaited<ReturnType<typeof farmingPlan>>) =>
    [...plan.schedule.anytime, ...plan.schedule.domains.flatMap((domain) => domain.needs)]
      .flatMap((need) => need.by)
      .filter((row) => row.reason === 'weapon');

  assert.equal(weaponRows(before).length, 0, 'nothing is equipped yet');

  await persistInventory(db, profileId, { artifacts: [], weapons: [] }, {
    artifacts: [],
    weapons: [{
      id: 'w0',
      weaponId: SKYWARD_HARP,
      level: 20,
      ascension: 1,
      refinement: 1,
      lock: true,
      source: 'good',
      equippedTo: VENTI,
      seenAt: '2026-09-16T00:00:00.000Z',
    }],
  });

  const after = await farmingPlan(catalog, db);
  assert.ok(weaponRows(after).length > 0, 'the weapon it is holding now costs something');
});
