import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ArtifactSlot } from '@/lib/data/types';

import { chainsOf, planCascade, type CascadeBuild, type CascadeInput } from './cascade';
import { buildStatsFor } from './piece-score';

const CR = 'FIGHT_PROP_CRITICAL';
const CD = 'FIGHT_PROP_CRITICAL_HURT';
const EM = 'FIGHT_PROP_ELEMENT_MASTERY';
const DEF = 'FIGHT_PROP_DEFENSE';

const SET = 15006;

/** Three builds that each want a different substat, so pieces are not fungible. */
function build(id: string, characterId: number, wants: string): CascadeBuild {
  return {
    buildId: id,
    characterId,
    name: id,
    stats: buildStatsFor({ mainStats: [], substats: [wants] }),
    plannedSets: [],
  };
}

type Piece = CascadeInput['pieces'][number];

function piece(
  instanceId: string,
  substats: { prop: string; value: number }[],
  equippedTo: number | null,
  slot: ArtifactSlot = 'goblet',
): Piece {
  return {
    instanceId, setId: SET, slot, rarity: 5, level: 20,
    mainProp: 'FIGHT_PROP_ATTACK_PERCENT', substats, equippedTo,
  };
}

const crit = (value: number) => [{ prop: CR, value }];
const critDmg = (value: number) => [{ prop: CD, value }];
const mastery = (value: number) => [{ prop: EM, value }];
const junk = [{ prop: DEF, value: 20 }];

test('a free upgrade is taken', () => {
  const plan = planCascade({
    builds: [build('a', 1, CR)],
    pieces: [piece('worn', junk, 1), piece('spare', crit(20), null)],
  });

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].instanceId, 'spare');
  assert.equal(plan.moves[0].fromCharacterId, null);
  assert.equal(plan.moves[0].frees, 'worn');
});

test('the chain: one arrival cascades through three builds', () => {
  // Each build wants a different substat, so a piece is only useful to one of
  // them. That is what makes the second move invisible until the first has
  // happened, and it is the case the feature exists for.
  const plan = planCascade({
    builds: [build('a', 1, CR), build('b', 2, CD), build('c', 3, EM)],
    pieces: [
      // The arrival. Only A wants it.
      piece('newCrit', crit(30), null),
      // A is wearing something B would love.
      piece('critDmg', critDmg(30), 1),
      // B is wearing something C would love.
      piece('em', mastery(150), 2),
      piece('junkC', junk, 3),
    ],
  });

  const moves = new Map(plan.moves.map((move) => [move.instanceId, move]));
  assert.deepEqual(
    [...moves.keys()].sort(),
    ['critDmg', 'em', 'newCrit'],
    'all three pieces end up where they are wanted',
  );

  // Order is by value, not by causation: the search takes the biggest net gain
  // available each round, so an independent move can land between two links of
  // a chain. What matters is the dependency, not the sequence.
  assert.ok(
    plan.moves.indexOf(moves.get('newCrit')!) < plan.moves.indexOf(moves.get('critDmg')!),
    'the crit piece can only move once the arrival displaced it',
  );
  assert.equal(moves.get('newCrit')!.frees, 'critDmg');
  assert.equal(moves.get('critDmg')!.fromCharacterId, null, 'it was freed, not taken');

  for (const entry of plan.byBuild) assert.ok(entry.after > entry.before, entry.name);
});

test('an equivalent outcome in fewer moves is preferred', () => {
  // Three builds that want the same thing: who ends up with which piece does
  // not matter, only that the best pieces are in play. One move beats three
  // that arrive at the same total.
  const plan = planCascade({
    builds: [build('a', 1, CR), build('b', 2, CR), build('c', 3, CR)],
    pieces: [
      piece('new', crit(30), null),
      piece('good', crit(20), 1),
      piece('ok', crit(12), 2),
      piece('bad', junk, 3),
    ],
  });

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].toCharacterId, 3, 'to whoever gains most');
});

test('taking from another build is priced, not free', () => {
  // Only one crit piece exists and both builds want it: moving it is a wash.
  const plan = planCascade({
    builds: [build('a', 1, CR), build('b', 2, CR)],
    pieces: [piece('only', crit(20), 1), piece('junk', junk, 2)],
  });

  assert.deepEqual(plan.moves, [], 'a shuffle that gains nothing is not a plan');
});

test('a piece worth more elsewhere does move, and the loser is compensated', () => {
  const plan = planCascade({
    builds: [build('a', 1, CR), build('b', 2, EM)],
    pieces: [
      // B is holding a crit piece it does not care about.
      piece('critty', crit(30), 2),
      piece('masterful', mastery(100), null),
      piece('junkA', junk, 1),
    ],
  });

  const moved = plan.moves.find((move) => move.instanceId === 'critty');
  assert.ok(moved, 'the crit piece belongs with the crit build');
  assert.equal(moved.fromCharacterId, 2);
  // B loses little because a mastery piece is sitting free for it.
  assert.ok(moved.cost < moved.gain);
});

test('the search stops rather than shuffling forever', () => {
  const plan = planCascade({
    builds: [build('a', 1, CR), build('b', 2, CR)],
    pieces: [
      piece('p1', crit(20), 1),
      piece('p2', crit(20), 2),
      piece('p3', crit(20), null),
    ],
    minGain: 0.5,
  });

  assert.ok(plan.moves.length <= 2);
  assert.equal(plan.truncated, false);
});

test('the move cap is reported rather than hidden', () => {
  const builds = Array.from({ length: 6 }, (_, index) => build(`b${index}`, index + 1, CR));
  const pieces = [
    ...builds.map((_, index) => piece(`worn${index}`, junk, index + 1)),
    ...Array.from({ length: 6 }, (_, index) => piece(`free${index}`, crit(20), null)),
  ];

  const plan = planCascade({ builds, pieces, maxMoves: 2 });

  assert.equal(plan.moves.length, 2);
  assert.equal(plan.truncated, true);
});

test('a move that breaks a planned set is marked', () => {
  const planned: CascadeBuild = {
    ...build('a', 1, CR),
    plannedSets: [{ setIds: [SET], pieces: 4 }],
  };

  const worn = (['flower', 'plume', 'sands'] as const).map((slot, index) =>
    piece(`w${index}`, junk, 1, slot));

  const plan = planCascade({
    builds: [planned],
    pieces: [
      ...worn,
      piece('worn', junk, 1),
      { ...piece('offset', crit(30), null), setId: 99999 },
    ],
  });

  assert.equal(plan.moves[0].instanceId, 'offset');
  assert.equal(plan.moves[0].breaksSetFor, 'a');
});

test('slots do not mix', () => {
  const plan = planCascade({
    builds: [build('a', 1, CR)],
    pieces: [
      piece('worn', junk, 1, 'goblet'),
      // A better piece, in a slot that is already fine.
      piece('other', crit(30), null, 'circlet'),
    ],
  });

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].slot, 'circlet', 'it fills the empty circlet, not the goblet');
});

test('chains group a move with what it made possible', () => {
  const plan = planCascade({
    builds: [build('a', 1, CR), build('b', 2, CD)],
    pieces: [
      piece('newCrit', crit(30), null),
      piece('critDmg', critDmg(30), 1),
      piece('junkB', junk, 2),
    ],
  });

  const chains = chainsOf(plan);
  assert.equal(chains.length, 1, 'one arrival, one chain');
  assert.deepEqual(chains[0].map((move) => move.instanceId), ['newCrit', 'critDmg']);
});

test('nothing to do reports nothing, not an empty shuffle', () => {
  const plan = planCascade({
    builds: [build('a', 1, CR)],
    pieces: [piece('best', crit(30), 1), piece('worse', crit(5), null)],
  });

  assert.deepEqual(plan.moves, []);
  assert.equal(plan.netGain, 0);
  assert.equal(plan.byBuild[0].before, plan.byBuild[0].after);
});

test('a piece worn by an unplanned character is free to the plan, not silently free', () => {
  // Character 9 has no build, so taking their goblet costs the plan nothing —
  // and they still lose it, which the move has to say.
  const plan = planCascade({
    builds: [build('a', 1, CR)],
    pieces: [piece('worn', junk, 1), piece('theirs', crit(30), 9)],
  });

  assert.equal(plan.moves.length, 1);
  assert.equal(plan.moves[0].instanceId, 'theirs');
  assert.equal(plan.moves[0].cost, 0, 'no build is harmed');
  assert.equal(plan.moves[0].fromCharacterId, 9, 'but somebody is undressed');
  assert.equal(plan.moves[0].fromPlanned, false);
});
