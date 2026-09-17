import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Need } from '@/lib/rules/materials';

import { groupAnytime, type MaterialGrouping } from './anytime';

const CATALOG: Record<number, MaterialGrouping> = {
  202: { typeText: 'Moneda común', sortRank: 10 },
  100082: { typeText: 'Objeto típico de Mondstadt', sortRank: 311 },
  112001: { typeText: 'Material de mejora de personaje y arma', sortRank: 10604 },
  112002: { typeText: 'Material de mejora de personaje y arma', sortRank: 10604 },
  113001: { typeText: 'Material de mejora de personaje', sortRank: 11101 },
  104101: { typeText: 'Material de ascensión de personaje', sortRank: 12102 },
};

function need(materialId: number, short = 1): Need {
  return { materialId, needed: short, owned: 0, short, by: [] };
}

const describe = (materialId: number) => CATALOG[materialId];

test('every material lands in the pile the catalog puts it in', () => {
  const groups = groupAnytime(
    [need(113001), need(112001), need(202)],
    describe,
  );

  assert.deepEqual(groups.map((group) => group.label), [
    'Moneda común',
    'Material de mejora de personaje y arma',
    'Material de mejora de personaje',
  ]);
});

test('the piles come out in the order the bag is in', () => {
  const groups = groupAnytime(
    [need(104101), need(100082), need(202)],
    describe,
  );

  assert.deepEqual(groups.map((group) => group.label), [
    'Moneda común',
    'Objeto típico de Mondstadt',
    'Material de ascensión de personaje',
  ]);
});

test('a pile carries what it is short in total', () => {
  const [group] = groupAnytime([need(112001, 30), need(112002, 12)], describe);

  assert.equal(group.label, 'Material de mejora de personaje y arma');
  assert.equal(group.short, 42);
  // Tiers of one family share a rank, so the id decides and they stay adjacent.
  assert.deepEqual(group.needs.map((entry) => entry.materialId), [112001, 112002]);
});

test('a material the catalog cannot place is still shown, last', () => {
  const groups = groupAnytime([need(999999), need(202)], describe);

  assert.deepEqual(groups.map((group) => group.label), ['Moneda común', 'Otros materiales']);
});
