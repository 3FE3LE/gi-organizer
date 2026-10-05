import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { WeaponFilters } from './filters';
import { narrowWeapons } from './narrow';

const catalogue = [
  { id: 1, name: 'Mistsplitter Reforged', rarity: 5, weaponType: 'WEAPON_SWORD_ONE_HAND', effectName: 'Mistsplitter' },
  { id: 2, name: 'Favonius Warbow', rarity: 4, weaponType: 'WEAPON_BOW', effectName: 'Windfall' },
  { id: 3, name: 'Slingshot', rarity: 3, weaponType: 'WEAPON_BOW', effectName: 'Slingshot' },
  { id: 4, name: 'Silver Sword', rarity: 2, weaponType: 'WEAPON_SWORD_ONE_HAND', effectName: '' },
  { id: 5, name: 'Élégie', rarity: 5, weaponType: 'WEAPON_BOW', effectName: 'Elegy' },
];

const copies = [
  { weaponId: 2, level: 90, refinement: 3, equippedTo: null },
  { weaponId: 2, level: 80, refinement: 1, equippedTo: 7 },
  { weaponId: 3, level: 1, refinement: 5, equippedTo: null },
  { weaponId: 1, level: 20, refinement: 1, equippedTo: 9 },
];

const none: Pick<WeaponFilters, 'q' | 'type' | 'rarity' | 'held' | 'sort'> = {
  q: '', type: [], rarity: [], held: null, sort: 'rarity',
};
const ids = (list: { weapon: { id: number } }[]) => list.map((entry) => entry.weapon.id);

test('one entry per weapon, its worn copy first', () => {
  const { owned, ownedTotal } = narrowWeapons(catalogue, copies, none, 'en');
  assert.deepEqual(ids(owned), [1, 2, 3]);
  assert.equal(ownedTotal, 3);
  assert.deepEqual(owned[1].copies.map((copy) => copy.equippedTo), [7, null]);
});

test('the weapons not owned are only the ones with a passive', () => {
  const { missing } = narrowWeapons(catalogue, copies, none, 'en');
  assert.deepEqual(missing.map((weapon) => weapon.id), [5]);
});

test('type and rarity narrow both lists; a typed name ignores accents', () => {
  const bows = narrowWeapons(catalogue, copies, { ...none, type: ['bow'], rarity: [5, 4] }, 'en');
  assert.deepEqual(ids(bows.owned), [2]);
  assert.deepEqual(bows.missing.map((weapon) => weapon.id), [5]);

  const typed = narrowWeapons(catalogue, copies, { ...none, q: 'elegie' }, 'en');
  assert.deepEqual(typed.missing.map((weapon) => weapon.id), [5]);
});

test('who holds a copy narrows the copies, and drops the weapons nobody owns', () => {
  const free = narrowWeapons(catalogue, copies, { ...none, held: 'free' }, 'en');
  assert.deepEqual(ids(free.owned), [2, 3]);
  assert.deepEqual(free.owned[0].copies.map((copy) => copy.refinement), [3]);
  assert.deepEqual(free.missing, []);
});

test('refinement orders by the best copy', () => {
  const { owned } = narrowWeapons(catalogue, copies, { ...none, sort: 'refinement' }, 'en');
  assert.deepEqual(ids(owned), [3, 2, 1]);
});
