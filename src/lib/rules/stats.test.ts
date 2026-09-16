import assert from 'node:assert/strict';
import { test } from 'node:test';

import { computeStats, evaluateGoals, mainStatValue } from './stats';

const ATK_PCT = 'FIGHT_PROP_ATTACK_PERCENT';
const ATK = 'FIGHT_PROP_ATTACK';
const HP = 'FIGHT_PROP_HP';
const CR = 'FIGHT_PROP_CRITICAL';
const CD = 'FIGHT_PROP_CRITICAL_HURT';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const EM = 'FIGHT_PROP_ELEMENT_MASTERY';
const ANEMO = 'FIGHT_PROP_WIND_ADD_HURT';

test('main stat anchors match the game at both ends', () => {
  assert.equal(mainStatValue(HP, 5, 0), 717);
  assert.equal(mainStatValue(HP, 5, 20), 4780);
  assert.equal(mainStatValue(CD, 5, 20), 62.2);
  // A four-star tops out at +16, not +20.
  assert.equal(mainStatValue(ATK_PCT, 4, 16), 38.7);
  assert.equal(mainStatValue(ATK_PCT, 4, 20), 38.7, 'clamped, not extrapolated');
});

test('interpolated levels stay within the measured error bound', () => {
  // Published +4 values. Linear interpolation is not the game's exact table, so
  // the test pins the error rather than pretending there is none.
  const worst = [
    [HP, 4, 1530], [ATK, 4, 100], [CR, 4, 10.0], [CD, 4, 20.0], [EM, 4, 60], [ER, 4, 16.6],
  ].reduce((max, [prop, level, published]) => {
    const computed = mainStatValue(prop as string, 5, level as number);
    const error = Math.abs(computed - (published as number)) / (published as number);
    assert.ok(computed <= (published as number), `${prop} must never read high`);
    return Math.max(max, error);
  }, 0);

  assert.ok(worst < 0.007, `worst relative error ${(worst * 100).toFixed(2)}%`);
});

test('an unknown prop contributes nothing rather than guessing', () => {
  assert.equal(mainStatValue('FIGHT_PROP_NONSENSE', 5, 20), 0);
});

/* ------------------------------------------------------------ totals --- */

const character = { hp: 10000, attack: 300, defense: 800 };

test('ATK percent scales the weapon base too', () => {
  const withoutWeapon = computeStats({
    character, ascension: null, weapon: null, pieces: [], setBonuses: [],
  });
  assert.equal(withoutWeapon.totals[ATK], 300);

  const withWeapon = computeStats({
    character,
    ascension: null,
    weapon: { baseAttack: 600, prop: ATK_PCT, value: 0.496 },
    pieces: [],
    setBonuses: [],
  });

  // (300 + 600) * 1.496 — applying the percentage to the character alone is the
  // classic way to be quietly wrong.
  assert.ok(Math.abs(withWeapon.totals[ATK] - 900 * 1.496) < 0.01);
  assert.equal(withWeapon.base.attack, 900);
});

test('flat and percentage contributions do not interfere', () => {
  const stats = computeStats({
    character,
    ascension: null,
    weapon: { baseAttack: 600, prop: null, value: 0 },
    pieces: [{
      slot: 'plume', rarity: 5, level: 20, mainProp: ATK,
      substats: [{ prop: ATK_PCT, value: 10 }],
    }],
    setBonuses: [],
  });

  // 900 * 1.10 + 311
  assert.ok(Math.abs(stats.totals[ATK] - (900 * 1.1 + 311)) < 0.01);
});

test('crit, recharge and their innate floors', () => {
  const bare = computeStats({
    character, ascension: null, weapon: null, pieces: [], setBonuses: [],
  });

  assert.equal(bare.totals[CR], 5);
  assert.equal(bare.totals[CD], 50);
  assert.equal(bare.totals[ER], 100);

  const kitted = computeStats({
    character, ascension: null, weapon: null,
    pieces: [{
      slot: 'circlet', rarity: 5, level: 20, mainProp: CD,
      substats: [{ prop: CR, value: 7.8 }],
    }],
    setBonuses: [],
  });

  assert.ok(Math.abs(kitted.totals[CD] - (50 + 62.2)) < 0.01);
  assert.ok(Math.abs(kitted.totals[CR] - (5 + 7.8)) < 0.01);
});

test('a two-piece bonus is added like any other source', () => {
  const stats = computeStats({
    character, ascension: null, weapon: null, pieces: [],
    setBonuses: [{ prop: ANEMO, value: 15 }, { prop: ATK_PCT, value: 18 }],
  });

  assert.equal(stats.totals[ANEMO], 15);
  assert.ok(Math.abs(stats.totals[ATK] - 300 * 1.18) < 0.01);
});

test('the ascension bonus converts from the catalog ratio', () => {
  const percent = computeStats({
    character, ascension: { prop: ATK_PCT, value: 0.24 }, weapon: null,
    pieces: [], setBonuses: [],
  });
  assert.ok(Math.abs(percent.totals[ATK] - 300 * 1.24) < 0.01);

  // Elemental Mastery is a flat number in both, so it must not be scaled.
  const mastery = computeStats({
    character, ascension: { prop: EM, value: 96 }, weapon: null,
    pieces: [], setBonuses: [],
  });
  assert.equal(mastery.totals[EM], 96);
});

/* ------------------------------------------------------------- goals --- */

test('a goal is met, close, or short', () => {
  const totals = { [ER]: 160, [CR]: 68, [CD]: 130 };

  const verdicts = evaluateGoals(totals, [
    { prop: ER, min: 160 },
    { prop: CR, min: 70 },
    { prop: CD, min: 200 },
  ]);

  assert.equal(verdicts[0].status, 'met');
  assert.equal(verdicts[1].status, 'close', 'within five percent of the target');
  assert.equal(verdicts[2].status, 'short');
  assert.ok(verdicts[2].margin < -0.3);
});

test('a goal on a stat nothing supplies reads as zero, not as absent', () => {
  const [verdict] = evaluateGoals({}, [{ prop: EM, min: 200 }]);
  assert.equal(verdict.actual, 0);
  assert.equal(verdict.status, 'short');
});
