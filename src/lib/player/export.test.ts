import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';
import { createKeyResolver, type GoodCrosswalk } from '@/lib/good/keys';
import { parseGood } from '@/lib/good/parse';
import { planImport, summarizePlan, type Inventory } from '@/lib/inventory/plan';

import { getProfileId, persistInventory, readInventory } from './db';
import { upsertCharacter } from './characters';
import {
  RestoreRejected,
  exportGood,
  exportNative,
  restoreNative,
} from './export';
import { createTeam, setRoles, setSlot } from './teams';
import { setTarget } from './targets';

const crosswalk = JSON.parse(
  readFileSync('src/generated/data/core/good.json', 'utf8'),
) as GoodCrosswalk;

const VENTI = 10000022;
const SUCROSE = 10000043;
const VIRIDESCENT = 15002;
const SKYWARD_HARP = 15501;

const NOW = '2026-09-09T00:00:00.000Z';

async function seeded() {
  const db = createMemoryDb();

  const profileId = await getProfileId(db);

  const inventory: Inventory = {
    artifacts: (['flower', 'plume', 'sands', 'goblet', 'circlet'] as const).map((slot, index) => ({
      id: `a${index}`,
      setId: VIRIDESCENT,
      slot,
      rarity: 5,
      level: 20,
      mainProp: slot === 'flower' ? 'FIGHT_PROP_HP' : 'FIGHT_PROP_ATTACK_PERCENT',
      substats: [
        { prop: 'FIGHT_PROP_CRITICAL', value: 7.8 },
        { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 14.8 },
      ],
      unactivatedSubstats: index === 1
        ? [{ prop: 'FIGHT_PROP_ELEMENT_MASTERY', value: 21 }]
        : [],
      rollHistory: null,
      lock: index === 0 ? true : null,
      source: 'good' as const,
      equippedTo: index < 5 ? VENTI : null,
      seenAt: NOW,
    })),
    weapons: [{
      id: 'w0', weaponId: SKYWARD_HARP, level: 90, ascension: 6, refinement: 1,
      lock: false, source: 'good' as const, equippedTo: VENTI, seenAt: NOW,
    }],
  };

  await persistInventory(db, profileId, { artifacts: [], weapons: [] }, inventory);

  for (const characterId of [VENTI, SUCROSE]) {
    await upsertCharacter(db, profileId, {
      characterId, travelerElement: null, level: 90, ascension: 6, constellation: 2,
      talent: { auto: 9, skill: 9, burst: 9 }, talentBonus: null,
    }, { source: 'manual', observedAt: NOW });
  }

  const teamId = await createTeam('Prueba', 'abyss', db);
  await setSlot(teamId, VENTI, 0, db);
  await setSlot(teamId, SUCROSE, 1, db);
  await setRoles(teamId, VENTI, ['sub-dps'], db);

  await setTarget({
    characterId: VENTI, weaponId: SKYWARD_HARP, refinement: 1,
    setIds: [VIRIDESCENT], notes: null,
  }, db);

  return db;
}

/** Timestamps move; everything else must not. */
const stable = (payload: Awaited<ReturnType<typeof exportNative>>) =>
  JSON.stringify({ ...payload, exportedAt: null });

test('a native export restores to exactly the same state', async () => {
  const db = await seeded();
  const before = await exportNative('7.0', db);

  const result = await restoreNative(JSON.parse(JSON.stringify(before)), db);
  assert.equal(result.artifacts, 5);
  assert.equal(result.weapons, 1);
  assert.equal(result.roster, 2);
  assert.equal(result.teams, 1);
  assert.equal(result.targets, 1);

  assert.equal(stable(await exportNative('7.0', db)), stable(before));
});

test('restoring into a dirty database replaces rather than merges', async () => {
  const db = await seeded();
  const backup = JSON.parse(JSON.stringify(await exportNative('7.0', db)));

  // Drift: another team, another character, a piece removed.
  await createTeam('Sobrante', 'other', db);
  await db.prepare('DELETE FROM artifact_instance WHERE id = ?').run('a0');

  await restoreNative(backup, db);

  const after = await exportNative('7.0', db);
  assert.equal(after.teams.length, 1);
  assert.equal(after.inventory.artifacts.length, 5);
});

test('assignments survive a restore', async () => {
  const db = await seeded();
  const backup = JSON.parse(JSON.stringify(await exportNative('7.0', db)));

  await restoreNative(backup, db);

  const inventory = await readInventory(db, await getProfileId(db));
  assert.equal(inventory.artifacts.filter((piece) => piece.equippedTo === VENTI).length, 5);
  assert.equal(inventory.weapons[0].equippedTo, VENTI);
});

test('a lock nobody observed stays unobserved through a round trip', async () => {
  const db = await seeded();
  await restoreNative(JSON.parse(JSON.stringify(await exportNative('7.0', db))), db);

  const inventory = await readInventory(db, await getProfileId(db));
  assert.equal(inventory.artifacts.find((piece) => piece.id === 'a0')?.lock, true);
  assert.equal(inventory.artifacts.find((piece) => piece.id === 'a1')?.lock, null);
});

test('a file from another schema is refused, not half-applied', async () => {
  const db = await seeded();
  const before = stable(await exportNative('7.0', db));

  await assert.rejects(() => restoreNative({ schema: 99, inventory: { artifacts: [] } }, db), RestoreRejected);
  await assert.rejects(() => restoreNative({ schema: 1 }, db), RestoreRejected);

  assert.equal(stable(await exportNative('7.0', db)), before, 'nothing was touched');
});

/* --------------------------------------------------------- GOOD out --- */

test('a GOOD export re-imports through our own parser as unchanged', async () => {
  const db = await seeded();
  const { good, skipped } = await exportGood(crosswalk, db);

  assert.deepEqual(skipped, []);
  assert.equal(good.format, 'GOOD');
  assert.equal(good.artifacts.length, 5);
  assert.equal(good.weapons.length, 1);
  assert.equal(good.characters.length, 2);

  // The strongest fidelity check available: what we write, we can read, and
  // reading it back changes nothing.
  const parsed = parseGood(good, { resolver: createKeyResolver(crosswalk) });
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value.issues, []);

  const plan = planImport(await readInventory(db, await getProfileId(db)), parsed.value);
  const counts = summarizePlan(plan);

  assert.equal(counts.artifacts.unchanged, 5);
  assert.deepEqual(
    { added: counts.artifacts.added, upgraded: counts.artifacts.upgraded,
      ambiguous: counts.artifacts.ambiguous, absent: counts.artifacts.absent },
    { added: 0, upgraded: 0, ambiguous: 0, absent: 0 },
  );
});

test('GOOD export writes the holder as a character key', async () => {
  const db = await seeded();
  const { good } = await exportGood(crosswalk, db);

  const holders = new Set((good.artifacts as { location: string }[]).map((a) => a.location));
  assert.deepEqual([...holders], ['Venti']);
});

test('an unknown lock exports as false, since GOOD has no third state', async () => {
  const db = await seeded();
  const { good } = await exportGood(crosswalk, db);
  const locks = (good.artifacts as { lock: boolean }[]).map((a) => a.lock);

  assert.equal(locks.filter(Boolean).length, 1, 'only the observed lock survives');
  assert.equal(locks.length, 5);
});

test('two exports of the same state are byte-identical', async () => {
  const db = await seeded();

  // Only then does diffing two backups mean anything.
  assert.equal(stable(await exportNative('7.0', db)), stable(await exportNative('7.0', db)));
  assert.equal(
    JSON.stringify((await exportGood(crosswalk, db)).good),
    JSON.stringify((await exportGood(crosswalk, db)).good),
  );
});

test('the not-yet-activated substat survives a GOOD round trip', async () => {
  const db = await seeded();
  const { good } = await exportGood(crosswalk, db);

  const parsed = parseGood(good, { resolver: createKeyResolver(crosswalk) });
  assert.equal(parsed.ok, true);

  const carried = parsed.value.artifacts.filter(
    (piece) => piece.unactivatedSubstats.length > 0,
  );
  assert.equal(carried.length, 1);
  assert.equal(carried[0].unactivatedSubstats[0].prop, 'FIGHT_PROP_ELEMENT_MASTERY');
});
