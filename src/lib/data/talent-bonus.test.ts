import assert from 'node:assert/strict';
import { test } from 'node:test';

import { talentBonusAt } from './talent-bonus';

const venti = { burst: { constellation: 3, levels: 3 }, skill: { constellation: 5, levels: 3 } };

test('a constellation adds its levels from the one that grants them', () => {
  assert.deepEqual(talentBonusAt(venti, 0), { auto: 0, skill: 0, burst: 0 });
  assert.deepEqual(talentBonusAt(venti, 3), { auto: 0, skill: 0, burst: 3 });
  assert.deepEqual(talentBonusAt(venti, 6), { auto: 0, skill: 3, burst: 3 });
});

test('a character with no boosts known adds nothing', () => {
  assert.deepEqual(talentBonusAt(undefined, 6), { auto: 0, skill: 0, burst: 0 });
});
