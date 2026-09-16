import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { ArtifactSlot } from '@/lib/data/types';

import { buildStatsFor, rollsOf, scorePiece, type BuildStats } from './piece-score';

const CRIT = 'FIGHT_PROP_CRITICAL';
const CRIT_DMG = 'FIGHT_PROP_CRITICAL_HURT';
const ATK_PCT = 'FIGHT_PROP_ATTACK_PERCENT';
const EM = 'FIGHT_PROP_ELEMENT_MASTERY';
const DEF_FLAT = 'FIGHT_PROP_DEFENSE';
const ANEMO = 'FIGHT_PROP_WIND_ADD_HURT';
const PYRO = 'FIGHT_PROP_FIRE_ADD_HURT';

/** Venti: sands ATK%, goblet Anemo DMG, circlet CRIT. */
const build: BuildStats = buildStatsFor({
  mainStats: [[ATK_PCT], [ANEMO], [CRIT, CRIT_DMG]],
  substats: [CRIT, CRIT_DMG, ATK_PCT, EM],
});

function piece(overrides: Partial<Parameters<typeof scorePiece>[0]> = {}) {
  return scorePiece({
    slot: 'goblet' as ArtifactSlot,
    rarity: 5,
    level: 20,
    mainProp: ANEMO,
    substats: [],
    ...overrides,
  }, build);
}

test('rolls express every substat on one scale', () => {
  // One top roll of each is 1, whatever the raw number looks like.
  assert.ok(Math.abs(rollsOf(CRIT, 3.89, 5) - 1) < 0.01);
  assert.ok(Math.abs(rollsOf(EM, 23.31, 5) - 1) < 0.01);
  // Four stars roll smaller, so the same value is worth more rolls.
  assert.ok(rollsOf(CRIT, 2.72, 4) > rollsOf(CRIT, 2.72, 5));
});

test('a substat the build wants outscores one it does not', () => {
  const wanted = piece({ substats: [{ prop: CRIT, value: 3.89 }] });
  const ignored = piece({ substats: [{ prop: DEF_FLAT, value: 23.15 }] });

  assert.ok(wanted.score > ignored.score);
  assert.equal(wanted.matched.length, 1);
  assert.equal(ignored.matched.length, 0);
  assert.ok(ignored.wastedRolls > 0);
});

test('priority order is respected, not just membership', () => {
  const first = piece({ substats: [{ prop: CRIT, value: 3.89 }] });
  const fourth = piece({ substats: [{ prop: EM, value: 23.31 }] });

  // One top roll of each, but the build asked for CRIT Rate first.
  assert.ok(first.score > fourth.score);
});

test('a wrong main stat sinks a piece without disqualifying it', () => {
  const right = piece({ mainProp: ANEMO, substats: [{ prop: CRIT, value: 3.89 }] });
  const wrong = piece({ mainProp: PYRO, substats: [{ prop: CRIT, value: 3.89 }] });

  assert.equal(right.mainStatWanted, true);
  assert.equal(wrong.mainStatWanted, false);
  assert.ok(wrong.score > 0, 'still scored, still choosable');
  assert.ok(wrong.score < right.score);
});

test('a stacked off-set piece can beat a clean on-set one', () => {
  // The whole reason the inventory matters: set membership is not in the score.
  const loaded = piece({
    substats: [
      { prop: CRIT, value: 11.7 },
      { prop: CRIT_DMG, value: 15.5 },
      { prop: ATK_PCT, value: 10.5 },
    ],
  });
  const empty = piece({ substats: [{ prop: DEF_FLAT, value: 19 }] });

  assert.ok(loaded.score > empty.score * 5);
});

test('flower and plume are not judged on a main stat nobody chose', () => {
  const flower = scorePiece({
    slot: 'flower', rarity: 5, level: 20,
    mainProp: 'FIGHT_PROP_HP', substats: [{ prop: CRIT, value: 3.89 }],
  }, build);

  assert.equal(flower.mainStatWanted, null);
  assert.ok(flower.score > 0);
});

test('a slot the build says nothing about is not penalized', () => {
  const silent = buildStatsFor({ mainStats: [], substats: [CRIT] });
  const scored = scorePiece({
    slot: 'goblet', rarity: 5, level: 20,
    mainProp: PYRO, substats: [{ prop: CRIT, value: 3.89 }],
  }, silent);

  assert.equal(scored.mainStatWanted, null);
  assert.ok(Math.abs(scored.score - 1) < 0.01, 'full credit, no main-stat penalty');
});

test('a build with no priorities scores everything as leftovers', () => {
  const none = buildStatsFor(undefined);
  const scored = scorePiece({
    slot: 'goblet', rarity: 5, level: 20, mainProp: ANEMO,
    substats: [{ prop: CRIT, value: 3.89 }],
  }, none);

  assert.equal(scored.matched.length, 0);
  assert.ok(scored.score > 0 && scored.score < 0.5);
});
