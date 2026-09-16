import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildStatsFor, type BuildStats } from './piece-score';
import { compareSlot, potentialOf, type ComparablePiece, type CompareInput } from './compare';

const CR = 'FIGHT_PROP_CRITICAL';
const CD = 'FIGHT_PROP_CRITICAL_HURT';
const ATK_PCT = 'FIGHT_PROP_ATTACK_PERCENT';
const ATK = 'FIGHT_PROP_ATTACK';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const DEF = 'FIGHT_PROP_DEFENSE';
const DEF_PCT = 'FIGHT_PROP_DEFENSE_PERCENT';
const HP = 'FIGHT_PROP_HP';

const CRIMSON = 15006;
const GLADIATOR = 15001;

/** A crit build: the circlet wants CRIT DMG, the substats want crit and ATK. */
const build: BuildStats = buildStatsFor({
  mainStats: [[ATK_PCT], ['FIGHT_PROP_FIRE_ADD_HURT'], [CD, CR]],
  substats: [CR, CD, ATK_PCT, ATK],
});

function piece(o: Partial<ComparablePiece> & { instanceId: string }): ComparablePiece {
  return {
    setId: CRIMSON, slot: 'circlet', rarity: 5, level: 20, mainProp: CD, substats: [], ...o,
  };
}

function input(o: Partial<CompareInput> = {}): CompareInput {
  return {
    build,
    plannedSets: [],
    equipped: null,
    candidates: [],
    otherPieces: [],
    statInput: {
      character: { hp: 15000, attack: 300, defense: 800 },
      ascension: null,
      weapon: { baseAttack: 600, prop: CR, value: 0.221 },
      setBonuses: [],
    },
    goals: [],
    bonusesBySet: new Map(),
    ...o,
  };
}

/* ------------------------------------------------------ the prospect --- */

test('a levelled piece with wrong substats loses to a raw one aimed at the build', () => {
  // The example that motivates the whole feature: both are CRIT DMG circlets.
  const equipped = piece({
    instanceId: 'worn', level: 20,
    substats: [
      { prop: CR, value: 3.5 },
      { prop: DEF, value: 60 },
      { prop: DEF_PCT, value: 14.6 },
      { prop: HP, value: 508 },
    ],
  });

  const raw = piece({
    instanceId: 'raw', level: 0,
    substats: [
      { prop: CD, value: 7.0 },
      { prop: ATK_PCT, value: 5.3 },
      { prop: ATK, value: 16 },
      { prop: ER, value: 6.5 },
    ],
  });

  const [swap] = compareSlot(input({ equipped, candidates: [raw] }));

  assert.equal(swap.candidate.instanceId, 'raw');
  assert.equal(swap.kind, 'prospect', 'behind today, ahead once levelled');
  assert.ok(swap.delta < 0, 'it really is worse right now');
  assert.ok(swap.potentialDelta > 0, 'and really is better fully levelled');
  assert.equal(swap.potential.remainingRolls, 5);
});

test('a piece that is better right now and stays better is an upgrade', () => {
  const equipped = piece({ instanceId: 'worn', substats: [{ prop: DEF, value: 60 }] });
  const better = piece({
    instanceId: 'better',
    substats: [{ prop: CR, value: 11.7 }, { prop: CD, value: 14 }],
  });

  const [swap] = compareSlot(input({ equipped, candidates: [better] }));
  assert.equal(swap.kind, 'upgrade');
  assert.ok(swap.delta > 0);
  assert.ok(swap.potentialDelta > 0);
});

test('better now and worse later is a stopgap, and says so', () => {
  // The raw on-set piece already in the slot has five rolls left; the levelled
  // alternative has none. Worth wearing today, worth abandoning later.
  const raw = piece({
    instanceId: 'raw', level: 0,
    substats: [{ prop: CR, value: 3.5 }, { prop: CD, value: 7 }, { prop: ATK_PCT, value: 5.3 }],
  });
  const levelled = piece({
    instanceId: 'levelled', level: 20,
    substats: [{ prop: CR, value: 7 }, { prop: CD, value: 14 }],
  });

  const [swap] = compareSlot(input({ equipped: raw, candidates: [levelled] }));
  assert.equal(swap.kind, 'stopgap');
  assert.ok(swap.delta > 0, 'better today');
  assert.ok(swap.potentialDelta < 0, 'and worse once the raw one is fed');
});

test('a lasting gain ranks above a bigger temporary one', () => {
  const raw = piece({
    instanceId: 'raw', level: 0,
    substats: [{ prop: CR, value: 3.5 }, { prop: CD, value: 7 }, { prop: ATK_PCT, value: 5.3 }],
  });
  const stopgap = piece({
    instanceId: 'stopgap', level: 20,
    substats: [{ prop: CR, value: 11 }, { prop: CD, value: 21 }],
  });
  const lasting = piece({
    instanceId: 'lasting', level: 0,
    substats: [{ prop: CR, value: 7.8 }, { prop: CD, value: 14 }, { prop: ATK_PCT, value: 10 }],
  });

  const swaps = compareSlot(input({ equipped: raw, candidates: [stopgap, lasting] }));

  assert.equal(swaps[0].candidate.instanceId, 'lasting');
  assert.equal(swaps[0].kind, 'upgrade');
  assert.equal(swaps[1].kind, 'stopgap');
  assert.ok(swaps[1].delta > swaps[0].delta, 'the stopgap really is bigger today');
});

test('a piece that is worse now and worse later is not offered at all', () => {
  const equipped = piece({
    instanceId: 'worn',
    substats: [{ prop: CR, value: 11.7 }, { prop: CD, value: 21 }],
  });
  const junk = piece({ instanceId: 'junk', level: 20, substats: [{ prop: DEF, value: 23 }] });

  assert.deepEqual(compareSlot(input({ equipped, candidates: [junk] })), []);
});

test('potential is a range, because where a roll lands is unknown', () => {
  const three = piece({
    instanceId: 'p', level: 0,
    substats: [{ prop: CR, value: 3.9 }, { prop: DEF, value: 19 }, { prop: HP, value: 209 }],
  });

  const potential = potentialOf(three, build);
  assert.ok(potential.max > potential.min, 'a fourth substat is not yet decided');
  assert.equal(potential.remainingRolls, 5);

  const maxed = potentialOf({ ...three, level: 20 }, build);
  assert.equal(maxed.remainingRolls, 0);
  assert.equal(maxed.min, maxed.max, 'nothing left to be uncertain about');
});

/* -------------------------------------------------------- the bonus --- */

test('a swap that breaks the planned four-piece is marked, not hidden', () => {
  const equipped = piece({ instanceId: 'worn', setId: CRIMSON, substats: [] });
  const offSet = piece({
    instanceId: 'off', setId: GLADIATOR,
    substats: [{ prop: CR, value: 11.7 }, { prop: CD, value: 21 }],
  });

  const others = (['flower', 'plume', 'sands'] as const).map((slot, index) =>
    piece({ instanceId: `o${index}`, slot, setId: CRIMSON, mainProp: HP }));

  const [swap] = compareSlot(input({
    equipped,
    candidates: [offSet],
    otherPieces: others,
    plannedSets: [{ setIds: [CRIMSON], pieces: 4 }],
  }));

  assert.equal(swap.keepsSetBonus, false);
  assert.ok(swap.delta > 0, 'still shown, because the trade might be worth it');
});

test('a better piece of the same set keeps the bonus and ranks above one that breaks it', () => {
  const equipped = piece({ instanceId: 'worn', setId: CRIMSON, substats: [] });
  const sameSet = piece({
    instanceId: 'same', setId: CRIMSON,
    substats: [{ prop: CR, value: 7.8 }, { prop: CD, value: 14 }],
  });
  const offSet = piece({
    instanceId: 'off', setId: GLADIATOR,
    substats: [{ prop: CR, value: 11.7 }, { prop: CD, value: 21 }],
  });

  const others = (['flower', 'plume', 'sands'] as const).map((slot, index) =>
    piece({ instanceId: `o${index}`, slot, setId: CRIMSON, mainProp: HP }));

  const swaps = compareSlot(input({
    equipped,
    candidates: [offSet, sameSet],
    otherPieces: others,
    plannedSets: [{ setIds: [CRIMSON], pieces: 4 }],
  }));

  // The off-set piece scores higher, and still loses: keeping the bonus wins.
  assert.equal(swaps[0].candidate.instanceId, 'same');
  assert.equal(swaps[0].keepsSetBonus, true);
});

/* --------------------------------------------------------- the goals --- */

test('a swap that moves a goal from short to met outranks a higher-scoring one', () => {
  const equipped = piece({ instanceId: 'worn', mainProp: CD, substats: [] });

  // Enough Energy Recharge to clear the threshold, but poor for the build.
  const fixesGoal = piece({
    instanceId: 'recharge', mainProp: CD,
    substats: [{ prop: ER, value: 40 }, { prop: CR, value: 3.5 }],
  });
  // Better for the build, does nothing for the goal.
  const scoresHigher = piece({
    instanceId: 'crit', mainProp: CD,
    substats: [{ prop: CR, value: 15 }, { prop: CD, value: 21 }],
  });

  const swaps = compareSlot(input({
    equipped,
    candidates: [scoresHigher, fixesGoal],
    goals: [{ prop: ER, min: 130 }],
  }));

  assert.equal(swaps[0].candidate.instanceId, 'recharge');
  assert.deepEqual(swaps[0].goalChanges, [{ prop: ER, from: 'short', to: 'met' }]);
  assert.ok(swaps[1].delta > swaps[0].delta, 'the other really did score higher');
});

test('a swap that breaks a met goal is reported as such', () => {
  const equipped = piece({
    instanceId: 'worn', mainProp: CD, substats: [{ prop: ER, value: 40 }],
  });
  const loses = piece({
    instanceId: 'nocharge', mainProp: CD,
    substats: [{ prop: CR, value: 15 }, { prop: CD, value: 21 }],
  });

  const [swap] = compareSlot(input({
    equipped, candidates: [loses], goals: [{ prop: ER, min: 130 }],
  }));

  assert.deepEqual(swap.goalChanges, [{ prop: ER, from: 'met', to: 'short' }]);
});

test('an empty slot compares every candidate against nothing', () => {
  const swaps = compareSlot(input({
    equipped: null,
    candidates: [
      piece({ instanceId: 'a', substats: [{ prop: CR, value: 3.9 }] }),
      piece({ instanceId: 'b', substats: [{ prop: CD, value: 21 }] }),
    ],
  }));

  assert.equal(swaps.length, 2);
  assert.ok(swaps.every((swap) => swap.kind === 'upgrade'));
});

/* -------------------------------------------------- what a roll is worth --- */

test('a swap nobody would notice is not offered', () => {
  // Two pieces that score within a rounding error of each other. The row would
  // print `+0.0`, which reads as an opportunity and is not one.
  const equipped = piece({
    instanceId: 'worn', level: 20,
    substats: [{ prop: CR, value: 3.89 }, { prop: ATK_PCT, value: 5.83 }],
  });
  const twin = piece({
    instanceId: 'twin', level: 20,
    substats: [{ prop: CR, value: 3.89 }, { prop: ATK_PCT, value: 5.83 }],
  });

  const swaps = compareSlot(input({ equipped, candidates: [twin] }));
  assert.deepEqual(swaps.map((swap) => swap.candidate.instanceId), []);
});

test('an unfed piece is judged on what rolls are actually worth', () => {
  // The complaint this fixes: any level-zero piece with promising substats used
  // to outrank a finished one, because every remaining roll was priced as a
  // maximum roll landing on the build's first choice.
  const worn = piece({
    instanceId: 'worn', level: 20,
    substats: [
      { prop: CR, value: 3.89 * 3 },
      { prop: CD, value: 7.77 * 2 },
      { prop: ATK_PCT, value: 5.83 },
    ],
  });
  const raw = piece({
    instanceId: 'raw', level: 0,
    substats: [
      { prop: CR, value: 2.72 },
      { prop: CD, value: 5.44 },
      { prop: HP, value: 209.13 },
    ],
  });

  const swaps = compareSlot(input({ equipped: worn, candidates: [raw] }));
  assert.deepEqual(
    swaps.map((swap) => swap.candidate.instanceId),
    [],
    'a raw piece with minimum rolls does not beat a fed one',
  );
});

test('the expectation sits between the bounds, and below the best case', () => {
  const raw = piece({
    instanceId: 'raw', level: 0,
    substats: [{ prop: CR, value: 3.89 }, { prop: CD, value: 7.77 }],
  });

  const potential = potentialOf(raw, build);

  assert.ok(potential.min < potential.expected, 'better than the worst case');
  assert.ok(potential.expected < potential.max, 'and short of the luckiest');
  assert.equal(potential.remainingRolls, 5);
});

test('a finished piece has no potential left to argue about', () => {
  const fed = piece({
    instanceId: 'fed', level: 20, substats: [{ prop: CR, value: 3.89 }],
  });
  const potential = potentialOf(fed, build);

  assert.equal(potential.remainingRolls, 0);
  assert.equal(potential.min, potential.expected);
  assert.equal(potential.expected, potential.max);
});
