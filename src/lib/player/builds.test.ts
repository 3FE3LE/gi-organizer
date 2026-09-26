import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';

import {
  deleteBuild,
  readBuild,
  readBuildsFor,
  resolveBuildForSlot,
  saveBuild,
  type BuildInput,
} from './builds';
import { getProfileId, persistInventory } from './db';

const VENTI = 10000022;
const VIRIDESCENT = 15002;

async function db() {
  const database = createMemoryDb();
  await getProfileId(database);
  return database;
}

function build(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    characterId: VENTI,
    role: 'buffer',
    objective: 'stellar-swirl',
    weaponId: 15501,
    weaponRefinement: 1,
    setPlan: [{ setIds: [VIRIDESCENT], pieces: 4 }],
    mainStats: { sands: ['FIGHT_PROP_CHARGE_EFFICIENCY'] },
    substats: ['FIGHT_PROP_CHARGE_EFFICIENCY', 'FIGHT_PROP_ELEMENT_MASTERY'],
    goals: [{ prop: 'FIGHT_PROP_CHARGE_EFFICIENCY', min: 200 }],
    notes: null,
    ...overrides,
  };
}

test('a goal round-trips through the database intact', async () => {
  const database = await db();
  const id = await saveBuild(build(), database);
  const stored = await readBuild(id, database);

  assert.ok(stored);
  assert.equal(stored.role, 'buffer');
  assert.equal(stored.objective, 'stellar-swirl');
  assert.deepEqual(stored.setPlan, [{ setIds: [VIRIDESCENT], pieces: 4 }]);
  assert.deepEqual(stored.mainStats, { sands: ['FIGHT_PROP_CHARGE_EFFICIENCY'] });
  assert.deepEqual(stored.goals, [{ prop: 'FIGHT_PROP_CHARGE_EFFICIENCY', min: 200 }]);
});

test('saving with an id edits rather than duplicating', async () => {
  const database = await db();
  const id = await saveBuild(build(), database);

  await saveBuild({ ...build(), id, notes: 'editada' }, database);

  const all = await readBuildsFor(VENTI, database);
  assert.equal(all.length, 1);
  assert.equal(all[0].notes, 'editada');
});

test('a goal\'s weapon is the one its character holds, not the one it was saved with', async () => {
  const database = await db();
  // Saved naming a weapon nobody is wearing — what the old picker, or a
  // suggestion, left behind.
  const id = await saveBuild(build({ weaponId: 15501, weaponRefinement: 1 }), database);
  assert.equal((await readBuild(id, database))?.weaponId, null);

  await persistInventory(database, await getProfileId(database), { artifacts: [], weapons: [] }, {
    artifacts: [],
    weapons: [{
      id: 'w0', weaponId: 15502, level: 90, ascension: 6, refinement: 3,
      lock: false, source: 'good', equippedTo: VENTI, seenAt: '2026-09-26T00:00:00.000Z',
    }],
  });

  const stored = await readBuild(id, database);
  assert.equal(stored?.weaponId, 15502);
  assert.equal(stored?.weaponRefinement, 3);
});

test('a character cannot hold two goals for the same role', async () => {
  const database = await db();
  await saveBuild(build(), database);

  // The schema is what enforces it: a goal is identified by what it is for.
  await assert.rejects(() => saveBuild(build(), database), /UNIQUE|constraint/i);
});

test('a slot resolves the goal whose role it declared', async () => {
  const database = await db();
  await saveBuild(build({ role: 'buffer' }), database);
  await saveBuild(build({ role: 'sub-dps', objective: null }), database);

  assert.equal((await resolveBuildForSlot(VENTI, ['sub-dps'], null, database))?.role, 'sub-dps');
  assert.equal((await resolveBuildForSlot(VENTI, ['buffer'], null, database))?.role, 'buffer');
});

test('an explicit choice beats the role match', async () => {
  const database = await db();
  await saveBuild(build({ role: 'buffer' }), database);
  const subDps = await saveBuild(build({ role: 'sub-dps', objective: null }), database);

  assert.equal((await resolveBuildForSlot(VENTI, ['buffer'], subDps, database))?.role, 'sub-dps');
});

test('a role nobody planned for falls back to the goal with no role', async () => {
  const database = await db();
  await saveBuild(build({ role: 'buffer' }), database);
  await saveBuild(build({ role: null, objective: null }), database);

  assert.equal((await resolveBuildForSlot(VENTI, ['healer'], null, database))?.role, null);
});

test('with no roleless goal, a stranger role still gets an answer', async () => {
  const database = await db();
  await saveBuild(build({ role: 'buffer' }), database);

  assert.equal((await resolveBuildForSlot(VENTI, ['healer'], null, database))?.role, 'buffer');
});

test('a character with no goal resolves to nothing', async () => {
  assert.equal(await resolveBuildForSlot(VENTI, ['buffer'], null, await db()), null);
});

test('deleting removes only that goal', async () => {
  const database = await db();
  const first = await saveBuild(build({ role: 'buffer' }), database);
  await saveBuild(build({ role: 'sub-dps', objective: null }), database);

  assert.equal(await deleteBuild(first, database), 1);
  assert.deepEqual((await readBuildsFor(VENTI, database)).map((entry) => entry.role), ['sub-dps']);
});
