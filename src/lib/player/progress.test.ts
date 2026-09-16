import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';

import { readBuild, readBuildsFor, saveBuild } from './builds';
import { readRoster } from './characters';
import { getProfileId } from './db';
import { applyProgress, type ProgressInput } from './progress';
import { readTargets, setTarget } from './targets';

const VENTI = 10000022;
const VIRIDESCENT = 15002;
const NOBLESSE = 15007;
const ELEGY = 15502;

async function db() {
  const database = createMemoryDb();
  return database;
}

function input(overrides: Partial<ProgressInput> = {}): ProgressInput {
  return {
    characterId: VENTI,
    buildId: null,
    current: {
      level: 80,
      ascended: false,
      constellation: 2,
      talents: { auto: 5, skill: 6, burst: 8 },
    },
    target: {
      level: 90,
      ascended: false,
      talents: { auto: 9, skill: 9, burst: 9 },
    },
    weaponId: ELEGY,
    weaponRefinement: 1,
    setIds: [VIRIDESCENT],
    mainStats: { sands: 'FIGHT_PROP_CHARGE_EFFICIENCY' },
    goals: [{ prop: 'FIGHT_PROP_CHARGE_EFFICIENCY', min: 200 }],
    ...overrides,
  };
}

test('one call writes progress, target and the weapon plan', async () => {
  const database = await db();
  await applyProgress(input(), database);

  const entry = (await readRoster(database, await getProfileId(database)))
    .find((row) => row.characterId === VENTI);
  assert.equal(entry?.level, 80);
  // Level 80 unascended is phase 5; the checkbox is what makes it 6.
  assert.equal(entry?.ascension, 5);
  assert.equal(entry?.constellation, 2);
  assert.deepEqual(entry?.talent, { auto: 5, skill: 6, burst: 8 });

  // Levelling belongs to the character, so it lands on the roster row.
  assert.equal(entry?.target.level, 90);
  assert.equal(entry?.target.ascension, 6);
  assert.deepEqual(entry?.target.talents, { auto: 9, skill: 9, burst: 9 });

  const build = (await readBuildsFor(VENTI, database))[0];
  assert.deepEqual(build.setPlan, [{ setIds: [VIRIDESCENT], pieces: 4 }]);
  assert.deepEqual(build.goals, [{ prop: 'FIGHT_PROP_CHARGE_EFFICIENCY', min: 200 }]);
  assert.deepEqual(build.mainStats.sands, ['FIGHT_PROP_CHARGE_EFFICIENCY']);

  assert.equal((await readTargets(database)).get(VENTI)?.weaponId, ELEGY);
});

test('ascended picks the other side of a breakpoint', async () => {
  const database = await db();
  await applyProgress(input({
    current: {
      level: 80, ascended: true, constellation: 0,
      talents: { auto: 1, skill: 1, burst: 1 },
    },
  }), database);

  const entry = (await readRoster(database, await getProfileId(database)))
    .find((row) => row.characterId === VENTI);
  assert.equal(entry?.ascension, 6);
});

test('two sets become a 2+2, and a second save edits in place', async () => {
  const database = await db();
  const buildId = await applyProgress(input(), database);

  await applyProgress(input({ buildId, setIds: [VIRIDESCENT, NOBLESSE] }), database);

  const builds = await readBuildsFor(VENTI, database);
  assert.equal(builds.length, 1, 'edited rather than duplicated');
  assert.deepEqual(builds[0].setPlan, [{ setIds: [VIRIDESCENT, NOBLESSE], pieces: 2 }]);
});

test('fields the build editor owns survive a save from this form', async () => {
  const database = await db();
  const buildId = await applyProgress(input(), database);

  // Stand in for the build editor having set the parts this form never shows.
  const existing = (await readBuild(buildId, database))!;
  await saveBuild({
    ...existing,
    id: buildId,
    role: 'buffer',
    substats: ['FIGHT_PROP_CHARGE_EFFICIENCY'],
    notes: 'buffer de la rotación',
  }, database);

  await applyProgress(input({ buildId, goals: [] }), database);

  const build = (await readBuildsFor(VENTI, database))[0];
  assert.equal(build.role, 'buffer');
  assert.deepEqual(build.substats, ['FIGHT_PROP_CHARGE_EFFICIENCY']);
  assert.equal(build.notes, 'buffer de la rotación');
  assert.deepEqual(build.goals, []);
});

test('the plan is what the scarcity row records, notes and all', async () => {
  const database = await db();
  await setTarget({
    characterId: VENTI, weaponId: null, refinement: null,
    setIds: [NOBLESSE], notes: 'escrita a mano',
  }, database);

  await applyProgress(input(), database);

  const target = (await readTargets(database)).get(VENTI);
  // The build's set plan replaces whatever the old pin control left behind:
  // two places saying which sets this character wants was the redundancy.
  assert.deepEqual(target?.setIds, [VIRIDESCENT]);
  assert.equal(target?.notes, 'escrita a mano');
  assert.equal(target?.weaponId, ELEGY);
});
