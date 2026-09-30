/**
 * How well built a character is, 0 to 100.
 *
 * All of it is the game's own: level, talents, weapon and artifacts, each
 * measured against a finished build rather than a perfect one — talents are
 * complete at 8, the artifacts at a set of useful rolls a good build reaches.
 * The level counts the ascension too, so 80+ scores above 80 (see
 * `progressLevel`). Weights live in `src/data/curated/rating.json` and add up
 * to a hundred, so each part's points are the points it shows.
 *
 * Nothing here is read from a third party. An Akasha leaderboard part used to
 * sit on top, and it was absent more often than not — Cloudflare refused the
 * server, or the UID was never loaded there — while what it measured was a
 * ranking among other players, not a fact about this build.
 */

import { progressLevel } from '@/lib/data/stats';

export type RatingConfig = {
  weights: { level: number; talents: number; weapon: number; artifacts: number };
  talentComplete: number;
  levelComplete: number;
  artifactRollsComplete: number;
  /** What a piece counts for when its main stat is not one the build asks for. */
  wrongMainStatFactor: number;
};

export type RatingInput = {
  level: number;
  ascension: number;
  talents: { auto: number; skill: number; burst: number };
  /** Which talents the player levels — the target; a talent aimed at 1 is not counted. */
  talentTarget: { auto: number; skill: number; burst: number };
  weapon: { level: number; maxLevel: number } | null;
  /** Useful rolls per equipped piece, and whether its main stat is wanted. */
  pieces: { usefulRolls: number; mainStatWanted: boolean | null }[];
};

export type Rating = {
  /** 0–100, rounded. */
  score: number;
  /** Each part as a share of its own weight, 0–1. */
  parts: { level: number; talents: number; weapon: number; artifacts: number };
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function rateCharacter(input: RatingInput, config: RatingConfig): Rating {
  const level = clamp01(progressLevel(input.level, input.ascension) / config.levelComplete);

  const levelled = (['auto', 'skill', 'burst'] as const).filter((key) => input.talentTarget[key] > 1);
  const counted = levelled.length > 0 ? levelled : (['skill', 'burst'] as const);
  const talents = counted.reduce((sum, key) => sum + clamp01(input.talents[key] / config.talentComplete), 0) / counted.length;

  const weapon = input.weapon ? clamp01(input.weapon.level / input.weapon.maxLevel) : 0;

  const rolls = input.pieces.reduce(
    (sum, piece) => sum + piece.usefulRolls * (piece.mainStatWanted === false ? config.wrongMainStatFactor : 1), 0);
  const artifacts = clamp01(rolls / config.artifactRollsComplete);

  const w = config.weights;
  const own = level * w.level + talents * w.talents + weapon * w.weapon + artifacts * w.artifacts;
  const max = w.level + w.talents + w.weapon + w.artifacts;

  return {
    score: Math.round((own / max) * 100),
    parts: { level, talents, weapon, artifacts },
  };
}
