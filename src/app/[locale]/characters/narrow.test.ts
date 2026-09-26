import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RosterFilters } from './filters';
import { narrowRoster } from './narrow';

const roster = [
  { id: 1, name: 'Kinich', elementType: 'ELEMENT_DENDRO', weaponType: 'WEAPON_CLAYMORE', rarity: 5 },
  { id: 2, name: 'Émilie', elementType: 'ELEMENT_DENDRO', weaponType: 'WEAPON_POLE', rarity: 5 },
  { id: 3, name: 'Bennett', elementType: 'ELEMENT_PYRO', weaponType: 'WEAPON_SWORD_ONE_HAND', rarity: 4 },
  { id: 4, name: 'Amber', elementType: 'ELEMENT_PYRO', weaponType: 'WEAPON_BOW', rarity: 4 },
];

const none: Pick<RosterFilters, 'q' | 'element' | 'weapon' | 'rarity' | 'sort'> = {
  q: '', element: [], weapon: [], rarity: [], sort: 'release',
};
const ids = (list: { id: number }[]) => list.map((entry) => entry.id);

test('a typed name matches without its case or accents', () => {
  assert.deepEqual(ids(narrowRoster(roster, { ...none, q: 'emil' }, new Map(), 'es')), [2]);
  assert.deepEqual(ids(narrowRoster(roster, { ...none, q: '  BEN ' }, new Map(), 'es')), [3]);
});

test('values in one filter widen, filters together narrow', () => {
  const rarity = narrowRoster(roster, { ...none, rarity: [4, 5] }, new Map(), 'es');
  assert.equal(rarity.length, 4);

  const both = narrowRoster(roster, { ...none, rarity: [4], weapon: ['bow', 'claymore'] }, new Map(), 'es');
  assert.deepEqual(ids(both), [4]);
});

test('by level, the ones you have lead, and ties keep release order', () => {
  const progress = new Map([[3, { level: 90, constellation: 6 }], [4, { level: 90, constellation: 1 }], [2, { level: 80, constellation: 0 }]]);
  assert.deepEqual(ids(narrowRoster(roster, { ...none, sort: 'level' }, progress, 'es')), [3, 4, 2, 1]);
  assert.deepEqual(ids(narrowRoster(roster, { ...none, sort: 'constellation' }, progress, 'es')), [3, 4, 2, 1]);
});

test('by name, in the reader\'s alphabet', () => {
  assert.deepEqual(ids(narrowRoster(roster, { ...none, sort: 'name' }, new Map(), 'es')), [4, 3, 2, 1]);
});

test('an element chip reads the game\'s enum', () => {
  assert.deepEqual(ids(narrowRoster(roster, { ...none, element: ['dendro'] }, new Map(), 'es')), [1, 2]);
});
