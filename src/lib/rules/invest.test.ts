import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  compound,
  kitScaler,
  levelFactor,
  proxy,
  rankSteps,
  relativeGain,
  roleWeight,
  talentMultipliers,
  talentShare,
  type InvestConfig,
  type InvestStep,
} from './invest';

const config = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src', 'data', 'curated', 'invest.json'), 'utf8'),
) as InvestConfig;

test('the level factor alone adds under 3% from 80 to 90, against a level 100 enemy', () => {
  const step = (from: number, to: number) => relativeGain(levelFactor(from, 100), levelFactor(to, 100));
  assert.ok(step(80, 90) > 0);
  assert.ok(step(80, 90) < step(70, 80) * 1.2, 'the factor alone is gentle; the stats carry the rest');
  // 80→90 against level 100: 190/390 over 180/380, about +2.8%.
  assert.ok(Math.abs(step(80, 90) - 0.0285) < 0.001);
});

test('the proxy grows with crit, and caps crit rate at 100%', () => {
  const base = { scaler: 2000, critRate: 50, critDamage: 100, damageBonus: 46.6 };
  assert.ok(proxy({ ...base, critRate: 70 }, 90, 100) > proxy(base, 90, 100));
  assert.equal(proxy({ ...base, critRate: 120 }, 90, 100), proxy({ ...base, critRate: 100 }, 90, 100));
});

test('a talent aimed at 1 carries no share of the damage', () => {
  const target = { auto: 1, skill: 9, burst: 9 };
  assert.equal(talentShare(target, 'auto'), 0);
  assert.equal(talentShare(target, 'skill'), 0.5);
});

test('talent multipliers read the damage rows, level by level', () => {
  const multipliers = talentMultipliers({
    labels: ['Skill DMG|{param1:P}', 'CD|{param2:F1}s'],
    parameters: { param1: [3, 3.2, 3.4], param2: [15, 15, 15] },
  });
  assert.deepEqual(multipliers, [3, 3.2, 3.4]);
});

test('a buff talent falls back to its percentages', () => {
  const multipliers = talentMultipliers({
    labels: ['ATK Bonus Ratio|{param1:F1P}'],
    parameters: { param1: [0.56, 0.6] },
  });
  assert.deepEqual(multipliers, [0.56, 0.6]);
});

test('a main DPS outweighs a healer, and a slot without roles is still fielded', () => {
  assert.ok(roleWeight([['main-dps']], config) > roleWeight([['healer']], config));
  assert.equal(roleWeight([], config), config.unteamedWeight);
  assert.equal(roleWeight([[]], config), config.unteamedWeight);
});

const step = (overrides: Partial<InvestStep>): InvestStep => ({
  characterId: 1, kind: 'talent', talent: 'burst', from: 8, to: 9,
  gain: 0.05, resin: 100, mora: 0, needsCrown: false, belowAcceptable: false,
  ...overrides,
});

const context = (strategy: Parameters<typeof rankSteps>[1]['strategy']) => ({
  strategy,
  weightOf: (id: number) => (id === 1 ? 1 : 0.25),
  membersOf: () => new Set([2]),
  config,
});

test('something the bag already pays for comes first, whatever it adds', () => {
  const ranked = rankSteps([
    step({ characterId: 1, gain: 0.1, resin: 50 }),
    step({ characterId: 2, gain: 0.01, resin: 0 }),
  ], context({ mode: 'balance' }));

  assert.equal(ranked[0].characterId, 2);
  assert.equal(ranked[0].resin, 0);
});

test('the same gain on a main DPS ranks above it on a healer', () => {
  const ranked = rankSteps([
    step({ characterId: 2 }),
    step({ characterId: 1 }),
  ], context({ mode: 'balance' }));

  assert.equal(ranked[0].characterId, 1);
});

test('balancing lifts a step that brings someone up to acceptable', () => {
  const ranked = rankSteps([
    step({ characterId: 1, gain: 0.05 }),
    step({ characterId: 1, talent: 'skill', gain: 0.04, belowAcceptable: true }),
  ], context({ mode: 'balance' }));

  assert.equal(ranked[0].talent, 'skill');
});

test('maximising one character lists only them, one team only its members', () => {
  const steps = [step({ characterId: 1 }), step({ characterId: 2 })];
  assert.deepEqual(rankSteps(steps, context({ mode: 'character', characterId: 1 })).map((s) => s.characterId), [1]);
  assert.deepEqual(rankSteps(steps, context({ mode: 'team', teamId: 't' })).map((s) => s.characterId), [2]);
});

test('a package compounds its gains', () => {
  assert.ok(Math.abs(compound([0.1, 0.1]) - 0.21) < 1e-9);
});

test('the scaler is read off the kit', () => {
  assert.equal(kitScaler([{ labels: ['Skill DMG|{param1:P} Max HP'] }]), 'FIGHT_PROP_HP');
  assert.equal(kitScaler([{ labels: ['Skill DMG|{param1:P} DEF'] }]), 'FIGHT_PROP_DEFENSE');
  assert.equal(kitScaler([{ labels: ['Skill DMG|{param1:P}'] }]), null, 'a bare percentage is ATK');
});
