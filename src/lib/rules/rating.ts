/**
 * How well built a character is, 0 to 100.
 *
 * Ninety points are the game's own: level, talents, weapon and artifacts, each
 * measured against a finished build rather than a perfect one — talents are
 * complete at 8, the artifacts at a set of useful rolls a good build reaches.
 * The last ten are where the character stands on Akasha's global leaderboard,
 * where the top 20% already counts as all of it: the very top of that board
 * is bought, not built, and a rating that chased it would call every sensible
 * build unfinished.
 *
 * Akasha is optional. Without it — not loaded there, blocked, or no board for
 * the character — the ninety are scaled to a hundred, so a missing ranking
 * never costs anything. Weights live in `src/data/curated/rating.json`.
 */

export type RatingConfig = {
  weights: { level: number; talents: number; weapon: number; artifacts: number; akasha: number };
  talentComplete: number;
  levelComplete: number;
  artifactRollsComplete: number;
  /** What a piece counts for when its main stat is not one the build asks for. */
  wrongMainStatFactor: number;
  /** The share of the leaderboard that counts as the whole Akasha part. */
  akashaTopShare: number;
};

export type RatingInput = {
  level: number;
  talents: { auto: number; skill: number; burst: number };
  /** Which talents the player levels — the target; a talent aimed at 1 is not counted. */
  talentTarget: { auto: number; skill: number; burst: number };
  weapon: { level: number; maxLevel: number } | null;
  /** Useful rolls per equipped piece, and whether its main stat is wanted. */
  pieces: { usefulRolls: number; mainStatWanted: boolean | null }[];
  /** The character's best Akasha standing, `ranking` of `outOf`. */
  akasha: { ranking: number; outOf: number } | null;
};

export type Rating = {
  /** 0–100, rounded. */
  score: number;
  /** Each part as a share of its own weight, 0–1. */
  parts: { level: number; talents: number; weapon: number; artifacts: number; akasha: number | null };
  /** "Top X%" on Akasha, when known. */
  akashaTop: number | null;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function rateCharacter(input: RatingInput, config: RatingConfig): Rating {
  const level = clamp01(input.level / config.levelComplete);

  const levelled = (['auto', 'skill', 'burst'] as const).filter((key) => input.talentTarget[key] > 1);
  const counted = levelled.length > 0 ? levelled : (['skill', 'burst'] as const);
  const talents = counted.reduce((sum, key) => sum + clamp01(input.talents[key] / config.talentComplete), 0) / counted.length;

  const weapon = input.weapon ? clamp01(input.weapon.level / input.weapon.maxLevel) : 0;

  const rolls = input.pieces.reduce(
    (sum, piece) => sum + piece.usefulRolls * (piece.mainStatWanted === false ? config.wrongMainStatFactor : 1), 0);
  const artifacts = clamp01(rolls / config.artifactRollsComplete);

  const share = input.akasha && input.akasha.outOf > 0 ? input.akasha.ranking / input.akasha.outOf : null;
  const akasha = share === null ? null : clamp01((1 - share) / (1 - config.akashaTopShare));

  const w = config.weights;
  const own = level * w.level + talents * w.talents + weapon * w.weapon + artifacts * w.artifacts;
  const ownMax = w.level + w.talents + w.weapon + w.artifacts;
  const total = akasha === null ? (own / ownMax) * 100 : own + akasha * w.akasha;

  return {
    score: Math.round(total),
    parts: { level, talents, weapon, artifacts, akasha },
    // Rounded up, as Akasha itself shows it.
    akashaTop: share === null ? null : Math.min(100, Math.ceil(share * 100)),
  };
}
