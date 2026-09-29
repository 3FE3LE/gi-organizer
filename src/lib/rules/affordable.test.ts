import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { characterReach, talentReach, weaponReach, type LevellingData } from './affordable';

const data = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src', 'data', 'curated', 'levelling.json'), 'utf8'),
) as LevellingData;

const MORA = 202;
const HEROS_WIT = 104003;
const MYSTIC_ORE = 104013;
const GEM = 900001;
const BOOK = 900002;

const costs = {
  ascend1: [{ id: GEM, count: 1 }, { id: MORA, count: 20_000 }],
  ascend2: [{ id: GEM, count: 3 }, { id: MORA, count: 40_000 }],
};

test('books alone reach the cap of the phase, and no further', () => {
  // 1→20 is 120 175 EXP: seven Hero's Wit, and mora to feed them.
  const reach = characterReach({
    characterId: 1,
    current: { level: 1, ascension: 0 },
    target: { level: 90, ascension: 6 },
    ascensionCosts: costs,
    stock: new Map([[HEROS_WIT, 50], [MORA, 1_000_000]]),
    data,
  });

  assert.deepEqual(reach.to, { level: 20, ascension: 0 }, 'no gem, no ascension');
  assert.equal(reach.fates, 0);
});

test('an ascension paid for opens the next cap and grants its fate', () => {
  const reach = characterReach({
    characterId: 1,
    current: { level: 1, ascension: 0 },
    target: { level: 90, ascension: 6 },
    ascensionCosts: costs,
    stock: new Map([[HEROS_WIT, 50], [MORA, 1_000_000], [GEM, 1]]),
    data,
  });

  assert.equal(reach.to.ascension, 1);
  assert.equal(reach.to.level, 40, 'on to the new cap with the books left');
  assert.equal(reach.fates, 1, 'phase one grants an Acquaint Fate');
});

test('without mora to feed them, books level nothing', () => {
  const reach = characterReach({
    characterId: 1,
    current: { level: 1, ascension: 0 },
    target: { level: 90, ascension: 6 },
    ascensionCosts: costs,
    stock: new Map([[HEROS_WIT, 50], [MORA, 100]]),
    data,
  });

  assert.deepEqual(reach.to, { level: 1, ascension: 0 });
});

test('talents climb the lowest first, up to their target', () => {
  const reach = talentReach({
    characterId: 1,
    current: { auto: 1, skill: 6, burst: 1 },
    target: { auto: 1, skill: 9, burst: 9 },
    talentCosts: {
      lvl2: [{ id: BOOK, count: 1 }],
      lvl3: [{ id: BOOK, count: 1 }],
      lvl7: [{ id: BOOK, count: 5 }],
    },
    stock: new Map([[BOOK, 2]]),
  });

  // Two books: burst 1→2→3; the skill's level seven needs five.
  assert.deepEqual(reach.to, { auto: 1, skill: 6, burst: 3 });
  assert.equal(reach.levels, 2);
});

test('a low-rarity weapon stops at seventy', () => {
  const reach = weaponReach({
    instanceId: 'w',
    weaponId: 1,
    holderId: null,
    rarity: 2,
    current: { level: 1, ascension: 0 },
    costs: {
      ascend1: [], ascend2: [], ascend3: [], ascend4: [], ascend5: [], ascend6: [],
    },
    stock: new Map([[MYSTIC_ORE, 1_000], [MORA, 10_000_000]]),
    data,
  });

  assert.deepEqual(reach.to, { level: 70, ascension: 4 });
  assert.equal(reach.maxed, true);
});
