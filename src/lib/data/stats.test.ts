import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ascensionForLevel, isAscended, levelLabel, progressLevel, statLevelKey, statsAtLevel } from './stats';
import type { StatTable } from './types';

/** Lisa's table, trimmed to the rows the cases below touch. */
const TABLE: StatTable = {
  '50': { level: 50, hp: 5074.1, attack: 122.75, specialized: 24 },
  '50+': { level: 50, hp: 5641.97, attack: 136.49, specialized: 48 },
  '60': { level: 60, hp: 6304.74, attack: 152.52, specialized: 48 },
  '60+': { level: 60, hp: 6730.64, attack: 162.83, specialized: 48 },
  '70': { level: 70, hp: 7392.6, attack: 178.84, specialized: 48 },
};

test('the ascension phase decides which side of a breakpoint a level is on', () => {
  assert.equal(statLevelKey(45, 2), '40+');
  assert.equal(statLevelKey(50, 2), '50', 'at the cap of its phase, before the ascension');
  assert.equal(statLevelKey(50, 3), '50+', 'ascended at 50 reads the post-ascension row');
  assert.equal(statLevelKey(60, 3), '60');
  assert.equal(statLevelKey(60, 4), '60+');
  assert.equal(statLevelKey(90, 6), '90');
});

test('a level on a breakpoint is the table value, not an interpolation', () => {
  assert.equal(statsAtLevel(TABLE, 60, 3).hp, 6304.74);
  assert.equal(statsAtLevel(TABLE, 60, 4).hp, 6730.64);
  assert.equal(statsAtLevel(TABLE, 50, 3).hp, 5641.97);
});

test('a level inside a phase sits between its two anchors', () => {
  const half = statsAtLevel(TABLE, 65, 4);
  assert.equal(half.hp, (6730.64 + 7392.6) / 2);
  assert.equal(half.attack, (162.83 + 178.84) / 2);
  // The ascension bonus does not move inside a phase, so it must not drift.
  assert.equal(half.specialized, 48);
});

test('a level past the end of its phase clamps rather than extrapolating', () => {
  assert.equal(statsAtLevel(TABLE, 200, 4).hp, 7392.6);
  assert.equal(statsAtLevel(TABLE, 1, 4).hp, 6730.64);
});

test('a level implies an ascension, except at the six breakpoints', () => {
  assert.equal(ascensionForLevel(1), 0);
  assert.equal(ascensionForLevel(45), 2);
  assert.equal(ascensionForLevel(90), 6);

  // The breakpoints are the only levels where the player has a say.
  assert.equal(ascensionForLevel(80, false), 5);
  assert.equal(ascensionForLevel(80, true), 6);
  assert.equal(ascensionForLevel(45, true), 2, 'not a breakpoint, so no effect');
  assert.equal(ascensionForLevel(90, true), 6, 'nothing to ascend into');
});

test('a stored ascension says which side of the breakpoint it is', () => {
  assert.equal(isAscended(80, 5), false);
  assert.equal(isAscended(80, 6), true);
  assert.equal(isAscended(45, 2), false);
});

test('an ascension at a breakpoint counts as progress past the level', () => {
  assert.equal(progressLevel(80, 5), 80);
  assert.equal(progressLevel(80, 6), 85);
  assert.equal(progressLevel(90, 6), 90);
  assert.equal(progressLevel(20, 0), 20);

  // Every step up — a level or an ascension — reads as higher.
  let previous = 0;
  for (let ascension = 0; ascension <= 6; ascension += 1) {
    const low = ascension === 0 ? 1 : [20, 40, 50, 60, 70, 80][ascension - 1];
    const high = [20, 40, 50, 60, 70, 80, 90][ascension];
    for (let level = low; level <= high; level += 1) {
      const value = progressLevel(level, ascension);
      assert.ok(value > previous, `${level}/${ascension}`);
      previous = value;
    }
  }
});

test('a level label marks the ascended side of a breakpoint', () => {
  assert.equal(levelLabel(80, 5), '80');
  assert.equal(levelLabel(80, 6), '80+');
  assert.equal(levelLabel(90, 6), '90');
});
