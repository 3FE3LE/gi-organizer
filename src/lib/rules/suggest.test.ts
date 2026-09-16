import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import type { ArtifactSlot } from '@/lib/data/types';

import type { CharacterGear } from './evaluate';
import {
  type BuildPriority,
  type SuggestionContext,
  resolveCollision,
  suggestSets,
  suggestWeapons,
} from './suggest';
import type { Rule } from './types';

const VENTI = 10000022;
const SUCROSE = 10000043;

const VIRIDESCENT = 15002;
const INSTRUCTOR = 10007;
const NOBLESSE = 15007;
const DAY_CARVED = 15044;
const GILDED = 15026;
const EMBLEM = 15020;

const ALL: ArtifactSlot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];
const POOL = [VIRIDESCENT, INSTRUCTOR, NOBLESSE, DAY_CARVED, GILDED, EMBLEM];

const vvRule: Rule = {
  kind: 'non-stacking', id: 'seed:non-stacking:15002', enabled: true, source: 'seed',
  auraId: 'set:15002', providers: [{ type: 'artifact-set', setId: VIRIDESCENT, pieces: 4 }],
  partition: { by: 'declaration', field: 'vvAbsorbedElement' }, maxProviders: 1,
  scope: 'team', severity: 'error', label: 'VV',
};

const noblesseRule: Rule = {
  ...vvRule, id: 'seed:non-stacking:15007', auraId: 'set:15007',
  providers: [{ type: 'artifact-set', setId: NOBLESSE, pieces: 4 }],
  partition: { by: 'none' },
};

function fourPiece(setId: number): CharacterGear {
  const sets = new Map<ArtifactSlot, number>();
  ALL.slice(0, 4).forEach((slot) => sets.set(slot, setId));
  return { sets, weapon: null };
}

function context(overrides: Partial<SuggestionContext> = {}): SuggestionContext {
  const priorities = new Map<number, BuildPriority>([
    [VENTI, {
      characterId: VENTI, role: 'Sub DPS', mainStats: [], substats: [], weapons: [],
      artifacts: [
        { setIds: [VIRIDESCENT], pieces: 4 },
        { setIds: [DAY_CARVED], pieces: 4 },
        { setIds: [NOBLESSE], pieces: 4 },
      ],
    }],
    [SUCROSE, {
      characterId: SUCROSE, role: 'Support', mainStats: [], substats: [], weapons: [],
      artifacts: [{ setIds: [VIRIDESCENT], pieces: 4 }, { setIds: [INSTRUCTOR], pieces: 4 }],
    }],
  ]);

  return {
    characterId: VENTI,
    teamMembers: [VENTI, SUCROSE],
    declaredRoles: [],
    pinnedSetIds: [],
    priorities,
    gear: new Map(),
    freeSlotsBySet: new Map(POOL.map((setId) => [setId, new Set(ALL)])),
    rules: [vvRule, noblesseRule],
    roles: new Map(),
    setRoles: new Map(),
    objective: null,
    setMechanics: new Map(),
    allSetIds: POOL,
    ...overrides,
  };
}

const idsOf = (suggestions: { setIds: number[] }[]) => suggestions.map((s) => s.setIds.join('-'));

/* ------------------------------------------------- the pool is yours --- */

test('the pool is every set you can field, not the ones a list names', () => {
  const suggestions = suggestSets(context());
  const feasible = suggestions.filter((entry) => entry.feasible);

  // Six sets are fieldable; the external list only mentions three of them.
  assert.equal(feasible.length, POOL.length);
  assert.ok(feasible.some((entry) => entry.setIds.includes(GILDED)));
  assert.ok(feasible.some((entry) => entry.setIds.includes(EMBLEM)));
});

test('with every listed set taken by teammates, it still suggests something', () => {
  // The exact dead end the external list produces: all three of its picks gone.
  const suggestions = suggestSets(context({
    teamMembers: [VENTI, SUCROSE, 1, 2],
    gear: new Map([
      [SUCROSE, fourPiece(VIRIDESCENT)],
      [1, fourPiece(NOBLESSE)],
    ]),
    rules: [vvRule, noblesseRule],
    freeSlotsBySet: new Map([
      [VIRIDESCENT, new Set(ALL)],
      [NOBLESSE, new Set(ALL)],
      [GILDED, new Set(ALL)],
      [EMBLEM, new Set(ALL)],
      [INSTRUCTOR, new Set(ALL)],
      // Day Carved is out of reach too.
      [DAY_CARVED, new Set<ArtifactSlot>(['flower'])],
    ]),
  }));

  const [best] = suggestions;
  assert.equal(best.feasible, true);
  assert.ok(
    !best.setIds.includes(VIRIDESCENT) && !best.setIds.includes(NOBLESSE),
    'neither contested set',
  );

  // And the pool reaches past the list: sets it never mentioned are offered as
  // real options, which is what keeps the dead end from being a dead end.
  const unlisted = suggestions.filter(
    (entry) => entry.feasible && entry.externalRank === null,
  );
  assert.ok(unlisted.length >= 2);
  assert.ok(unlisted.some((entry) => entry.setIds.includes(GILDED)));
});

/* ----------------------------------------------- your role outranks it --- */

test('the declared role outranks the external order', () => {
  const suggestions = suggestSets(context({
    declaredRoles: ['buffer'],
    // The list puts Viridescent first; the curated affinity says Gilded is the
    // buffer set here.
    setRoles: new Map([[GILDED, ['buffer']], [VIRIDESCENT, ['debuffer']]]),
  }));

  assert.equal(idsOf(suggestions)[0], String(GILDED));
});

test('a pin outranks everything, including feasibility ordering', () => {
  const suggestions = suggestSets(context({
    declaredRoles: ['buffer'],
    setRoles: new Map([[GILDED, ['buffer']]]),
    pinnedSetIds: [EMBLEM],
  }));

  assert.equal(idsOf(suggestions)[0], String(EMBLEM));
  assert.ok(suggestions[0].reasons.some((reason) => reason.kind === 'pinned'));
});

test('the external rank only breaks a tie', () => {
  const suggestions = suggestSets(context({
    // No roles declared and nothing annotated, so the list is all that is left.
    declaredRoles: [],
    setRoles: new Map(),
  }));

  const ranked = suggestions.filter((entry) => entry.externalRank !== null);
  assert.deepEqual(
    ranked.map((entry) => entry.externalRank),
    [...ranked.map((entry) => entry.externalRank)].sort((a, b) => (a ?? 0) - (b ?? 0)),
  );
});

/* -------------------------------------------------------- exclusions --- */

test('a set a teammate supplies is ranked below one you merely lack pieces for', () => {
  const suggestions = suggestSets(context({
    gear: new Map([[SUCROSE, fourPiece(VIRIDESCENT)]]),
    freeSlotsBySet: new Map([
      [VIRIDESCENT, new Set(ALL)],
      [DAY_CARVED, new Set<ArtifactSlot>(['flower', 'plume'])],
    ]),
  }));

  const contested = suggestions.findIndex((entry) => entry.setIds.includes(VIRIDESCENT));
  const incomplete = suggestions.findIndex((entry) => entry.setIds.includes(DAY_CARVED));

  // One is a dead end, the other is a shopping list.
  assert.ok(incomplete < contested);
  assert.equal(suggestions[contested].blocked, 'conflicts-in-team');
  assert.deepEqual(suggestions[contested].conflictsWith, [SUCROSE]);
});

test('pieces already worn count toward feasibility', () => {
  const partial = new Map<ArtifactSlot, number>([
    ['flower', VIRIDESCENT], ['plume', VIRIDESCENT], ['sands', VIRIDESCENT],
  ]);

  const suggestions = suggestSets(context({
    gear: new Map([[VENTI, { sets: partial, weapon: null }]]),
    freeSlotsBySet: new Map([[VIRIDESCENT, new Set<ArtifactSlot>(['goblet'])]]),
  }));

  const viridescent = suggestions.find((entry) => entry.setIds.includes(VIRIDESCENT));
  assert.equal(viridescent?.feasible, true, 'three worn plus one free is a four-piece');
});

test('an unannotated set says so rather than looking unsuitable', () => {
  const [suggestion] = suggestSets(context({ setRoles: new Map() }));
  assert.ok(suggestion.reasons.some((reason) => reason.kind === 'unannotated'));
});

/* ------------------------------------------------------- the collision --- */

test('the declared role decides who keeps a contested set', () => {
  const decision = resolveCollision(VIRIDESCENT, [VENTI, SUCROSE], {
    priorities: context().priorities,
    roles: new Map([[VENTI, ['sub-dps']], [SUCROSE, ['debuffer']]]),
    setRoles: new Map([[VIRIDESCENT, ['debuffer', 'enabler']]]),
  });

  assert.deepEqual(decision, { keeps: SUCROSE, reason: 'role-match' });
});

test('with no role declared it falls back to the external ranking', () => {
  const priorities = context().priorities;
  priorities.set(VENTI, {
    ...priorities.get(VENTI)!,
    artifacts: [{ setIds: [NOBLESSE], pieces: 4 }, { setIds: [VIRIDESCENT], pieces: 4 }],
  });

  const decision = resolveCollision(VIRIDESCENT, [VENTI, SUCROSE], {
    priorities, roles: new Map(), setRoles: new Map(),
  });

  assert.deepEqual(decision, { keeps: SUCROSE, reason: 'external-rank' });
});

test('an exact tie is undecidable rather than arbitrary', () => {
  const decision = resolveCollision(VIRIDESCENT, [VENTI, SUCROSE], {
    priorities: context().priorities,
    roles: new Map([[VENTI, ['debuffer']], [SUCROSE, ['debuffer']]]),
    setRoles: new Map([[VIRIDESCENT, ['debuffer']]]),
  });

  assert.deepEqual(decision, { keeps: null, reason: 'undecidable' });
});

/* ---------------------------------------------------------- weapons --- */

test('the pool is what the player can reach, not every weapon of the type', () => {
  const priorities = new Map<number, BuildPriority>([[VENTI, {
    characterId: VENTI, role: null, mainStats: [], substats: [], artifacts: [],
    weapons: [{ weaponId: 11501, minRefinement: 1 }],
  }]]);

  const suggestions = suggestWeapons(
    VENTI, priorities, new Map([['11502|1', 2]]), new Map(), [11501, 11502, 11503],
    new Map([[11503, { source: 'forge' as const }]]),
  );

  // 11501 is a list favourite the player does not own and cannot forge, so it
  // is not a plan. 11502 is owned; 11503 is forgeable.
  assert.deepEqual(suggestions.map((entry) => entry.weaponId), [11502, 11503]);
  assert.equal(suggestions[0].externalRank, null);
});

test('a weapon nobody can obtain right now is left out entirely', () => {
  const suggestions = suggestWeapons(
    VENTI, new Map(), new Map(), new Map(), [11501, 11502], new Map(),
  );

  assert.deepEqual(suggestions, [], 'no copies, no forge, no suggestion');
});

test('a weapon another build has claimed is not offered as spare', () => {
  const priorities = new Map<number, BuildPriority>([[VENTI, {
    characterId: VENTI, role: null, mainStats: [], substats: [], artifacts: [],
    weapons: [{ weaponId: 11501, minRefinement: 1 }, { weaponId: 11502, minRefinement: 1 }],
  }]]);

  const suggestions = suggestWeapons(
    VENTI, priorities, new Map([['11501|1', 1], ['11502|1', 2]]),
    new Map([[11501, 1]]), [11501, 11502],
    // Forgeable, so it stays listed even with its only copy claimed — the
    // player can make another.
    new Map([[11501, { source: 'forge' as const }]]),
  );

  assert.equal(suggestions[0].weaponId, 11502);
  const taken = suggestions.find((entry) => entry.weaponId === 11501);
  assert.equal(taken?.feasible, false);
  assert.equal(taken?.spare, 0);
});

test('a refinement floor only counts copies that meet it', () => {
  const priorities = new Map<number, BuildPriority>([[VENTI, {
    characterId: VENTI, role: null, mainStats: [], substats: [], artifacts: [],
    weapons: [{ weaponId: 11501, minRefinement: 5 }],
  }]]);

  const [suggestion] = suggestWeapons(
    VENTI, priorities, new Map([['11501|1', 3]]), new Map(), [11501],
    new Map([[11501, { source: 'forge' as const }]]),
  );

  assert.equal(suggestion.owned, 0, 'three R1 copies do not satisfy an R5 floor');
  assert.equal(suggestion.feasible, false);
});

/* ------------------------------------------------- the generated file --- */

test('every id in the generated priorities exists in the catalog', () => {
  const builds = JSON.parse(
    readFileSync('src/generated/data/builds.json', 'utf8'),
  ) as { entries: BuildPriority[] };

  const characters = JSON.parse(readFileSync('src/generated/data/core/characters.json', 'utf8'));
  const weapons = JSON.parse(readFileSync('src/generated/data/core/weapons.json', 'utf8'));
  const artifacts = JSON.parse(readFileSync('src/generated/data/core/artifacts.json', 'utf8'));
  const props = JSON.parse(readFileSync('src/generated/data/i18n/en/props.json', 'utf8'));

  assert.ok(builds.entries.length > 100);

  for (const entry of builds.entries) {
    assert.ok(characters[entry.characterId], `character ${entry.characterId}`);
    for (const weapon of entry.weapons) {
      assert.ok(weapons[weapon.weaponId], `weapon ${weapon.weaponId}`);
    }
    for (const candidate of entry.artifacts) {
      for (const setId of candidate.setIds) assert.ok(artifacts[setId], `set ${setId}`);
    }
    for (const prop of [...entry.substats, ...entry.mainStats.flat()]) {
      assert.ok(props[prop], `prop ${prop}`);
    }
  }
});

test('a set you own nothing of still ranks on suitability', () => {
  const suggestions = suggestSets(context({
    // Nothing of the external first choice, everything of the rest.
    freeSlotsBySet: new Map([
      [VIRIDESCENT, new Set<ArtifactSlot>()],
      [DAY_CARVED, new Set(ALL)],
      [NOBLESSE, new Set(ALL)],
      [GILDED, new Set(ALL)],
      [EMBLEM, new Set(ALL)],
      [INSTRUCTOR, new Set(ALL)],
    ]),
  }));

  const viridescent = suggestions.findIndex((entry) => entry.setIds.includes(VIRIDESCENT));
  const unlisted = suggestions.findIndex((entry) => entry.setIds.includes(EMBLEM));

  // Owning none of it is a farming target, not a demotion below sets no list
  // ever mentioned.
  assert.ok(viridescent < unlisted);
  assert.equal(suggestions[viridescent].complete, false);
  assert.equal(suggestions[viridescent].feasible, true, 'still a valid answer');
});

test('completeness only breaks a tie between equally suitable sets', () => {
  const suggestions = suggestSets(context({
    declaredRoles: ['buffer'],
    setRoles: new Map([[GILDED, ['buffer']], [EMBLEM, ['buffer']]]),
    freeSlotsBySet: new Map([
      [GILDED, new Set<ArtifactSlot>(['flower'])],
      [EMBLEM, new Set(ALL)],
    ]),
  }));

  const ids = idsOf(suggestions);
  assert.ok(ids.indexOf(String(EMBLEM)) < ids.indexOf(String(GILDED)));
});

test('a set that serves the team objective outranks a merely role-fitting one', () => {
  const suggestions = suggestSets(context({
    declaredRoles: ['buffer'],
    setRoles: new Map([[GILDED, ['buffer']], [EMBLEM, ['buffer']]]),
    objective: 'stellar-swirl',
    // Only Emblem's own text names the mechanic the team exists for.
    setMechanics: new Map([[EMBLEM, ['stellar-swirl']], [GILDED, ['bloom']]]),
  }));

  assert.equal(idsOf(suggestions)[0], String(EMBLEM));
  assert.ok(suggestions[0].reasons.some(
    (reason) => reason.kind === 'objective' && reason.mechanic === 'stellar-swirl',
  ));
});

test('without an objective the mechanic tags change nothing', () => {
  const withTags = suggestSets(context({
    declaredRoles: ['buffer'],
    setRoles: new Map([[GILDED, ['buffer']]]),
    setMechanics: new Map([[EMBLEM, ['stellar-swirl']]]),
  }));

  assert.equal(idsOf(withTags)[0], String(GILDED), 'role still decides');
  assert.ok(!withTags.some((entry) => entry.reasons.some((r) => r.kind === 'objective')));
});

test('a pin still beats the objective', () => {
  const suggestions = suggestSets(context({
    objective: 'stellar-swirl',
    setMechanics: new Map([[EMBLEM, ['stellar-swirl']]]),
    pinnedSetIds: [GILDED],
  }));

  assert.equal(idsOf(suggestions)[0], String(GILDED));
});
