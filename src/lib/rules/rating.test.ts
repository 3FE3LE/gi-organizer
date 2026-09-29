import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import { rateCharacter, type RatingConfig, type RatingInput } from './rating';

const config = JSON.parse(
  readFileSync(path.join(process.cwd(), 'src', 'data', 'curated', 'rating.json'), 'utf8'),
) as RatingConfig;

const finished: RatingInput = {
  level: 90,
  talents: { auto: 1, skill: 8, burst: 8 },
  talentTarget: { auto: 1, skill: 9, burst: 9 },
  weapon: { level: 90, maxLevel: 90 },
  pieces: Array.from({ length: 5 }, () => ({ usefulRolls: 6, mainStatWanted: true })),
  akasha: null,
};

test('a finished build with no ranking is a hundred', () => {
  assert.equal(rateCharacter(finished, config).score, 100);
});

test('talents are complete at 8, and a talent nobody levels does not count', () => {
  const rating = rateCharacter(finished, config);
  assert.equal(rating.parts.talents, 1, 'the normal attack at 1 is not a gap');
  assert.equal(rateCharacter({ ...finished, talents: { auto: 1, skill: 10, burst: 10 } }, config).parts.talents, 1);
});

test('the top 20% on Akasha is the whole of its part', () => {
  const top = rateCharacter({ ...finished, akasha: { ranking: 150, outOf: 1000 } }, config);
  assert.equal(top.parts.akasha, 1);
  assert.equal(top.score, 100);
  assert.equal(top.akashaTop, 15);

  const middle = rateCharacter({ ...finished, akasha: { ranking: 600, outOf: 1000 } }, config);
  assert.equal(middle.score, 95, 'ninety of our own and half of the ten');
});

test('without Akasha the ninety scale to a hundred, so a missing ranking costs nothing', () => {
  const half = { ...finished, level: 45, pieces: [] };
  const alone = rateCharacter(half, config);
  const withBottom = rateCharacter({ ...half, akasha: { ranking: 1000, outOf: 1000 } }, config);
  assert.ok(alone.score > withBottom.score);
});

test('a wrong main stat halves what a piece counts for', () => {
  const wrong = rateCharacter({ ...finished, pieces: finished.pieces.map((piece) => ({ ...piece, mainStatWanted: false })) }, config);
  assert.equal(wrong.parts.artifacts, 0.5);
});
