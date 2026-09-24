import assert from 'node:assert/strict';
import { test } from 'node:test';

import { crownsNeeded } from './crowns';

test('a crown per talent aimed at 10 from below it, none for one already there', () => {
  const current = { auto: 9, skill: 10, burst: 6 };
  assert.equal(crownsNeeded(current, { auto: 10, skill: 10, burst: 9 }), 1);
  assert.equal(crownsNeeded(current, { auto: 10, skill: 10, burst: 10 }), 2);
  assert.equal(crownsNeeded(current, { auto: 9, skill: 10, burst: 9 }), 0);
  assert.equal(crownsNeeded(current, null), 0);
});
