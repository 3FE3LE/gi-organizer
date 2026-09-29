import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import type { Need } from './materials';
import {
  estimateResin,
  spanOf,
  type BossDrop,
  type ResinMaterial,
  type ResinRates,
  type WorldLevel,
} from './resin';

const rates = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src', 'data', 'curated', 'resin.json'), 'utf8'),
) as ResinRates;

const MORA = 202;
const [TEACHINGS, GUIDE, PHILOSOPHIES] = [104301, 104302, 104303];
const CROWN = 104319;
const WEAPON = [114001, 114002, 114003, 114004];
const HORN = 113001;
const [PLUME, CLAW, SIGH] = [113003, 113004, 113005];
const GEM = 104111;

const BOOK: ResinMaterial = {
  category: 'characterTalentMaterial', sortRank: 9104301, domain: 'Forsaken Rift',
};

const materials = new Map<number, ResinMaterial>([
  [TEACHINGS, BOOK],
  [GUIDE, BOOK],
  [PHILOSOPHIES, BOOK],
  [CROWN, { category: 'characterTalentMaterial', sortRank: 9104319, domain: null }],
  ...WEAPON.map((id): [number, ResinMaterial] => [
    id, { category: 'weaponAscensionMaterial', sortRank: 6114001, domain: 'Cecilia Garden' },
  ]),
  [HORN, { category: 'characterLevelUpMaterial', sortRank: 7113001, domain: null }],
  [PLUME, { category: 'characterLevelUpMaterial', sortRank: 7113003, domain: null }],
  [CLAW, { category: 'characterLevelUpMaterial', sortRank: 7113004, domain: null }],
  [SIGH, { category: 'characterLevelUpMaterial', sortRank: 7113005, domain: null }],
  [GEM, { category: 'characterAscensionMaterial', sortRank: 8104111, domain: null }],
  [MORA, { category: 'commonCurrency', sortRank: 1, domain: null }],
]);

const bosses = new Map<number, BossDrop>([
  [HORN, { kind: 'world', boss: 'Anemo Hypostases' }],
  [PLUME, { kind: 'weekly', boss: 'Stormterror' }],
  [CLAW, { kind: 'weekly', boss: 'Stormterror' }],
  [SIGH, { kind: 'weekly', boss: 'Stormterror' }],
]);

function need(materialId: number, needed: number, owned = 0): Need {
  return { materialId, needed, owned, short: Math.max(0, needed - owned), by: [] };
}

function estimate(demand: Need[], worldLevel: WorldLevel = 8) {
  const stock = new Map(demand.map((entry) => [entry.materialId, entry.owned]));
  return estimateResin({ demand, stock, materials, bosses, rates, worldLevel });
}

const sourceOf = (result: ReturnType<typeof estimate>, source: string) =>
  result.bySource.find((entry) => entry.source === source);

test('three talents to nine cost about eighty book runs at world level eight', () => {
  // Talents 1→9 on all three: 9 Teachings, 63 Guides, 66 Philosophies.
  const result = estimate([need(TEACHINGS, 9), need(GUIDE, 63), need(PHILOSOPHIES, 66)]);

  // 9 + 63·3 + 66·9 = 792 Teachings' worth; a run yields 2.2 + 1.98·3 + 0.22·9.
  const perRun = 2.2 + 1.98 * 3 + 0.22 * 9;
  const runs = Math.ceil(792 / perRun);
  assert.equal(sourceOf(result, 'talent')?.runs, runs);
  assert.equal(result.total, runs * 20);
});

test('a spare lower tier crafts up and lowers the runs', () => {
  const plain = estimate([need(TEACHINGS, 0), need(GUIDE, 63)]);
  const spare = estimate([need(TEACHINGS, 0, 90), need(GUIDE, 63)]);

  assert.ok(sourceOf(spare, 'talent')!.runs < sourceOf(plain, 'talent')!.runs);
});

test('a spare higher tier does not craft down', () => {
  const short = estimate([need(TEACHINGS, 30), need(PHILOSOPHIES, 0, 50)]);

  // Thirty Teachings missing, whatever else is in the bag.
  assert.equal(sourceOf(short, 'talent')?.runs, Math.ceil(30 / (2.2 + 1.98 * 3 + 0.22 * 9)));
});

test('a covered family costs nothing', () => {
  const result = estimate([need(TEACHINGS, 9, 9), need(GUIDE, 21, 30)]);
  assert.equal(result.total, 0);
});

test('weekly bosses pool their three drops and count weeks of three', () => {
  const result = estimate([need(PLUME, 6), need(CLAW, 6), need(SIGH, 6)]);
  const weekly = sourceOf(result, 'weekly-boss');

  const runs = Math.ceil(18 / 2.4);
  assert.equal(weekly?.runs, runs);
  assert.equal(weekly?.resin, runs * 30);
  assert.equal(result.weeklyWeeks, Math.ceil(runs / 3));
  // Weekly bosses are the slower constraint here: 8 runs are three weeks.
  assert.equal(result.days, (result.weeklyWeeks - 1) * 7 + 1);
});

test('world bosses are priced per drop at forty resin', () => {
  const result = estimate([need(HORN, 46)]);
  assert.equal(sourceOf(result, 'world-boss')?.runs, Math.ceil(46 / 2.5556));
  assert.equal(result.total, Math.ceil(46 / 2.5556) * 40);
});

test('mora is reported beside the total, never in it', () => {
  const result = estimate([need(MORA, 2_000_000, 500_000), need(HORN, 3)]);

  assert.equal(result.total, sourceOf(result, 'world-boss')?.resin);
  assert.equal(result.mora.short, 1_500_000);
  assert.equal(result.mora.resinIfFarmed, Math.ceil(1_500_000 / 60_000) * 20);
});

test('gems, crowns and anything without a domain or a boss cost no resin', () => {
  const result = estimate([need(GEM, 9), need(CROWN, 1)]);
  assert.equal(result.total, 0);
  assert.deepEqual(result.bySource, []);
});

test('a lower world level needs more runs for the same books', () => {
  const demand = [need(TEACHINGS, 9), need(GUIDE, 63), need(PHILOSOPHIES, 66)];
  assert.ok(estimate(demand, 2).total > estimate(demand, 8).total);
});

test('weapon domains count four tiers', () => {
  const result = estimate([need(WEAPON[0], 5), need(WEAPON[1], 14), need(WEAPON[2], 14), need(WEAPON[3], 6)]);

  const perRun = 2.2 + 2.418 * 3 + 0.62 * 9 + 0.062 * 27;
  const worth = 5 + 14 * 3 + 14 * 9 + 6 * 27;
  assert.equal(sourceOf(result, 'weapon')?.runs, Math.ceil(worth / perRun));
});

test('a span reads in the unit that fits', () => {
  assert.deepEqual(spanOf(3.2), { unit: 'day', count: 4 });
  assert.deepEqual(spanOf(21), { unit: 'week', count: 3 });
  assert.deepEqual(spanOf(120), { unit: 'month', count: 4 });
  assert.deepEqual(spanOf(374), { unit: 'year', count: 1 });
  assert.deepEqual(spanOf(1000), { unit: 'year', count: 2.7 });
});
