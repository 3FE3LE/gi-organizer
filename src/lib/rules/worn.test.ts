import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ArtifactSlot } from '@/lib/data/types';

import { wornMainStats, wornSetPlan, wornSubstats, type WornPiece } from './worn';

const CRIT = 'FIGHT_PROP_CRITICAL';
const CRIT_DMG = 'FIGHT_PROP_CRITICAL_HURT';
const ATK = 'FIGHT_PROP_ATTACK_PERCENT';
const EM = 'FIGHT_PROP_ELEMENT_MASTERY';
const ER = 'FIGHT_PROP_CHARGE_EFFICIENCY';
const HEAL = 'FIGHT_PROP_HEAL_ADD';

function piece(
  slot: ArtifactSlot,
  mainProp: string,
  substats: { prop: string; value: number }[] = [],
  setId = 15025,
): WornPiece {
  return { setId, slot, rarity: 5, mainProp, substats };
}

test('four of one set is a four-piece plan', () => {
  const worn = [
    piece('flower', 'FIGHT_PROP_HP'),
    piece('plume', 'FIGHT_PROP_ATTACK'),
    piece('sands', ATK),
    piece('goblet', ATK),
  ];

  assert.deepEqual(wornSetPlan(worn), [15025]);
});

test('two and two is a 2+2', () => {
  const worn = [
    piece('flower', 'FIGHT_PROP_HP', [], 15025),
    piece('plume', 'FIGHT_PROP_ATTACK', [], 15025),
    piece('sands', ATK, [], 15008),
    piece('goblet', ATK, [], 15008),
  ];

  assert.deepEqual(wornSetPlan(worn).sort(), [15008, 15025]);
});

test('five unrelated pieces state no plan', () => {
  const worn = ([15001, 15002, 15003, 15004, 15005] as const).map((setId, index) =>
    piece((['flower', 'plume', 'sands', 'goblet', 'circlet'] as const)[index], ATK, [], setId));

  assert.deepEqual(wornSetPlan(worn), []);
});

test('only the slots where the main stat is a choice', () => {
  const worn = [
    piece('flower', 'FIGHT_PROP_HP'),
    piece('plume', 'FIGHT_PROP_ATTACK'),
    piece('sands', EM),
    piece('circlet', CRIT),
  ];

  assert.deepEqual(wornMainStats(worn), { sands: EM, circlet: CRIT });
});

test('a character wearing nothing states nothing', () => {
  assert.deepEqual(wornMainStats([]), {});
  assert.deepEqual(wornSubstats(CRIT_DMG, []), []);
});

test('the ascension stat leads the substats it can roll', () => {
  const worn = [piece('flower', 'FIGHT_PROP_HP', [{ prop: ER, value: 19.4 }])];

  assert.equal(wornSubstats(CRIT_DMG, worn)[0], CRIT_DMG);
});

test('an ascension stat no artifact can roll does not lead them', () => {
  const worn = [piece('flower', 'FIGHT_PROP_HP', [{ prop: ER, value: 19.4 }])];

  assert.deepEqual(wornSubstats(HEAL, worn), [ER]);
});

test('the rest is ranked by rolls, not by raw value', () => {
  // 19 flat ATK is one roll; 19 Elemental Mastery is not far off one either,
  // and comparing the numbers instead of the rolls would call them equal.
  const worn = [
    piece('sands', ATK, [
      { prop: EM, value: 62 },
      { prop: CRIT, value: 3.1 },
    ]),
    piece('goblet', ATK, [
      { prop: CRIT, value: 3.5 },
      { prop: ER, value: 5.2 },
    ]),
  ];

  assert.deepEqual(wornSubstats(HEAL, worn), [EM, CRIT, ER]);
});

test('the priority stops at four', () => {
  const worn = [
    piece('sands', ATK, [
      { prop: EM, value: 62 }, { prop: CRIT, value: 3.1 },
      { prop: ER, value: 5.2 }, { prop: ATK, value: 5.8 },
    ]),
  ];

  assert.deepEqual(wornSubstats(CRIT_DMG, worn).length, 4);
  assert.equal(wornSubstats(CRIT_DMG, worn)[0], CRIT_DMG);
});
