import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DEAD_ORDER, SCALER_PROPS, pieceWorth, substatWeight } from './worth';

/** Maximum rolls at five stars, so a value is a whole number of top rolls. */
const MAX: Record<string, number> = {
  FIGHT_PROP_CRITICAL: 3.89,
  FIGHT_PROP_CRITICAL_HURT: 7.77,
  FIGHT_PROP_CHARGE_EFFICIENCY: 6.48,
  FIGHT_PROP_ATTACK_PERCENT: 5.83,
  FIGHT_PROP_HP_PERCENT: 5.83,
  FIGHT_PROP_ELEMENT_MASTERY: 23.31,
  FIGHT_PROP_DEFENSE_PERCENT: 7.29,
  FIGHT_PROP_DEFENSE: 23.15,
  FIGHT_PROP_HP: 298.75,
  FIGHT_PROP_ATTACK: 19.45,
};

/** `rolls` maximum rolls of `prop`, which is what the tier table calls perfect. */
function perfect(prop: string, rolls: number) {
  return { prop, value: Math.round(MAX[prop] * rolls * 100) / 100 };
}

function piece(...substats: { prop: string; value: number }[]) {
  return { rarity: 5, substats };
}

test('crit is the unit and the others are priced against it', () => {
  assert.equal(substatWeight('FIGHT_PROP_CRITICAL', null), 1);
  assert.equal(substatWeight('FIGHT_PROP_CRITICAL_HURT', null), 1);
  assert.equal(substatWeight('FIGHT_PROP_CHARGE_EFFICIENCY', null), 0.6);
});

test('a scaler counts only when it is the one being ranked for', () => {
  assert.equal(substatWeight(SCALER_PROPS.em, 'em'), 0.7);
  assert.equal(substatWeight(SCALER_PROPS.em, 'atk'), 0);
  assert.equal(substatWeight(SCALER_PROPS.em, null), 0);
});

test('flat substats are worth nothing to anybody', () => {
  for (const prop of ['FIGHT_PROP_ATTACK', 'FIGHT_PROP_HP', 'FIGHT_PROP_DEFENSE']) {
    for (const scaler of [null, 'atk', 'hp', 'em', 'def'] as const) {
      assert.equal(substatWeight(prop, scaler), 0, `${prop} for ${scaler}`);
    }
  }
});

test('DEF% stops being dead for the one build that scales off it', () => {
  const worth = pieceWorth(piece(perfect(SCALER_PROPS.def, 3)), 'def');

  assert.equal(worth.wasted, 0);
  assert.ok(Math.abs(worth.value - 3 * 0.7) < 0.01);

  const elsewhere = pieceWorth(piece(perfect(SCALER_PROPS.def, 3)), 'atk');
  assert.ok(Math.abs(elsewhere.wasted - 3) < 0.01);
  assert.equal(elsewhere.value, 0);
});

/**
 * The reading the whole module exists for: perfect luck into nothing is not a
 * good artifact, and the old average-tier reading called it one.
 */
test('perfect rolls into dead substats score zero and read as waste', () => {
  const cursed = pieceWorth(
    piece(perfect('FIGHT_PROP_DEFENSE', 3), perfect('FIGHT_PROP_HP', 3)),
    'atk',
  );

  assert.equal(cursed.value, 0);
  assert.equal(cursed.useful, 0);
  assert.ok(Math.abs(cursed.wasted - 6) < 0.01);
  assert.equal(cursed.wastedCount, 6);
});

test('a scaler nobody asked for is not counted, but is not waste either', () => {
  const worth = pieceWorth(piece(perfect(SCALER_PROPS.hp, 2)), 'atk');

  assert.equal(worth.value, 0);
  assert.equal(worth.useful, 0);
  // Dead is a property of the substat, not of the question being asked.
  assert.equal(worth.wasted, 0);
});

/**
 * The reading with nothing named, which is the one the page opens on: a piece
 * is priced on the scaler it actually carries, so a mastery piece is a good
 * artifact rather than an invisible one.
 */
test('with no scaler named, the piece is priced on the best one it carries', () => {
  const mastery = pieceWorth(piece(perfect(SCALER_PROPS.em, 4)), null);

  assert.equal(mastery.serves, 'em');
  assert.ok(Math.abs(mastery.value - 4 * 0.7) < 0.02, `value was ${mastery.value}`);
  assert.equal(mastery.wasted, 0);
});

test('a piece that carries nothing but flats still scores zero and reads as waste', () => {
  const cursed = pieceWorth(piece(perfect('FIGHT_PROP_DEFENSE', 4)), null);

  assert.equal(cursed.serves, null);
  assert.equal(cursed.value, 0);
  assert.ok(Math.abs(cursed.wasted - 4) < 0.02);
});

test('only the best scaler counts, so spreading rolls does not pay', () => {
  const spread = pieceWorth(
    piece(
      perfect(SCALER_PROPS.atk, 1),
      perfect(SCALER_PROPS.hp, 1),
      perfect(SCALER_PROPS.em, 1),
    ),
    null,
  );
  const focused = pieceWorth(piece(perfect(SCALER_PROPS.atk, 3)), null);

  assert.ok(Math.abs(spread.value - 0.7) < 0.02, `spread was ${spread.value}`);
  assert.ok(Math.abs(focused.value - 2.1) < 0.02, `focused was ${focused.value}`);
  assert.ok(focused.value > spread.value);
});

/**
 * What the general mode is for: a DEF piece is a good artifact for the one
 * build that wants it, and saying so is better than scoring it zero.
 */
test('a DEF piece is priced and labelled rather than hidden', () => {
  const worth = pieceWorth(piece(perfect(SCALER_PROPS.def, 3)), null);

  assert.equal(worth.serves, 'def');
  assert.ok(Math.abs(worth.value - 3 * 0.7) < 0.02);
  assert.equal(worth.wasted, 0);
});

test('DEF% is waste on a piece that serves some other scaler', () => {
  const worth = pieceWorth(
    piece(perfect(SCALER_PROPS.atk, 3), perfect(SCALER_PROPS.def, 1)),
    null,
  );

  assert.equal(worth.serves, 'atk');
  assert.ok(Math.abs(worth.wasted - 1) < 0.02, `wasted was ${worth.wasted}`);
});

test('crit still outweighs any scaler, roll for roll', () => {
  const crit = pieceWorth(piece(perfect('FIGHT_PROP_CRITICAL_HURT', 3)), null);
  const scaler = pieceWorth(piece(perfect(SCALER_PROPS.em, 3)), null);

  assert.ok(crit.value > scaler.value);
});

test('the worked example adds up', () => {
  const worth = pieceWorth(
    piece(
      perfect('FIGHT_PROP_CRITICAL_HURT', 3),
      perfect(SCALER_PROPS.em, 2),
      perfect('FIGHT_PROP_CHARGE_EFFICIENCY', 1),
      perfect('FIGHT_PROP_DEFENSE', 3),
    ),
    'em',
  );

  // 3 × 1 + 2 × 0.7 + 1 × 0.6 + 3 × 0
  assert.ok(Math.abs(worth.value - 5) < 0.02, `value was ${worth.value}`);
  assert.ok(Math.abs(worth.wasted - 3) < 0.02);
  assert.equal(worth.wastedCount, 3);
  assert.equal(worth.count, 9);
});

test('the dead list is ordered worst first and covers every flat substat', () => {
  assert.deepEqual(DEAD_ORDER, [
    'FIGHT_PROP_DEFENSE',
    'FIGHT_PROP_DEFENSE_PERCENT',
    'FIGHT_PROP_HP',
    'FIGHT_PROP_ATTACK',
  ]);
});
