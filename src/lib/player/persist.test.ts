import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';
import type { Inventory, OwnedArtifact, OwnedWeapon } from '@/lib/inventory/plan';

import { getProfileId, persistInventory, readInventory } from './db';

/**
 * The write pass sends every statement in one batch, so the order inside that
 * batch is what keeps the partial unique indexes satisfied: a piece changing
 * hands has to be released before the piece taking its place is assigned.
 *
 * These are the cases where getting that order wrong is a constraint violation
 * rather than a wrong answer, which is why they are asserted against a real
 * schema instead of a stand-in.
 */

const VENTI = 10000022;
const SEEN = '2026-09-09T00:00:00.000Z';

function goblet(id: string, equippedTo: number | null): OwnedArtifact {
  return {
    id,
    setId: 15002,
    slot: 'goblet',
    rarity: 5,
    level: 20,
    mainProp: 'FIGHT_PROP_ATTACK_PERCENT',
    substats: [{ prop: 'FIGHT_PROP_CRITICAL', value: 7.8 }],
    unactivatedSubstats: [],
    rollHistory: null,
    lock: true,
    source: 'good',
    equippedTo,
    seenAt: SEEN,
  };
}

function bow(id: string, equippedTo: number | null): OwnedWeapon {
  return {
    id,
    weaponId: 15501,
    level: 90,
    ascension: 6,
    refinement: 1,
    lock: true,
    source: 'good',
    equippedTo,
    seenAt: SEEN,
  };
}

async function write(before: Inventory, after: Inventory) {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);

  await persistInventory(db, profileId, { artifacts: [], weapons: [] }, before);
  const counts = await persistInventory(db, profileId, before, after);

  return { counts, state: await readInventory(db, profileId) };
}

test('a slot changing hands does not have two claimants mid-write', async () => {
  const before = { artifacts: [goblet('a', VENTI), goblet('b', null)], weapons: [] };
  // The new holder is written first, so without the release the old one still
  // claims the slot when it lands.
  const after = { artifacts: [goblet('b', VENTI), goblet('a', null)], weapons: [] };

  const { counts, state } = await write(before, after);

  assert.equal(counts.artifacts.updated, 2);
  assert.deepEqual(
    state.artifacts.map((piece) => [piece.id, piece.equippedTo]),
    [['a', null], ['b', VENTI]],
  );
});

test('a weapon changing hands does not have two claimants mid-write', async () => {
  const before = { artifacts: [], weapons: [bow('a', VENTI), bow('b', null)] };
  const after = { artifacts: [], weapons: [bow('b', VENTI), bow('a', null)] };

  const { state } = await write(before, after);

  assert.deepEqual(
    state.weapons.map((weapon) => [weapon.id, weapon.equippedTo]),
    [['a', null], ['b', VENTI]],
  );
});

test('the piece taking the slot can be one the write also deletes the old owner of', async () => {
  const before = { artifacts: [goblet('a', VENTI), goblet('b', null)], weapons: [] };
  const after = { artifacts: [goblet('b', VENTI)], weapons: [] };

  const { counts, state } = await write(before, after);

  assert.equal(counts.artifacts.deleted, 1);
  assert.deepEqual(state.artifacts.map((piece) => [piece.id, piece.equippedTo]), [['b', VENTI]]);
});
