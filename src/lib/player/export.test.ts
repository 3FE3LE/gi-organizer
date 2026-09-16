import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { migrate } from '@/lib/db/migrations';
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

function seeded() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);

  const profileId = getProfileId(db);

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

  persistInventory(db, profileId, { artifacts: [], weapons: [] }, inventory);

  for (const characterId of [VENTI, SUCROSE]) {
    upsertCharacter(db, profileId, {
      characterId, travelerElement: null, level: 90, ascension: 6, constellation: 2,
      talent: { auto: 9, skill: 9, burst: 9 }, talentBonus: null,
    }, { source: 'manual', observedAt: NOW });
  }

  const teamId = createTeam('Prueba', 'abyss', db);
  setSlot(teamId, VENTI, 0, db);
  setSlot(teamId, SUCROSE, 1, db);
  setRoles(teamId, VENTI, ['sub-dps'], db);

  setTarget({
    characterId: VENTI, weaponId: SKYWARD_HARP, refinement: 1,
    setIds: [VIRIDESCENT], notes: null,
  }, db);

  return db;
}

/** Timestamps move; everything else must not. */
const stable = (payload: ReturnType<typeof exportNative>) =>
  JSON.stringify({ ...payload, exportedAt: null });

test('a native export restores to exactly the same state', () => {
  const db = seeded();
  const before = exportNative('7.0', db);

  const result = restoreNative(JSON.parse(JSON.stringify(before)), db);
  assert.equal(result.artifacts, 5);
  assert.equal(result.weapons, 1);
  assert.equal(result.roster, 2);
  assert.equal(result.teams, 1);
  assert.equal(result.targets, 1);

  assert.equal(stable(exportNative('7.0', db)), stable(before));
});

test('restoring into a dirty database replaces rather than merges', () => {
  const db = seeded();
  const backup = JSON.parse(JSON.stringify(exportNative('7.0', db)));

  // Drift: another team, another character, a piece removed.
  createTeam('Sobrante', 'other', db);
  db.prepare('DELETE FROM artifact_instance WHERE id = ?').run('a0');

  restoreNative(backup, db);

  const after = exportNative('7.0', db);
  assert.equal(after.teams.length, 1);
  assert.equal(after.inventory.artifacts.length, 5);
});

test('assignments survive a restore', () => {
  const db = seeded();
  const backup = JSON.parse(JSON.stringify(exportNative('7.0', db)));

  restoreNative(backup, db);

  const inventory = readInventory(db, getProfileId(db));
  assert.equal(inventory.artifacts.filter((piece) => piece.equippedTo === VENTI).length, 5);
  assert.equal(inventory.weapons[0].equippedTo, VENTI);
});

test('a lock nobody observed stays unobserved through a round trip', () => {
  const db = seeded();
  restoreNative(JSON.parse(JSON.stringify(exportNative('7.0', db))), db);

  const inventory = readInventory(db, getProfileId(db));
  assert.equal(inventory.artifacts.find((piece) => piece.id === 'a0')?.lock, true);
  assert.equal(inventory.artifacts.find((piece) => piece.id === 'a1')?.lock, null);
});

test('a file from another schema is refused, not half-applied', () => {
  const db = seeded();
  const before = stable(exportNative('7.0', db));

  assert.throws(() => restoreNative({ schema: 99, inventory: { artifacts: [] } }, db), RestoreRejected);
  assert.throws(() => restoreNative({ schema: 1 }, db), RestoreRejected);

  assert.equal(stable(exportNative('7.0', db)), before, 'nothing was touched');
});

/* --------------------------------------------------------- GOOD out --- */

test('a GOOD export re-imports through our own parser as unchanged', () => {
  const db = seeded();
  const { good, skipped } = exportGood(crosswalk, db);

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

  const plan = planImport(readInventory(db, getProfileId(db)), parsed.value);
  const counts = summarizePlan(plan);

  assert.equal(counts.artifacts.unchanged, 5);
  assert.deepEqual(
    { added: counts.artifacts.added, upgraded: counts.artifacts.upgraded,
      ambiguous: counts.artifacts.ambiguous, absent: counts.artifacts.absent },
    { added: 0, upgraded: 0, ambiguous: 0, absent: 0 },
  );
});

test('GOOD export writes the holder as a character key', () => {
  const db = seeded();
  const { good } = exportGood(crosswalk, db);

  const holders = new Set((good.artifacts as { location: string }[]).map((a) => a.location));
  assert.deepEqual([...holders], ['Venti']);
});

test('an unknown lock exports as false, since GOOD has no third state', () => {
  const db = seeded();
  const { good } = exportGood(crosswalk, db);
  const locks = (good.artifacts as { lock: boolean }[]).map((a) => a.lock);

  assert.equal(locks.filter(Boolean).length, 1, 'only the observed lock survives');
  assert.equal(locks.length, 5);
});

test('two exports of the same state are byte-identical', () => {
  const db = seeded();

  // Only then does diffing two backups mean anything.
  assert.equal(stable(exportNative('7.0', db)), stable(exportNative('7.0', db)));
  assert.equal(
    JSON.stringify(exportGood(crosswalk, db).good),
    JSON.stringify(exportGood(crosswalk, db).good),
  );
});

test('the not-yet-activated substat survives a GOOD round trip', () => {
  const db = seeded();
  const { good } = exportGood(crosswalk, db);

  const parsed = parseGood(good, { resolver: createKeyResolver(crosswalk) });
  assert.equal(parsed.ok, true);

  const carried = parsed.value.artifacts.filter(
    (piece) => piece.unactivatedSubstats.length > 0,
  );
  assert.equal(carried.length, 1);
  assert.equal(carried[0].unactivatedSubstats[0].prop, 'FIGHT_PROP_ELEMENT_MASTERY');
});
