import assert from 'node:assert/strict';
import { test } from 'node:test';

import { defaultSetPlan, effectiveSetPlan, setFitOf } from './set-fit';

const CRIMSON = 15006;
const TROUPE = 15003;
const GILDED = 15026;
const GLADIATOR = 15001;

const fourPiece = [{ setIds: [CRIMSON], pieces: 4 }];
const twoTwo = [{ setIds: [CRIMSON, GLADIATOR], pieces: 2 }];

test('a planned set counts toward an unfinished four-piece', () => {
  // The old test only asked whether the plan held afterwards, so with two of
  // four worn every swap — this one included — read as breaking the set.
  assert.equal(setFitOf(fourPiece, [CRIMSON, CRIMSON, GILDED, GILDED], CRIMSON), 'on-plan');
});

test('an off-set piece in a slot the four-piece still needs is off-plan', () => {
  assert.equal(setFitOf(fourPiece, [CRIMSON, CRIMSON, CRIMSON, TROUPE], GILDED), 'off-plan');
  assert.equal(setFitOf(fourPiece, [CRIMSON, CRIMSON, TROUPE], GILDED), 'off-plan');
});

test('the fifth slot of a finished four-piece is flex', () => {
  assert.equal(setFitOf(fourPiece, [CRIMSON, CRIMSON, CRIMSON, CRIMSON], GILDED), 'flex');
  assert.equal(setFitOf(fourPiece, [CRIMSON, CRIMSON, CRIMSON, CRIMSON], CRIMSON), 'on-plan');
});

test('a surplus piece of one pair spends the slot the other pair needs', () => {
  assert.equal(setFitOf(twoTwo, [CRIMSON, CRIMSON, CRIMSON, GLADIATOR], CRIMSON), 'off-plan');
  assert.equal(setFitOf(twoTwo, [CRIMSON, CRIMSON, CRIMSON, GLADIATOR], GLADIATOR), 'on-plan');
  assert.equal(setFitOf(twoTwo, [CRIMSON, CRIMSON, GLADIATOR, GLADIATOR], GILDED), 'flex');
});

test('with no plan there is nothing to respect', () => {
  assert.equal(setFitOf([], [CRIMSON], GILDED), 'flex');
});

test('an unplanned build is held to the set its own form would propose', () => {
  const suggestions = [
    { setIds: [GILDED], pieces: 4, feasible: false },
    { setIds: [CRIMSON], pieces: 4, feasible: true },
    { setIds: [TROUPE], pieces: 4, feasible: true },
  ];

  // The first a teammate does not already cover — what "fill from the role"
  // writes.
  assert.deepEqual(defaultSetPlan(suggestions), [{ setIds: [CRIMSON], pieces: 4 }]);
  assert.deepEqual(effectiveSetPlan([], suggestions), [{ setIds: [CRIMSON], pieces: 4 }]);
  assert.deepEqual(effectiveSetPlan(null, suggestions), [{ setIds: [CRIMSON], pieces: 4 }]);

  // The player's own plan always wins.
  assert.deepEqual(effectiveSetPlan(twoTwo, suggestions), twoTwo);

  // Nothing feasible: the first at all, rather than none.
  assert.deepEqual(
    defaultSetPlan([{ setIds: [GILDED], pieces: 4, feasible: false }]),
    [{ setIds: [GILDED], pieces: 4 }],
  );
  assert.deepEqual(defaultSetPlan([]), []);
});
