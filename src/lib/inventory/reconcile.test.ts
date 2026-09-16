import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { createKeyResolver, type GoodCrosswalk } from '@/lib/good/keys';
import { parseGood } from '@/lib/good/parse';

import { artifactFingerprint, artifactLineage, dominates } from './fingerprint';
import type { NormalizedArtifact, NormalizedImport } from './model';
import { AssignmentViolation, applyImport } from './apply';
import { type Inventory, type OwnedArtifact, planImport, summarizePlan } from './plan';

const crosswalk = JSON.parse(
  readFileSync('src/generated/data/core/good.json', 'utf8'),
) as GoodCrosswalk;

const resolver = createKeyResolver(crosswalk);

function parseFixture(path: string) {
  const result = parseGood(JSON.parse(readFileSync(path, 'utf8')), { resolver });
  assert.equal(result.ok, true, 'the fixture must parse');
  return result.value;
}

/** Adopts a parsed import as the starting inventory, the way a first run does. */
function adopt(normalized: NormalizedImport): Inventory {
  return {
    artifacts: normalized.artifacts.map((artifact) => ({
      ...artifact,
      id: randomUUID(),
      source: normalized.source,
      seenAt: normalized.observedAt,
    })),
    weapons: normalized.weapons.map((weapon) => ({
      ...weapon,
      id: randomUUID(),
      source: normalized.source,
      seenAt: normalized.observedAt,
    })),
  };
}

function piece(overrides: Partial<NormalizedArtifact> = {}): NormalizedArtifact {
  return {
    setId: 15001,
    slot: 'flower',
    rarity: 5,
    level: 0,
    mainProp: 'FIGHT_PROP_HP',
    substats: [
      { prop: 'FIGHT_PROP_CRITICAL', value: 3.5 },
      { prop: 'FIGHT_PROP_ATTACK_PERCENT', value: 5.3 },
      { prop: 'FIGHT_PROP_ELEMENT_MASTERY', value: 21 },
    ],
    unactivatedSubstats: [],
    lock: false,
    rollHistory: null,
    equippedTo: null,
    ...overrides,
  };
}

function own(artifact: NormalizedArtifact, id: string): OwnedArtifact {
  return { ...artifact, id, source: 'good', seenAt: '2026-09-09T00:00:00.000Z' };
}

function importOf(artifacts: NormalizedArtifact[]): NormalizedImport {
  return {
    source: 'good',
    coverage: 'full',
    observedAt: '2026-09-10T00:00:00.000Z',
    origin: 'test',
    characters: [],
    weapons: [],
    artifacts,
    materials: [],
    issues: [],
  };
}

test('the same file imported twice changes nothing', () => {
  const first = parseFixture('fixtures/good/sample.json');
  const inventory = adopt(first);

  const plan = planImport(inventory, parseFixture('fixtures/good/sample.json'));
  const counts = summarizePlan(plan);

  assert.equal(counts.artifacts.unchanged, first.artifacts.length);
  assert.equal(counts.artifacts.added, 0);
  assert.equal(counts.artifacts.upgraded, 0);
  assert.equal(counts.artifacts.ambiguous, 0);
  assert.equal(counts.artifacts.absent, 0);
  assert.equal(counts.weapons.added, 0);
  assert.equal(counts.weapons.absent, 0);
  assert.equal(plan.suspect, null);
});

test('a levelled piece is recognized, not duplicated', () => {
  const before = piece();
  const after = piece({
    level: 16,
    substats: [
      { prop: 'FIGHT_PROP_CRITICAL', value: 10.1 },
      { prop: 'FIGHT_PROP_ATTACK_PERCENT', value: 9.9 },
      { prop: 'FIGHT_PROP_ELEMENT_MASTERY', value: 40 },
      { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 13.2 },
    ],
  });

  assert.equal(dominates(after, before), true);

  const plan = planImport({ artifacts: [own(before, 'keep-me')], weapons: [] }, importOf([after]));

  assert.deepEqual(plan.artifacts.verdicts, [
    { kind: 'upgraded', incoming: after, ownedId: 'keep-me' },
  ]);
  // The row survives, so every assignment pointing at it survives too.
  assert.deepEqual(plan.artifacts.absentIds, []);
});

test('identical twins stay two pieces', () => {
  const twin = piece();
  const plan = planImport(
    { artifacts: [own(twin, 'first')], weapons: [] },
    importOf([twin, { ...twin }]),
  );

  const kinds = plan.artifacts.verdicts.map((verdict) => verdict.kind).sort();
  assert.deepEqual(kinds, ['added', 'unchanged']);
});

test('two candidates are a conflict, not a coin flip', () => {
  const base = piece();
  const levelled = piece({
    level: 4,
    substats: [
      { prop: 'FIGHT_PROP_CRITICAL', value: 6.8 },
      { prop: 'FIGHT_PROP_ATTACK_PERCENT', value: 5.3 },
      { prop: 'FIGHT_PROP_ELEMENT_MASTERY', value: 21 },
    ],
  });

  const plan = planImport(
    { artifacts: [own(base, 'a'), own({ ...base }, 'b')], weapons: [] },
    importOf([levelled]),
  );

  assert.equal(plan.artifacts.verdicts.length, 1);
  const [verdict] = plan.artifacts.verdicts;
  assert.equal(verdict.kind, 'ambiguous');
  assert.deepEqual(
    verdict.kind === 'ambiguous' ? verdict.candidateIds.sort() : [],
    ['a', 'b'],
  );
});

test('a substat never shrinks, so a downgrade is a different piece', () => {
  const strong = piece({ substats: [{ prop: 'FIGHT_PROP_CRITICAL', value: 10 }] });
  const weak = piece({ substats: [{ prop: 'FIGHT_PROP_CRITICAL', value: 3.1 }] });

  assert.equal(dominates(weak, strong), false);
  // And more rolls than the levels grant is also a different piece.
  assert.equal(dominates(piece({ level: 1, substats: [
    { prop: 'FIGHT_PROP_CRITICAL', value: 20 },
    { prop: 'FIGHT_PROP_ATTACK_PERCENT', value: 20 },
    { prop: 'FIGHT_PROP_ELEMENT_MASTERY', value: 40 },
  ] }), piece()), false);
});

test('an unactivated fourth substat keeps the lineage stable across +4', () => {
  const before = piece({
    unactivatedSubstats: [{ prop: 'FIGHT_PROP_CRITICAL_HURT', value: 7.8 }],
  });
  const after = piece({
    level: 4,
    substats: [...before.substats, { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 7.8 }],
  });

  assert.equal(artifactLineage(before), artifactLineage(after));
  assert.notEqual(artifactFingerprint(before), artifactFingerprint(after));
});

test('a partial source never proposes deleting anything', () => {
  const owned = own(piece(), 'kept');
  const plan = planImport(
    { artifacts: [owned], weapons: [] },
    { ...importOf([]), coverage: 'partial', source: 'enka' },
  );

  assert.deepEqual(plan.artifacts.absentIds, []);
  assert.equal(plan.suspect, null);
});

test('a full import that lost most of the inventory is marked suspect', () => {
  const artifacts = Array.from({ length: 10 }, (_, index) =>
    own(piece({ level: index }), `owned-${index}`));

  const plan = planImport({ artifacts, weapons: [] }, importOf([artifacts[0]]));

  assert.equal(plan.artifacts.absentIds.length, 9);
  assert.notEqual(plan.suspect, null);
  assert.equal(plan.suspect?.ownedCount, 10);
});

/**
 * The same guarantees against a real Inventory Kamera export, when one is
 * present. Real exports are personal data and gitignored, so this skips rather
 * than fails on a machine that has none — but on the machine that does, it is
 * the only test that runs the matcher at full scale.
 */
const IMPORTS = 'data/imports';

function realExport() {
  if (!existsSync(IMPORTS)) return null;
  const file = readdirSync(IMPORTS).find((name) => name.endsWith('.json'));
  return file ? path.join(IMPORTS, file) : null;
}

test('a real export is idempotent', { skip: realExport() === null }, () => {
  const file = realExport()!;
  const first = parseFixture(file);
  const inventory = adopt(first);

  const plan = planImport(inventory, parseFixture(file));
  const counts = summarizePlan(plan);

  assert.equal(counts.artifacts.unchanged, first.artifacts.length);
  assert.deepEqual(
    { added: counts.artifacts.added, upgraded: counts.artifacts.upgraded,
      ambiguous: counts.artifacts.ambiguous, absent: counts.artifacts.absent },
    { added: 0, upgraded: 0, ambiguous: 0, absent: 0 },
  );
  assert.deepEqual(
    { added: counts.weapons.added, absent: counts.weapons.absent },
    { added: 0, absent: 0 },
  );
  assert.equal(plan.suspect, null);
});

test('a real export levels cleanly', { skip: realExport() === null }, () => {
  const file = realExport()!;
  const normalized = parseFixture(file);
  const inventory = adopt(normalized);

  // Level every upgradable piece by one step and re-import. Each must be
  // recognized as the same piece, never as a new one.
  const levelled = normalized.artifacts.map((artifact) =>
    artifact.level >= 20
      ? artifact
      : { ...artifact, level: Math.min(20, artifact.level + 4) });

  const plan = planImport(inventory, { ...normalized, artifacts: levelled });
  const counts = summarizePlan(plan);

  assert.equal(counts.artifacts.added, 0, 'no piece may be duplicated by levelling');
  assert.equal(counts.artifacts.absent, 0, 'no piece may be lost by levelling');
  assert.equal(
    counts.artifacts.unchanged + counts.artifacts.upgraded + counts.artifacts.ambiguous,
    normalized.artifacts.length,
  );
});

/* --------------------------------------------------------------- apply --- */

test('applying an import twice leaves the inventory identical', () => {
  const file = realExport() ?? 'fixtures/good/sample.json';
  const normalized = parseFixture(file);

  let ids = 0;
  const newId = () => `id-${ids++}`;

  const { inventory: first } = applyImport({ artifacts: [], weapons: [] },
    planImport({ artifacts: [], weapons: [] }, normalized), { newId, onAbsent: 'remove' });

  const { inventory: second } = applyImport(first,
    planImport(first, parseFixture(file)), { newId, onAbsent: 'remove' });

  assert.equal(first.artifacts.length, normalized.artifacts.length);
  assert.equal(second.artifacts.length, first.artifacts.length);
  assert.deepEqual(
    second.artifacts.map((piece) => piece.id).sort(),
    first.artifacts.map((piece) => piece.id).sort(),
    'no piece may be re-created on a second apply',
  );
  assert.equal(second.weapons.length, first.weapons.length);
});

test('apply refuses an import that would double-assign a slot', () => {
  const first = piece({ equippedTo: 10000021 });
  const second = piece({ setId: 15002, equippedTo: 10000021 });

  const plan = planImport({ artifacts: [], weapons: [] }, importOf([first, second]));

  let ids = 0;
  assert.throws(
    () => applyImport({ artifacts: [], weapons: [] }, plan, { newId: () => `id-${ids++}` }),
    (error: unknown) => {
      assert.ok(error instanceof AssignmentViolation);
      assert.equal(error.conflicts[0].kind, 'slot-occupied');
      return true;
    },
  );
});

test('a GOOD import never clears a lock Enka could not see', () => {
  const locked = own(piece({ lock: true }), 'locked');
  const blind = piece({ lock: null });

  const { inventory: applied } = applyImport(
    { artifacts: [locked], weapons: [] },
    planImport({ artifacts: [locked], weapons: [] }, {
      ...importOf([blind]), source: 'enka', coverage: 'partial',
    }),
  );

  assert.equal(applied.artifacts[0].lock, true);
});

test('a weapon that changed hands is re-assigned, not duplicated', () => {
  const weapon = { weaponId: 11501, level: 90, ascension: 6, refinement: 1,
    lock: false, equippedTo: 10000021 };
  const owned = { ...weapon, id: 'w1', source: 'good' as const, seenAt: '2026-09-09T00:00:00.000Z' };

  const moved = { ...weapon, equippedTo: 10000022 };
  const inventory = { artifacts: [], weapons: [owned] };

  const { inventory: applied } = applyImport(inventory,
    planImport(inventory, { ...importOf([]), weapons: [moved] }));

  assert.equal(applied.weapons.length, 1);
  assert.equal(applied.weapons[0].id, 'w1');
  assert.equal(applied.weapons[0].equippedTo, 10000022);
});

test('a weapon on a character that cannot hold it is unassigned, not dropped', () => {
  const sword = { weaponId: 11406, level: 70, ascension: 4, refinement: 1,
    lock: false, equippedTo: 10000075 };

  const plan = planImport({ artifacts: [], weapons: [] },
    { ...importOf([]), weapons: [sword] });

  const { inventory, repairs } = applyImport({ artifacts: [], weapons: [] }, plan, {
    newId: () => 'w1',
    types: {
      ofWeapon: () => 'WEAPON_SWORD_ONE_HAND',
      ofCharacter: () => 'WEAPON_CATALYST',
    },
  });

  // The weapon survives; only the impossible assignment is discarded.
  assert.equal(inventory.weapons.length, 1);
  assert.equal(inventory.weapons[0].equippedTo, null);
  assert.equal(repairs.length, 1);
  assert.equal(repairs[0].kind, 'weapon-type-mismatch');
  assert.equal(repairs[0].characterId, 10000075);
});

/**
 * A showcase refines what the export listed; only the export decides what
 * exists. Without this, what the account holds would depend on which of two
 * partial sources ran last.
 */
test('a source that may not add leaves what it has never seen alone', () => {
  const incoming = importOf([
    piece({ setId: 15002, slot: 'flower' }),
    piece({ setId: 15002, slot: 'goblet', mainProp: 'FIGHT_PROP_ATTACK_PERCENT' }),
  ]);

  const { inventory: seeded } = applyImport(
    { artifacts: [], weapons: [] },
    planImport({ artifacts: [], weapons: [] }, importOf([incoming.artifacts[0]])),
    { newId: () => 'a0' },
  );
  assert.equal(seeded.artifacts.length, 1);

  const plan = planImport(seeded, incoming);
  assert.ok(
    plan.artifacts.verdicts.some((verdict) => verdict.kind === 'added'),
    'the fixture has to offer something new',
  );

  const { inventory } = applyImport(seeded, plan, { onNew: 'ignore' });

  assert.equal(inventory.artifacts.length, 1, 'nothing new was adopted');
  assert.equal(inventory.artifacts[0].id, 'a0');
});
