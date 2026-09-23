import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ownedRefinement, plannedRefinement } from './refinement';

test('a weapon that cannot be forged is at the refinement of the copy', () => {
  // The Skyward Blade R2 swapped for a Black Sword R1: the old R2 must not stay.
  assert.equal(plannedRefinement({ stored: 2, forgeable: false, owned: 1 }), 1);
  // Nor may "fill from role" wish a five-star up to R5.
  assert.equal(plannedRefinement({ stored: 5, forgeable: false, owned: 1 }), 1);
  assert.equal(plannedRefinement({ stored: null, forgeable: false, owned: null }), 1);
});

test('a forgeable weapon keeps its target, floored at what is held', () => {
  assert.equal(plannedRefinement({ stored: 5, forgeable: true, owned: 1 }), 5);
  assert.equal(plannedRefinement({ stored: 1, forgeable: true, owned: 3 }), 3);
  assert.equal(plannedRefinement({ stored: null, forgeable: true, owned: 2 }), 2);
});

test('the copy is the one worn, else the best owned', () => {
  const copies = [
    { refinement: 1, holder: 10000021 },
    { refinement: 3, holder: null },
  ];

  assert.equal(ownedRefinement(copies, 10000021), 1);
  assert.equal(ownedRefinement(copies, 10000022), 3);
  assert.equal(ownedRefinement([], 10000022), null);
});
