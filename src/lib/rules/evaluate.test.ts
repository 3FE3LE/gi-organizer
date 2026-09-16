import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import { resolveAnnotations } from '@/lib/annotations/resolve';
import { seedRules } from '@/lib/annotations/seed-rules';
import type { AnnotationFile } from '@/lib/annotations/types';
import type { ArtifactSlot } from '@/lib/data/types';

import { evaluate, type CharacterGear, type EvaluationInput, type TeamView } from './evaluate';
import type { Rule, TeamRole } from './types';

const VENTI = 10000022;
const SUCROSE = 10000043;
const XIANGLING = 10000023;
const BENNETT = 10000032;

const VIRIDESCENT = 15002;
const NOBLESSE = 15007;
const CRIMSON = 15006;
const FAVONIUS_LANCE = 13407;

const SLOTS: ArtifactSlot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

function fourPiece(setId: number, filler = CRIMSON): CharacterGear['sets'] {
  const sets = new Map<ArtifactSlot, number>();
  SLOTS.forEach((slot, index) => sets.set(slot, index < 4 ? setId : filler));
  return sets;
}

function input(overrides: Partial<EvaluationInput> = {}): EvaluationInput {
  return {
    teams: [],
    deployments: [],
    gear: new Map(),
    stock: new Map(),
    characters: new Map([
      [VENTI, { elementType: 'ELEMENT_ANEMO' }],
      [SUCROSE, { elementType: 'ELEMENT_ANEMO' }],
      [XIANGLING, { elementType: 'ELEMENT_PYRO' }],
      [BENNETT, { elementType: 'ELEMENT_PYRO' }],
    ]),
    tags: { ofCharacter: () => [], ofArtifactSet: () => [], ofWeapon: () => [] },
    rules: [],
    ...overrides,
  };
}

function team(
  slots: { characterId: number; roles?: TeamRole[]; declarations?: Record<string, string> }[],
  id = 'team-1',
): TeamView {
  return {
    id,
    name: 'test',
    mode: 'abyss',
    slots: slots.map((slot) => ({
      characterId: slot.characterId,
      roles: slot.roles ?? [],
      declarations: slot.declarations ?? {},
    })),
  };
}

/* -------------------------------------------------- the Favonius case --- */

test('one copy of a weapon planned onto two characters is an error', () => {
  // Two characters cannot *hold* one instance — the schema forbids it — so the
  // shortage only ever appears in what two builds are aiming for.
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: SUCROSE }])],
    targets: new Map([
      [VENTI, { weaponId: FAVONIUS_LANCE, refinement: 1 }],
      [SUCROSE, { weaponId: FAVONIUS_LANCE, refinement: 1 }],
    ]),
    stock: new Map([[`${FAVONIUS_LANCE}|1`, { weaponId: FAVONIUS_LANCE, refinement: 1, count: 1 }]]),
  }));

  const finding = result.diagnostics.find((entry) => entry.code === 'weapon.overallocated');
  assert.ok(finding, 'the shortage must be reported');
  assert.equal(finding.severity, 'error');
  assert.equal(finding.data.owned, 1);
  assert.equal(finding.data.demanded, 2);
  // Painted on both characters' weapon slots, not just announced somewhere.
  assert.equal(result.byTarget.get(`weapon-slot:${VENTI}`)?.length, 1);
  assert.equal(result.byTarget.get(`weapon-slot:${SUCROSE}`)?.length, 1);
});

test('two copies of the same weapon are fine', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: SUCROSE }])],
    targets: new Map([
      [VENTI, { weaponId: FAVONIUS_LANCE, refinement: 1 }],
      [SUCROSE, { weaponId: FAVONIUS_LANCE, refinement: 1 }],
    ]),
    stock: new Map([[`${FAVONIUS_LANCE}|1`, { weaponId: FAVONIUS_LANCE, refinement: 1, count: 2 }]]),
  }));

  assert.equal(result.diagnostics.filter((d) => d.code === 'weapon.overallocated').length, 0);
});

test('refinement splits the stock, because R1 and R5 are not interchangeable', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }])],
    targets: new Map([[VENTI, { weaponId: FAVONIUS_LANCE, refinement: 5 }]]),
    // Owning an R1 says nothing about owning an R5.
    stock: new Map([[`${FAVONIUS_LANCE}|1`, { weaponId: FAVONIUS_LANCE, refinement: 1, count: 3 }]]),
  }));

  assert.ok(result.diagnostics.some((entry) => entry.code === 'weapon.not-owned'));
});

/* --------------------------------------------- the Venti/Sucrose case --- */

const vvRule: Rule = {
  kind: 'non-stacking',
  id: 'seed:non-stacking:15002',
  enabled: true,
  source: 'seed',
  auraId: 'set:15002',
  providers: [{ type: 'artifact-set', setId: VIRIDESCENT, pieces: 4 }],
  partition: { by: 'declaration', field: 'vvAbsorbedElement' },
  maxProviders: 1,
  scope: 'team',
  severity: 'error',
  unprovableSeverity: 'warning',
  label: 'Viridescent Venerer',
};

function bothWearingVV(declarations: [Record<string, string>, Record<string, string>]) {
  return input({
    teams: [team([
      { characterId: VENTI, declarations: declarations[0] },
      { characterId: SUCROSE, declarations: declarations[1] },
    ])],
    gear: new Map<number, CharacterGear>([
      [VENTI, { sets: fourPiece(VIRIDESCENT), weapon: null }],
      [SUCROSE, { sets: fourPiece(VIRIDESCENT), weapon: null }],
    ]),
    rules: [vvRule],
  });
}

test('two Viridescent wearers shredding the same element is an error', () => {
  const result = evaluate(bothWearingVV([
    { vvAbsorbedElement: 'ELEMENT_PYRO' },
    { vvAbsorbedElement: 'ELEMENT_PYRO' },
  ]));

  const finding = result.diagnostics.find((entry) => entry.code === 'aura.duplicated');
  assert.ok(finding);
  assert.equal(finding.severity, 'error');
  assert.equal(finding.data.partition, 'ELEMENT_PYRO');
  assert.deepEqual(finding.data.characters, [VENTI, SUCROSE]);
});

test('two Viridescent wearers shredding different elements are fine', () => {
  const result = evaluate(bothWearingVV([
    { vvAbsorbedElement: 'ELEMENT_PYRO' },
    { vvAbsorbedElement: 'ELEMENT_HYDRO' },
  ]));

  // The case flat uniqueness would get wrong: both are doing work.
  assert.equal(result.diagnostics.filter((d) => d.code === 'aura.duplicated').length, 0);
  assert.equal(result.diagnostics.filter((d) => d.code === 'aura.unprovable').length, 0);
});

test('undeclared absorption is a warning, not a verdict', () => {
  const result = evaluate(bothWearingVV([{}, {}]));

  assert.equal(result.diagnostics.filter((d) => d.code === 'aura.duplicated').length, 0);
  const finding = result.diagnostics.find((entry) => entry.code === 'aura.unprovable');
  assert.ok(finding);
  assert.equal(finding.severity, 'warning');
  assert.equal(finding.data.field, 'vvAbsorbedElement');
});

test('a single Viridescent wearer is never flagged', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: SUCROSE }])],
    gear: new Map<number, CharacterGear>([
      [VENTI, { sets: fourPiece(VIRIDESCENT), weapon: null }],
      [SUCROSE, { sets: fourPiece(NOBLESSE), weapon: null }],
    ]),
    rules: [vvRule],
  }));

  assert.equal(result.diagnostics.filter((d) => d.code.startsWith('aura.')).length, 0);
});

test('a flat non-stacking set needs no declaration to be caught', () => {
  const noblesse: Rule = {
    ...vvRule,
    id: 'seed:non-stacking:15007',
    auraId: 'set:15007',
    providers: [{ type: 'artifact-set', setId: NOBLESSE, pieces: 4 }],
    partition: { by: 'none' },
  };

  const result = evaluate(input({
    teams: [team([{ characterId: XIANGLING }, { characterId: BENNETT }])],
    gear: new Map<number, CharacterGear>([
      [XIANGLING, { sets: fourPiece(NOBLESSE), weapon: null }],
      [BENNETT, { sets: fourPiece(NOBLESSE), weapon: null }],
    ]),
    rules: [noblesse],
  }));

  assert.equal(result.diagnostics.filter((d) => d.code === 'aura.duplicated').length, 1);
});

test('two pieces of a four-piece set do not trigger the rule', () => {
  const sets = new Map<ArtifactSlot, number>([
    ['flower', VIRIDESCENT], ['plume', VIRIDESCENT],
    ['sands', CRIMSON], ['goblet', CRIMSON], ['circlet', CRIMSON],
  ]);

  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: SUCROSE }])],
    gear: new Map<number, CharacterGear>([
      [VENTI, { sets, weapon: null }],
      [SUCROSE, { sets: fourPiece(VIRIDESCENT), weapon: null }],
    ]),
    rules: [vvRule],
  }));

  assert.equal(result.diagnostics.filter((d) => d.code.startsWith('aura.')).length, 0);
});

/* ---------------------------------------------------------- the rest --- */

test('the same character in both halves of one deployment is an error', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: BENNETT }], 'first'), team([{ characterId: BENNETT }], 'second')],
    deployments: [{ id: 'abyss-12', mode: 'abyss', teamIds: ['first', 'second'] }],
  }));

  const finding = result.diagnostics.find((entry) => entry.code === 'deployment.character-reused');
  assert.ok(finding, 'both Abyss halves are fielded at once');
  assert.equal(finding.severity, 'error');
});

test('the Theater element restriction is checked per season', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: XIANGLING }])],
    deployments: [{
      id: 'season-27', mode: 'theater', teamIds: ['team-1'],
      theater: { allowedElements: ['ELEMENT_HYDRO', 'ELEMENT_ELECTRO', 'ELEMENT_DENDRO'] },
    }],
  }));

  const findings = result.diagnostics.filter((d) => d.code === 'deployment.element-not-allowed');
  assert.equal(findings.length, 2, 'anemo and pyro are both out this season');
});

test('role coverage counts declared roles only', () => {
  const rule: Rule = {
    kind: 'role-coverage', id: 'user:healer', enabled: true, source: 'user',
    roles: ['healer'], min: 1, scope: 'team', severity: 'warning', label: 'needs a healer',
  };

  const without = evaluate(input({
    teams: [team([{ characterId: VENTI, roles: ['buffer'] }])], rules: [rule],
  }));
  assert.ok(without.diagnostics.some((entry) => entry.code === 'role.missing'));

  const with_ = evaluate(input({
    teams: [team([{ characterId: BENNETT, roles: ['healer', 'buffer'] }])], rules: [rule],
  }));
  assert.equal(with_.diagnostics.filter((d) => d.code === 'role.missing').length, 0);
});

test('a disabled rule produces nothing', () => {
  const result = evaluate(bothWearingVV([
    { vvAbsorbedElement: 'ELEMENT_PYRO' }, { vvAbsorbedElement: 'ELEMENT_PYRO' },
  ]));
  const off = evaluate({ ...bothWearingVV([
    { vvAbsorbedElement: 'ELEMENT_PYRO' }, { vvAbsorbedElement: 'ELEMENT_PYRO' },
  ]), rules: [{ ...vvRule, enabled: false }] });

  assert.ok(result.diagnostics.length > off.diagnostics.length);
  assert.equal(off.diagnostics.filter((d) => d.ruleId === vvRule.id).length, 0);
});

test('diagnostic ids are stable across evaluations', () => {
  const first = evaluate(bothWearingVV([
    { vvAbsorbedElement: 'ELEMENT_PYRO' }, { vvAbsorbedElement: 'ELEMENT_PYRO' },
  ]));
  const second = evaluate(bothWearingVV([
    { vvAbsorbedElement: 'ELEMENT_PYRO' }, { vvAbsorbedElement: 'ELEMENT_PYRO' },
  ]));

  assert.deepEqual(
    first.diagnostics.map((entry) => entry.id).sort(),
    second.diagnostics.map((entry) => entry.id).sort(),
  );
});

/* ----------------------------------------------- the curated seed file --- */

test('the curated seed generates rules whose ids exist in the catalog', () => {
  const file = JSON.parse(
    readFileSync('src/data/curated/annotations.json', 'utf8'),
  ) as AnnotationFile;
  const catalog = JSON.parse(
    readFileSync('src/generated/data/core/artifacts.json', 'utf8'),
  ) as Record<string, { id: number; pieces: Record<string, unknown> }>;

  for (const setId of Object.keys(file.sets)) {
    assert.ok(catalog[setId], `annotated set ${setId} is not in the catalog`);
  }

  const annotations = resolveAnnotations(file, {}, '7.0');
  const rules = seedRules(annotations, new Set());

  assert.ok(rules.length > 0);
  for (const rule of rules) {
    assert.equal(rule.kind, 'non-stacking');
    if (rule.kind !== 'non-stacking') continue;
    for (const provider of rule.providers) {
      if (provider.type !== 'artifact-set') continue;
      // A 4-piece rule against a circlet-only set could never fire.
      const pieces = Object.keys(catalog[String(provider.setId)].pieces).length;
      assert.ok(pieces >= provider.pieces, `set ${provider.setId} has only ${pieces} slots`);
    }
  }

  // Viridescent must come out partitioned, or the Venti/Sucrose case is wrong.
  const viridescent = rules.find((rule) => rule.id === 'seed:non-stacking:15002');
  assert.ok(viridescent);
  assert.deepEqual(
    viridescent.kind === 'non-stacking' ? viridescent.partition : null,
    { by: 'declaration', field: 'vvAbsorbedElement' },
  );
});

test('an entry reviewed in an older patch is reported stale, not dropped', () => {
  const file = {
    schemaVersion: 1, gameVersion: '7.0', genshinDbVersion: '5.2.13', reviewedAt: '2026-09-09',
    mechanics: {},
    sets: { '15002': { stacking: 'non-stacking', reviewedInVersion: '6.0' } },
    characters: {}, weapons: {},
  } as AnnotationFile;

  const annotations = resolveAnnotations(file, {}, '7.0');
  assert.equal(annotations.sets.size, 1, 'still usable');
  assert.deepEqual(annotations.stale, [{ kind: 'set', id: 15002, reviewedInVersion: '6.0' }]);
});

test('an override tombstone disables a seed entry idempotently', () => {
  const file = {
    schemaVersion: 1, gameVersion: '7.0', genshinDbVersion: '5.2.13', reviewedAt: '2026-09-09',
    mechanics: {},
    sets: { '15002': { stacking: 'non-stacking', reviewedInVersion: '7.0' } },
    characters: {}, weapons: {},
  } as AnnotationFile;

  const annotations = resolveAnnotations(file, { sets: { '15002': null } }, '7.0');
  assert.equal(annotations.sets.size, 0);
  assert.equal(seedRules(annotations, new Set()).length, 0);
});

test('a build with no target is counted on what it already holds', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: SUCROSE }])],
    gear: new Map<CharacterGear extends never ? never : number, CharacterGear>([
      [VENTI, { sets: new Map(), weapon: { instanceId: 'a', weaponId: FAVONIUS_LANCE, refinement: 1 } }],
    ]),
    // One copy, one holder, no target anywhere: nothing to complain about.
    stock: new Map([[`${FAVONIUS_LANCE}|1`, { weaponId: FAVONIUS_LANCE, refinement: 1, count: 1 }]]),
  }));

  assert.equal(result.diagnostics.filter((d) => d.code.startsWith('weapon.')).length, 0);
});

test('a target overrides what the character currently holds', () => {
  const result = evaluate(input({
    teams: [team([{ characterId: VENTI }, { characterId: SUCROSE }])],
    gear: new Map<number, CharacterGear>([
      // Venti holds it today, but plans to give it up.
      [VENTI, { sets: new Map(), weapon: { instanceId: 'a', weaponId: FAVONIUS_LANCE, refinement: 1 } }],
    ]),
    targets: new Map([[VENTI, { weaponId: null, refinement: null }]]),
    stock: new Map([[`${FAVONIUS_LANCE}|1`, { weaponId: FAVONIUS_LANCE, refinement: 1, count: 1 }]]),
  }));

  assert.equal(result.diagnostics.filter((d) => d.code === 'weapon.overallocated').length, 0);
});
