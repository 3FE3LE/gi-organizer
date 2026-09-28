import assert from 'node:assert/strict';
import { test } from 'node:test';

import { archetypeFit, archetypeRolls, meetsArchetype, type Archetype } from './archetype';

const DEF = 'FIGHT_PROP_DEFENSE_PERCENT';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const CR = 'FIGHT_PROP_CRITICAL';
const CD = 'FIGHT_PROP_CRITICAL_HURT';
const ATK = 'FIGHT_PROP_ATTACK_PERCENT';
const FLAT = 'FIGHT_PROP_DEFENSE';

/** DEF% and recharge, with crit on top. */
const build: Archetype = { required: [DEF, ER], optional: [CR, CD] };

const props = (...list: string[]) => new Set(list);

test('a piece without every required substat is not listed', () => {
  assert.equal(meetsArchetype(props(DEF, CR, CD, ATK), build), false);
  assert.equal(meetsArchetype(props(DEF, ER, FLAT, ATK), build), true);
});

test('a piece with both optionals leads, then one, then none', () => {
  const fits = [
    archetypeFit(props(DEF, ER, CR, CD), build),
    archetypeFit(props(DEF, ER, CD, ATK), build),
    archetypeFit(props(DEF, ER, ATK, FLAT), build),
  ];
  assert.deepEqual(fits, [2, 1, 0]);
});

test('the tiebreak counts only rolls into the substats the build named', () => {
  const substats = [
    { prop: DEF, rolls: 3 }, { prop: ER, rolls: 1 }, { prop: FLAT, rolls: 2 }, { prop: CR, rolls: 1 },
  ].map((entry) => ({ ...entry, count: 0, efficiency: 1, perfect: false, value: 0 }));
  assert.equal(archetypeRolls(substats as never, build), 5);
});
