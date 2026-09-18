import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { Stacking } from '@/lib/annotations/types';

import { aurasOf, mechanicsOf, resonancesOf, synergyOf, type SynergyMember } from './synergy';

const member = (
  characterId: number,
  elementType: string,
  mechanics: string[] = [],
  sets: { setId: number; pieces: number }[] = [],
): SynergyMember => ({ characterId, elementType, mechanics, sets });

const PYRO = 'ELEMENT_PYRO';
const HYDRO = 'ELEMENT_HYDRO';
const ELECTRO = 'ELEMENT_ELECTRO';
const DENDRO = 'ELEMENT_DENDRO';
const ANEMO = 'ELEMENT_ANEMO';
const GEO = 'ELEMENT_GEO';

const nothingStacks = () => 'stacks' as Stacking;

test('two of an element resonate', () => {
  const [resonance, ...rest] = resonancesOf([
    member(1, PYRO), member(2, PYRO), member(3, HYDRO), member(4, ANEMO),
  ]);

  assert.equal(resonance.id, 'fervent-flames');
  assert.deepEqual(resonance.members, [1, 2]);
  assert.deepEqual(rest, []);
});

test('two pairs resonate twice', () => {
  const ids = resonancesOf([
    member(1, PYRO), member(2, PYRO), member(3, HYDRO), member(4, HYDRO),
  ]).map((resonance) => resonance.id);

  assert.deepEqual(ids.sort(), ['fervent-flames', 'soothing-water']);
});

test('four different elements get the canopy instead', () => {
  const [resonance] = resonancesOf([
    member(1, PYRO), member(2, HYDRO), member(3, ELECTRO), member(4, ANEMO),
  ]);

  assert.equal(resonance.id, 'protective-canopy');
  assert.equal(resonance.elementType, null);
});

test('three different elements are not a canopy', () => {
  assert.deepEqual(resonancesOf([member(1, PYRO), member(2, HYDRO), member(3, ANEMO)]), []);
});

test('a pair resonates before the team is full', () => {
  const [resonance] = resonancesOf([member(1, GEO), member(2, GEO)]);

  assert.equal(resonance.id, 'enduring-rock');
});

test('the elements on the field decide which reactions are live', () => {
  const ids = mechanicsOf([
    member(1, PYRO, ['vaporize']), member(2, HYDRO, ['vaporize']),
  ], null).map((mechanic) => mechanic.id);

  assert.deepEqual(ids, ['vaporize']);
});

test('a reaction nobody can trigger is left out', () => {
  const mechanics = mechanicsOf([member(1, PYRO, ['melt']), member(2, PYRO)], null);

  assert.deepEqual(mechanics, []);
});

test('the objective is listed even when an element is missing', () => {
  const [mechanic] = mechanicsOf([member(1, PYRO), member(2, HYDRO)], 'hyperbloom');

  assert.equal(mechanic.id, 'hyperbloom');
  assert.equal(mechanic.active, false);
  assert.deepEqual(mechanic.missing, ['ELEMENT_DENDRO', 'ELEMENT_ELECTRO']);
});

test('a lunar reaction needs somebody who carries it, not just the elements', () => {
  const elementsOnly = mechanicsOf([
    member(1, HYDRO, ['electro-charged']), member(2, ELECTRO, ['electro-charged']),
  ], 'lunar-charged');
  const [lunar] = elementsOnly.filter((mechanic) => mechanic.id === 'lunar-charged');

  assert.equal(lunar.active, false);
  assert.deepEqual(lunar.missing, []);

  const withCarrier = mechanicsOf([
    member(1, HYDRO, ['lunar-charged']), member(2, ELECTRO),
  ], 'lunar-charged');

  assert.equal(withCarrier[0].active, true);
});

test('swirl needs the wind and something to catch', () => {
  const alone = mechanicsOf([member(1, ANEMO, ['swirl']), member(2, GEO)], null);
  assert.deepEqual(alone, []);

  const [swirl] = mechanicsOf([member(1, ANEMO, ['swirl']), member(2, PYRO)], null);
  assert.equal(swirl.active, true);
});

test('a kit-only mechanic counts once a second member agrees', () => {
  const alone = mechanicsOf([member(1, HYDRO, ['hexerei']), member(2, PYRO)], null);
  assert.deepEqual(alone, []);

  const [shared] = mechanicsOf([
    member(1, HYDRO, ['hexerei']), member(2, PYRO, ['hexerei']),
  ], null);

  assert.equal(shared.id, 'hexerei');
  assert.deepEqual(shared.carriers, [1, 2]);
  assert.equal(shared.active, true);
});

test('the objective comes first, then what is live', () => {
  const ids = mechanicsOf([
    member(1, DENDRO, ['bloom', 'quicken']),
    member(2, HYDRO, ['bloom']),
    member(3, ELECTRO, ['quicken', 'hyperbloom']),
  ], 'hyperbloom').map((mechanic) => mechanic.id);

  assert.equal(ids[0], 'hyperbloom');
  assert.deepEqual(ids.slice(1).sort(), ['bloom', 'quicken']);
});

test('only a set that reaches past its wearer is an aura', () => {
  const stacking = (setId: number): Stacking =>
    setId === 15007 ? 'non-stacking' : 'stacks';

  const auras = aurasOf([
    member(1, PYRO, [], [{ setId: 15007, pieces: 4 }, { setId: 15025, pieces: 4 }]),
  ], stacking);

  assert.equal(auras.length, 1);
  assert.equal(auras[0].setId, 15007);
  assert.equal(auras[0].pieces, 4);
});

test('two pieces of a party set is still only the wearer\'s bonus', () => {
  const auras = aurasOf(
    [member(1, PYRO, [], [{ setId: 15007, pieces: 2 }])],
    () => 'non-stacking' as Stacking,
  );

  assert.deepEqual(auras, []);
});

test('a circlet-only set reaches the party at one piece', () => {
  const [aura] = aurasOf(
    [member(1, PYRO, [], [{ setId: 15040, pieces: 1 }])],
    () => 'non-stacking' as Stacking,
    () => 1,
  );

  assert.equal(aura.setId, 15040);
});

test('two wearers of one aura name each other', () => {
  const auras = aurasOf([
    member(1, PYRO, [], [{ setId: 15007, pieces: 4 }]),
    member(2, HYDRO, [], [{ setId: 15007, pieces: 4 }]),
  ], () => 'non-stacking' as Stacking);

  assert.deepEqual(auras.map((aura) => aura.wearer), [1, 2]);
  assert.deepEqual(auras[0].alsoWornBy, [2]);
  assert.deepEqual(auras[1].alsoWornBy, [1]);
});

test('a partitioned set is marked as one', () => {
  const [aura] = aurasOf(
    [member(1, ANEMO, [], [{ setId: 15002, pieces: 4 }])],
    () => 'partitioned' as Stacking,
  );

  assert.equal(aura.partitioned, true);
});

test('one call answers all three questions', () => {
  const synergy = synergyOf([
    member(1, PYRO, ['vaporize'], [{ setId: 15007, pieces: 4 }]),
    member(2, PYRO, ['vaporize']),
    member(3, HYDRO, ['vaporize']),
  ], { objective: 'vaporize', setStacking: nothingStacks });

  assert.deepEqual(synergy.resonances.map((resonance) => resonance.id), ['fervent-flames']);
  assert.deepEqual(synergy.mechanics.map((mechanic) => mechanic.id), ['vaporize']);
  assert.deepEqual(synergy.auras, []);
});
