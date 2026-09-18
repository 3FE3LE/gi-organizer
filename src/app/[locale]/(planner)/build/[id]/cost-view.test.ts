import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Catalog } from '@/lib/data/catalog';
import type { CharacterView } from '@/lib/data/types';

import { familiesOf } from './cost-view';

const MORA = 202;
/** Four tiers of one gem, adjacent ids, one rank. */
const GEM = [104161, 104162, 104163, 104164];
/** Three tiers of one mob drop, billed by both ascension and talents. */
const DROP = [112044, 112045, 112046];
const BOOK = [104323, 104324, 104325];
const SPECIALTY = 101202;
/**
 * The pair that breaks any rule written over ids: an ascension boss drop and a
 * weekly boss drop, same `sortRank`, adjacent ids. Eight characters have it.
 */
const BOSS = 113015;
const WEEKLY = 113016;

const RANKS: Record<number, number> = {
  [MORA]: 10,
  [SPECIALTY]: 313,
  [BOSS]: 11101,
  [WEEKLY]: 11101,
  ...Object.fromEntries(GEM.map((id) => [id, 12107])),
  ...Object.fromEntries(DROP.map((id) => [id, 10615])),
  ...Object.fromEntries(BOOK.map((id) => [id, 13108])),
};

const catalog = {
  materials: new Map(
    Object.entries(RANKS).map(([id, sortRank]) => [Number(id), { sortRank }]),
  ),
} as unknown as Catalog;

const character = {
  costs: {
    ascend1: [{ id: MORA, count: 20_000 }, { id: GEM[0], count: 1 }, { id: SPECIALTY, count: 3 }, { id: DROP[0], count: 3 }],
    ascend2: [{ id: GEM[1], count: 3 }, { id: BOSS, count: 2 }, { id: DROP[0], count: 15 }],
    ascend4: [{ id: GEM[2], count: 6 }, { id: BOSS, count: 4 }, { id: DROP[1], count: 12 }],
    ascend6: [{ id: GEM[3], count: 6 }, { id: BOSS, count: 20 }, { id: DROP[2], count: 24 }],
  },
  talentCosts: {
    lvl2: [{ id: MORA, count: 12_500 }, { id: BOOK[0], count: 3 }, { id: DROP[0], count: 6 }],
    lvl5: [{ id: BOOK[1], count: 4 }, { id: DROP[1], count: 6 }],
    lvl9: [{ id: BOOK[2], count: 12 }, { id: DROP[2], count: 9 }, { id: WEEKLY, count: 1 }],
  },
} as unknown as CharacterView;

test('the tiers of one material are one family', () => {
  const families = familiesOf(catalog, character);

  assert.equal(new Set(GEM.map((id) => families.get(id))).size, 1);
  assert.equal(new Set(BOOK.map((id) => families.get(id))).size, 1);
});

test('a drop billed by both ascension and talents is still one family', () => {
  const families = familiesOf(catalog, character);

  assert.equal(new Set(DROP.map((id) => families.get(id))).size, 1);
});

test('the ascension boss and the weekly boss stay apart, rank and ids notwithstanding', () => {
  const families = familiesOf(catalog, character);

  assert.equal(RANKS[BOSS], RANKS[WEEKLY], 'the fixture is only interesting if the ranks collide');
  assert.equal(WEEKLY - BOSS, 1, 'and only if the ids are adjacent');
  assert.notEqual(families.get(BOSS), families.get(WEEKLY));
});

test('mora belongs to no family: it is a total, not a row', () => {
  assert.equal(familiesOf(catalog, character).get(MORA), undefined);
});
