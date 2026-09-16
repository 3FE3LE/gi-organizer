import assert from 'node:assert/strict';
import { test } from 'node:test';

import { CHOOSABLE_SLOTS } from './piece-score';
import { ROLE_TEMPLATES, templateFor } from './role-templates';
import type { BuildPriority } from './suggest';

const VENTI = 10000022;

const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const EM = 'FIGHT_PROP_ELEMENT_MASTERY';
const CRIT = 'FIGHT_PROP_CRITICAL';

test('every role has thresholds worth clearing', () => {
  for (const [role, template] of Object.entries(ROLE_TEMPLATES)) {
    assert.ok(template.goals.length > 0, `${role} has no goal`);
    assert.ok(template.substats.length > 0, `${role} has no substat order`);
  }
});

test('the damage goblet becomes the character\'s own element', () => {
  const { mainStats } = templateFor('main-dps', 'ELEMENT_ANEMO', undefined, CHOOSABLE_SLOTS);

  assert.equal(mainStats.goblet, 'FIGHT_PROP_WIND_ADD_HURT');
});

test('an elementless character still gets a usable goblet', () => {
  const { mainStats } = templateFor('main-dps', 'ELEMENT_NONE', undefined, CHOOSABLE_SLOTS);

  assert.equal(mainStats.goblet, 'FIGHT_PROP_ATTACK_PERCENT');
});

test('what the community says about this character beats the generic role', () => {
  const priority: BuildPriority = {
    characterId: VENTI,
    role: 'Support',
    // Positional over sands, goblet, circlet.
    mainStats: [[EM], [EM], [CRIT]],
    substats: [EM, ER],
    artifacts: [],
    weapons: [],
  };

  const { mainStats, substats } = templateFor(
    'buffer', 'ELEMENT_ANEMO', priority, CHOOSABLE_SLOTS,
  );

  assert.equal(mainStats.sands, EM, 'the generic buffer wants recharge here');
  assert.equal(mainStats.goblet, EM);
  assert.deepEqual(substats, [EM, ER]);
});

test('a goal with no role still resolves, with nothing invented', () => {
  const { goals, mainStats, substats } = templateFor(
    null, 'ELEMENT_ANEMO', undefined, CHOOSABLE_SLOTS,
  );

  assert.deepEqual(goals, []);
  assert.deepEqual(mainStats, {});
  assert.deepEqual(substats, []);
});

test('a buffer is asked for recharge before anything else', () => {
  const { goals } = templateFor('buffer', 'ELEMENT_ANEMO', undefined, CHOOSABLE_SLOTS);

  assert.deepEqual(goals, [{ prop: ER, min: 200 }]);
});

test('a list written for another job does not overwrite this one', () => {
  // Venti's community page is a sub-dps build: attack sands, crit circlet.
  const priority: BuildPriority = {
    characterId: VENTI,
    role: 'Sub DPS',
    mainStats: [['FIGHT_PROP_ATTACK_PERCENT'], ['FIGHT_PROP_WIND_ADD_HURT'], [CRIT]],
    substats: [CRIT, 'FIGHT_PROP_CRITICAL_HURT'],
    artifacts: [],
    weapons: [],
  };

  const asBuffer = templateFor('buffer', 'ELEMENT_ANEMO', priority, CHOOSABLE_SLOTS);
  assert.equal(asBuffer.mainStats.sands, ER, 'a buffer wants its burst back');
  assert.deepEqual(asBuffer.substats.slice(0, 2), [ER, EM]);

  // The same list, for the job it was written about.
  const asSubDps = templateFor('sub-dps', 'ELEMENT_ANEMO', priority, CHOOSABLE_SLOTS);
  assert.equal(asSubDps.mainStats.sands, 'FIGHT_PROP_ATTACK_PERCENT');
  assert.deepEqual(asSubDps.substats.slice(0, 2), [CRIT, 'FIGHT_PROP_CRITICAL_HURT']);
});
