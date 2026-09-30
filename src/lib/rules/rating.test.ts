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
  ascension: 6,
  talents: { auto: 1, skill: 8, burst: 8 },
  talentTarget: { auto: 1, skill: 9, burst: 9 },
  weapon: { level: 90, maxLevel: 90 },
  pieces: Array.from({ length: 5 }, () => ({ usefulRolls: 6, mainStatWanted: true })),
};

test('a finished build is a hundred', () => {
  assert.equal(rateCharacter(finished, config).score, 100);
});

test('talents are complete at 8, and a talent nobody levels does not count', () => {
  const rating = rateCharacter(finished, config);
  assert.equal(rating.parts.talents, 1, 'the normal attack at 1 is not a gap');
  assert.equal(rateCharacter({ ...finished, talents: { auto: 1, skill: 10, burst: 10 } }, config).parts.talents, 1);
});

test('the weights add up to a hundred, so a part shows the points it gives', () => {
  const w = config.weights;
  assert.equal(w.level + w.talents + w.weapon + w.artifacts, 100);
});

test('80+ counts the ascension: above 80, below 90', () => {
  const before = rateCharacter({ ...finished, level: 80, ascension: 5 }, config);
  const after = rateCharacter({ ...finished, level: 80, ascension: 6 }, config);
  assert.equal(Math.round(before.parts.level * config.weights.level), 18);
  assert.equal(Math.round(after.parts.level * config.weights.level), 19);
  assert.ok(after.parts.level < 1);
});

test('a wrong main stat halves what a piece counts for', () => {
  const wrong = rateCharacter({ ...finished, pieces: finished.pieces.map((piece) => ({ ...piece, mainStatWanted: false })) }, config);
  assert.equal(wrong.parts.artifacts, 0.5);
});
