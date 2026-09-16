import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  MAX_CRIT_VALUE,
  critRating,
  critRolls,
  critValue,
  pieceQuality,
  qualityOf,
  rollTiers,
  rollsOf,
} from './rolls';

/**
 * The published five-star table, as the game's own screens round it.
 *
 * This is the point of the file: the module stores ten maxima and derives the
 * other thirty numbers from one rule, so the rule has to be checked against the
 * table people actually quote. If a future patch breaks the 70/80/90/100
 * relationship, this is where it shows.
 */
/** The game shows flat stats as whole numbers and percentages to one decimal. */
const FLAT = new Set([
  'FIGHT_PROP_HP', 'FIGHT_PROP_ATTACK', 'FIGHT_PROP_DEFENSE',
  'FIGHT_PROP_ELEMENT_MASTERY',
]);

const FIVE_STAR: Record<string, [number, number, number, number]> = {
  FIGHT_PROP_HP: [209, 239, 269, 299],
  // 5.2, not the 5.3 some hand-typed tables carry: 5.83 × 0.9 = 5.247.
  FIGHT_PROP_HP_PERCENT: [4.1, 4.7, 5.2, 5.8],
  FIGHT_PROP_ATTACK: [14, 16, 18, 19],
  FIGHT_PROP_ATTACK_PERCENT: [4.1, 4.7, 5.2, 5.8],
  FIGHT_PROP_DEFENSE: [16, 19, 21, 23],
  // 6.6, likewise: 7.29 × 0.9 = 6.561.
  FIGHT_PROP_DEFENSE_PERCENT: [5.1, 5.8, 6.6, 7.3],
  FIGHT_PROP_ELEMENT_MASTERY: [16, 19, 21, 23],
  FIGHT_PROP_CHARGE_EFFICIENCY: [4.5, 5.2, 5.8, 6.5],
  FIGHT_PROP_CRITICAL: [2.7, 3.1, 3.5, 3.9],
  FIGHT_PROP_CRITICAL_HURT: [5.4, 6.2, 7.0, 7.8],
};

test('the derived tiers are the published five-star table', () => {
  for (const [prop, expected] of Object.entries(FIVE_STAR)) {
    const tiers = rollTiers(prop, 5);

    assert.equal(tiers.length, 4, prop);
    tiers.forEach((tier, index) => {
      const decimals = FLAT.has(prop) ? 0 : 1;
      assert.equal(
        Number(tier.toFixed(decimals)),
        expected[index],
        `${prop} tier ${index}: ${tier} should read as ${expected[index]}`,
      );
    });
  }
});

test('a maximum roll is one roll at full efficiency', () => {
  const quality = qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 3.89 }, 5);

  assert.equal(quality?.count, 1);
  assert.equal(quality?.tier, 'máximo');
  assert.equal(quality?.perfect, true);
});

test('a minimum roll is one roll at the floor', () => {
  const quality = qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 2.7 }, 5);

  assert.equal(quality?.count, 1);
  assert.equal(quality?.tier, 'mínimo');
  assert.equal(quality?.perfect, false);
  assert.ok(quality && quality.efficiency < 0.71);
});

test('the roll count comes back out of the value alone', () => {
  // Three crit rate rolls at the floor read as three, not as two good ones:
  // `n` rolls span `0.7n` to `n`, and those ranges never overlap.
  const floor = qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 2.72 * 3 }, 5);
  assert.equal(floor?.count, 3);

  const ceiling = qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 3.89 * 3 }, 5);
  assert.equal(ceiling?.count, 3);
  assert.equal(ceiling?.perfect, true);

  // And the boundary between two and three is where the table puts it.
  assert.equal(qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 3.89 * 2 }, 5)?.count, 2);
});

test('four stars roll on their own scale', () => {
  const five = qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 3.89 }, 5);
  const four = qualityOf({ prop: 'FIGHT_PROP_CRITICAL', value: 2.72 }, 4);

  assert.equal(five?.perfect, true);
  assert.equal(four?.perfect, true, 'a four-star maximum is not a five-star minimum');
});

test('an unknown substat has no quality rather than a wrong one', () => {
  assert.equal(qualityOf({ prop: 'FIGHT_PROP_HEAL_ADD', value: 10 }, 5), null);
  assert.equal(rollsOf('FIGHT_PROP_HEAL_ADD', 10, 5), 0);
});

test('a piece reports how the dice treated it, not what a build wants', () => {
  const lucky = pieceQuality({
    rarity: 5,
    substats: [
      { prop: 'FIGHT_PROP_CRITICAL', value: 3.89 },
      { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 7.77 },
      { prop: 'FIGHT_PROP_ATTACK_PERCENT', value: 5.83 },
      { prop: 'FIGHT_PROP_HP', value: 298.75 },
    ],
  });

  const unlucky = pieceQuality({
    rarity: 5,
    substats: [
      { prop: 'FIGHT_PROP_CRITICAL', value: 2.72 },
      { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 5.44 },
      { prop: 'FIGHT_PROP_ATTACK_PERCENT', value: 4.08 },
      { prop: 'FIGHT_PROP_HP', value: 209.13 },
    ],
  });

  // The same four substats, and not the same piece at all.
  assert.equal(lucky.hasPerfect, true);
  assert.equal(unlucky.hasPerfect, false);
  assert.ok((lucky.efficiency ?? 0) > 0.99);
  assert.ok((unlucky.efficiency ?? 1) < 0.71);
  assert.equal(lucky.count, 4);
  assert.equal(unlucky.count, 4);
});

/* ----------------------------------------------------------- crit value --- */

test('crit value is two parts rate to one part damage', () => {
  assert.equal(
    critValue([
      { prop: 'FIGHT_PROP_CRITICAL', value: 10 },
      { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 20 },
    ]),
    40,
  );
});

test('the weights make one crit roll worth the same either way', () => {
  const rate = critValue([{ prop: 'FIGHT_PROP_CRITICAL', value: 3.89 }]);
  const damage = critValue([{ prop: 'FIGHT_PROP_CRITICAL_HURT', value: 7.77 }]);

  assert.ok(Math.abs(rate - damage) < 0.02, `${rate} vs ${damage}`);
  assert.ok(Math.abs(critRolls(rate) - 1) < 0.01, 'and reads as exactly one roll');
});

test('nothing but crit counts toward it', () => {
  assert.equal(
    critValue([
      { prop: 'FIGHT_PROP_ELEMENT_MASTERY', value: 23.31 },
      { prop: 'FIGHT_PROP_HP', value: 298.75 },
      { prop: 'FIGHT_PROP_CHARGE_EFFICIENCY', value: 6.48 },
    ]),
    0,
    'a mastery piece has no crit value and can still be excellent',
  );
});

test('the ceiling is seven crit rolls, which is about 54', () => {
  assert.ok(MAX_CRIT_VALUE > 54 && MAX_CRIT_VALUE < 55, String(MAX_CRIT_VALUE));

  // A piece that started with both crit substats and took every upgrade.
  const perfect = critValue([
    { prop: 'FIGHT_PROP_CRITICAL', value: 3.89 },
    { prop: 'FIGHT_PROP_CRITICAL_HURT', value: 7.77 * 6 },
  ]);

  assert.ok(Math.abs(perfect - MAX_CRIT_VALUE) < 0.2, String(perfect));
});

test('the ratings land where the guides put them', () => {
  assert.equal(critRating(0), 'ninguno');
  // Two and a half rolls is around twenty, the figure quoted as "worth keeping".
  assert.equal(critRating(19), 'normal');
  assert.equal(critRating(22), 'bueno');
  assert.equal(critRating(30), 'bueno');
  // Five rolls is around forty, the figure quoted as rare.
  assert.equal(critRating(40), 'excelente');
  assert.equal(critRating(50), 'excelente');
});
