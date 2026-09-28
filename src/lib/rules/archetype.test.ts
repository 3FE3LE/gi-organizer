import assert from 'node:assert/strict';
import { test } from 'node:test';

import { archetypeFit, archetypeRolls, meetsArchetype, type Archetype } from './archetype';

const DEF = 'FIGHT_PROP_DEFENSE_PERCENT';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const CR = 'FIGHT_PROP_CRITICAL';
const CD = 'FIGHT_PROP_CRITICAL_HURT';
const ATK = 'FIGHT_PROP_ATTACK_PERCENT';
const FLAT = 'FIGHT_PROP_DEFENSE';

/** DEF% and recharge, crit on top, ATK% in place of either crit line. */
const build: Archetype = { required: [DEF, ER], optional: [CR, CD], wildcard: ATK };

const props = (...list: string[]) => new Set(list);

test('a piece without every required substat is not listed', () => {
  assert.equal(meetsArchetype(props(DEF, CR, CD, ATK), build), false);
  assert.equal(meetsArchetype(props(DEF, ER, FLAT, ATK), build), true);
});

test('both optionals lead, then an optional with the wildcard, then one alone', () => {
  const fits = [
    archetypeFit(props(DEF, ER, CR, CD), build),
    archetypeFit(props(DEF, ER, CD, ATK), build),
    archetypeFit(props(DEF, ER, CR, FLAT), build),
    archetypeFit(props(DEF, ER, ATK, FLAT), build),
    archetypeFit(props(DEF, ER, FLAT, 'FIGHT_PROP_HP'), build),
  ];
  assert.deepEqual(fits, [4, 3, 2, 1, 0]);
});

test('the tiebreak counts only rolls into the substats the build named', () => {
  const substats = [
    { prop: DEF, rolls: 3 }, { prop: ER, rolls: 1 }, { prop: FLAT, rolls: 2 }, { prop: CR, rolls: 1 },
  ].map((entry) => ({ ...entry, count: 0, efficiency: 1, perfect: false, value: 0 }));
  assert.equal(archetypeRolls(substats as never, build), 5);
});
