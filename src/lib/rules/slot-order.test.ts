import assert from 'node:assert/strict';
import { test } from 'node:test';

import { preferredPositions } from './slot-order';

test('the carry goes second and the sustain last', () => {
  assert.equal(preferredPositions(['main-dps'])[0], 1);
  assert.equal(preferredPositions(['driver'])[0], 1);
  assert.equal(preferredPositions(['healer'])[0], 3);
  assert.equal(preferredPositions(['shielder'])[0], 3);
});

test('off-field roles fill the first and third, and leave the second for last', () => {
  assert.deepEqual(preferredPositions(['sub-dps']), [0, 2, 3, 1]);
  assert.equal(preferredPositions(['buffer'])[0], 2);
  assert.equal(preferredPositions([]).at(-1), 1);
});

test('the role that pins hardest decides', () => {
  assert.equal(preferredPositions(['battery', 'main-dps'])[0], 1);
});
