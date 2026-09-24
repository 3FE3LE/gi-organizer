import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Catalog } from '@/lib/data/catalog';

import { isRecommendableSet, isRecommendableWeapon } from './rarity-floor';

const catalog = {
  weapons: new Map([[1, { rarity: 3 }], [2, { rarity: 4 }], [3, { rarity: 5 }]]),
  artifacts: new Map([[10, { rarityList: [3, 4] }], [11, { rarityList: [4, 5] }]]),
} as unknown as Catalog;

test('three-star weapons are never recommended', () => {
  assert.equal(isRecommendableWeapon(catalog, 1), false);
  assert.equal(isRecommendableWeapon(catalog, 2), true);
  assert.equal(isRecommendableWeapon(catalog, 3), true);
});

test('a set is judged by the best rarity it drops in', () => {
  assert.equal(isRecommendableSet(catalog, 10), false);
  assert.equal(isRecommendableSet(catalog, 11), true);
});

test('an id the catalog does not know is not recommended', () => {
  assert.equal(isRecommendableWeapon(catalog, 99), false);
  assert.equal(isRecommendableSet(catalog, 99), false);
});
