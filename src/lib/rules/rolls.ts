/**
 * What a substat roll is worth, and whether the ones a piece got were good.
 *
 * Every artifact substat rolls one of four values. The table people quote for
 * five stars is this:
 *
 *   | substat        | mínimo | bajo  | alto  | máximo |
 *   |----------------|--------|-------|-------|--------|
 *   | PV (plano)     |    209 |   239 |   269 |    299 |
 *   | PV %           |   4.1% |  4.7% |  5.2% |   5.8% |
 *   | ATQ (plano)    |     14 |    16 |    18 |     19 |
 *   | ATQ %          |   4.1% |  4.7% |  5.2% |   5.8% |
 *   | DEF (plano)    |     16 |    19 |    21 |     23 |
 *   | DEF %          |   5.1% |  5.8% |  6.6% |   7.3% |
 *   | Maestría       |     16 |    19 |    21 |     23 |
 *   | Recarga        |   4.5% |  5.2% |  5.8% |   6.5% |
 *   | Prob. CRIT     |   2.7% |  3.1% |  3.5% |   3.9% |
 *   | Daño CRIT      |   5.4% |  6.2% |  7.0% |   7.8% |
 *
 * Two cells differ from the version that usually circulates by hand: the
 * "alto" tier of PV % and ATQ % is 5.2 (5.83 × 0.9 = 5.247, not 5.3), and of
 * DEF % it is 6.6 (7.29 × 0.9 = 6.561, not 6.5). Both are rounding slips, and
 * deriving the table rather than typing it is what catches them.
 *
 * Forty numbers, and one rule underneath all of them: the four tiers are
 * **70%, 80%, 90% and 100% of the maximum roll**, for every substat and every
 * rarity. So the table is not stored — the maxima are, and the tiers are
 * derived. `rolls.test.ts` checks the derivation against the numbers above,
 * which is the only way a table like this stays honest.
 *
 * This matters because it is the difference between a piece that *could* be
 * good and one that *is*. A level-zero piece with crit rate at 2.7 has already
 * spent its roll badly; the same piece at 3.9 has not. Judging both as "three
 * promising substats" is what made every unlevelled artifact look like a
 * prospect.
 */

/** Highest single roll at 5 and 4 stars, per substat. */
const MAX_ROLL: Record<string, [five: number, four: number]> = {
  FIGHT_PROP_HP: [298.75, 203.15],
  FIGHT_PROP_ATTACK: [19.45, 13.23],
  FIGHT_PROP_DEFENSE: [23.15, 15.75],
  FIGHT_PROP_HP_PERCENT: [5.83, 4.08],
  FIGHT_PROP_ATTACK_PERCENT: [5.83, 4.08],
  FIGHT_PROP_DEFENSE_PERCENT: [7.29, 5.1],
  FIGHT_PROP_ELEMENT_MASTERY: [23.31, 16.32],
  FIGHT_PROP_CHARGE_EFFICIENCY: [6.48, 4.53],
  FIGHT_PROP_CRITICAL: [3.89, 2.72],
  FIGHT_PROP_CRITICAL_HURT: [7.77, 5.44],
};

/** The ten stats an artifact can roll. */
export const ROLLABLE = Object.keys(MAX_ROLL);

/** Every tier as a fraction of the maximum roll, worst first. */
export const TIER_FRACTIONS = [0.7, 0.8, 0.9, 1] as const;

export type Tier = 'mínimo' | 'bajo' | 'alto' | 'máximo';

export const TIERS: Tier[] = ['mínimo', 'bajo', 'alto', 'máximo'];

/**
 * What one roll of this substat is worth at each tier, worst first.
 *
 * Exact, not rounded: 5.83 × 0.9 is 5.247, which the game shows as 5.2. Round
 * it here and that cell reads 5.3 instead — which is how the extra decimal
 * ends up in hand-typed copies of this table.
 */
export function rollTiers(prop: string, rarity: number): number[] {
  const max = maxRoll(prop, rarity);
  return max === 0 ? [] : TIER_FRACTIONS.map((fraction) => max * fraction);
}

export function maxRoll(prop: string, rarity: number) {
  const max = MAX_ROLL[prop];
  if (!max) return 0;
  return rarity >= 5 ? max[0] : max[1];
}

/**
 * How many top rolls a substat is worth.
 *
 * Comparing raw values is meaningless across stats — 19 Elemental Mastery and
 * 19 flat ATK are not the same amount of anything — so everything the planner
 * weighs is expressed in top rolls.
 */
export function rollsOf(prop: string, value: number, rarity: number) {
  const max = maxRoll(prop, rarity);
  return max === 0 ? 0 : value / max;
}

/**
 * The average of the four tiers, as a fraction of the maximum.
 *
 * `(0.7 + 0.8 + 0.9 + 1) / 4`. What an unknown future roll is worth, as
 * opposed to what the luckiest possible one would be.
 */
export const MEAN_TIER = TIER_FRACTIONS.reduce((total, tier) => total + tier, 0)
  / TIER_FRACTIONS.length;

export type RollQuality = {
  prop: string;
  value: number;
  /** Value expressed in top rolls: 2.8 means "2.8 maximum rolls' worth". */
  rolls: number;
  /** How many times this substat actually rolled. At least one. */
  count: number;
  /**
   * How well those rolls landed, as a fraction of the best they could have.
   * Bounded by the table: never below 0.7, never above 1.
   */
  efficiency: number;
  /** The tier the average roll landed on. */
  tier: Tier;
  /** Every roll landed maximum. */
  perfect: boolean;
};

/**
 * What a substat's value says about how it rolled.
 *
 * The count is recoverable because the tiers are bounded: `n` rolls can only
 * produce between `0.7n` and `n` top rolls' worth, and those ranges do not
 * overlap, so the value alone fixes `n`. From there the average tier follows,
 * and with it the only honest answer to "did this piece roll well".
 */
export function qualityOf(
  substat: { prop: string; value: number },
  rarity: number,
): RollQuality | null {
  const max = maxRoll(substat.prop, rarity);
  if (max === 0) return null;

  const rolls = substat.value / max;
  // Tolerance for the game's own rounding, which publishes one decimal.
  const count = Math.max(1, Math.ceil(rolls - 0.01));
  const efficiency = Math.min(1, rolls / count);

  return {
    prop: substat.prop,
    value: substat.value,
    rolls,
    count,
    efficiency,
    tier: tierOf(efficiency),
    // A hair under one, because the displayed value is rounded before it
    // reaches us and a perfect roll can arrive as 0.9994 of itself.
    perfect: efficiency >= 0.995,
  };
}

/** Which tier an efficiency sits closest to. */
export function tierOf(efficiency: number): Tier {
  let closest = 0;
  for (let index = 1; index < TIER_FRACTIONS.length; index += 1) {
    if (Math.abs(TIER_FRACTIONS[index] - efficiency)
      < Math.abs(TIER_FRACTIONS[closest] - efficiency)) closest = index;
  }
  return TIERS[closest];
}

/**
 * How well a whole piece rolled, ignoring what any build wants.
 *
 * Deliberately build-agnostic: this is "did the dice treat this piece well",
 * which is a fact about the piece. Whether those stats are the ones you needed
 * is `scorePiece`'s question, and mixing the two produced pieces that looked
 * promising because they were unlevelled rather than because they were good.
 */
export function pieceQuality(
  piece: { rarity: number; substats: { prop: string; value: number }[] },
) {
  const substats = piece.substats
    .map((substat) => qualityOf(substat, piece.rarity))
    .filter((quality): quality is RollQuality => quality !== null);

  const rolls = substats.reduce((total, quality) => total + quality.rolls, 0);
  const count = substats.reduce((total, quality) => total + quality.count, 0);

  return {
    substats,
    /** Total top rolls the piece carries. */
    rolls,
    /** How many times it has rolled at all. */
    count,
    /** The piece's average tier, or null when it has no readable substat. */
    efficiency: count === 0 ? null : Math.min(1, rolls / count),
    /** At least one substat where every roll landed maximum. */
    hasPerfect: substats.some((quality) => quality.perfect),
  };
}

/* ----------------------------------------------------------- crit value --- */

/**
 * Crit value, the number every guide quotes: `2 × Prob. CRIT + Daño CRIT`.
 *
 * The weights are not arbitrary. Crit damage rolls at exactly twice the rate
 * crit rate does — 7.77 against 3.89 at five stars — so counting crit rate
 * double makes one roll of either worth the same, and the sum reads as "how
 * many crit rolls is this piece carrying". That is the whole appeal: two
 * numbers that cannot be added become one that can.
 *
 * Substats only, which is the convention and also the only useful reading: a
 * crit circlet's main stat is a flat 62.2 CV whatever else it does, and adding
 * it makes every crit circlet look identical while burying the rolls that
 * actually differ.
 *
 * It is a crit-build metric and nothing else. A Sucrose mastery piece and a
 * Furina HP piece score zero, and both can be excellent. `pieceQuality` is the
 * build-agnostic reading; this one answers a narrower question, loudly.
 */
export const CRIT_WEIGHTS: Record<string, number> = {
  FIGHT_PROP_CRITICAL: 2,
  FIGHT_PROP_CRITICAL_HURT: 1,
};

export function critValue(substats: { prop: string; value: number }[]) {
  return substats.reduce(
    (total, substat) => total + (CRIT_WEIGHTS[substat.prop] ?? 0) * substat.value,
    0,
  );
}

/**
 * What one maximum crit roll is worth in crit value.
 *
 * Derived rather than quoted: a top crit damage roll is 7.77, a top crit rate
 * roll is 3.89 and counts double, so either is ~7.78. Averaging the two is the
 * honest unit, and the 0.1% they differ by is the game's own rounding.
 */
export const CRIT_VALUE_PER_ROLL = (
  maxRoll('FIGHT_PROP_CRITICAL_HURT', 5)
  + maxRoll('FIGHT_PROP_CRITICAL', 5) * CRIT_WEIGHTS.FIGHT_PROP_CRITICAL
) / 2;

/**
 * The ceiling for a five-star piece.
 *
 * Seven crit rolls: both crit substats present from the start, and all five
 * upgrades landing on one of them at the top tier. Around 54, which is why a
 * piece near 50 is a once-in-an-account event rather than a farming target.
 */
export const MAX_CRIT_VALUE = 7 * CRIT_VALUE_PER_ROLL;

/**
 * How many crit rolls a piece can ever carry, which its main stat decides.
 *
 * A substat is never the piece's own main stat, so a crit rate circlet cannot
 * roll crit rate and a crit damage one cannot roll crit damage: one crit line
 * and its five upgrades, six rolls, against the seven of every other piece.
 * The crit value is the same sum either way; only what it is out of changes.
 */
export function critCeilingRolls(mainProp?: string | null) {
  return mainProp && mainProp in CRIT_WEIGHTS ? 6 : 7;
}

/** Crit value expressed in the unit it is made of. */
export function critRolls(value: number) {
  return value / CRIT_VALUE_PER_ROLL;
}

export type CritRating = 'ninguno' | 'bajo' | 'normal' | 'bueno' | 'muy bueno' | 'excelente';

/**
 * Where a piece sits, in crit rolls rather than in round numbers.
 *
 * The bands are the roll boundaries, so they mean something: "bueno" starts at
 * two and a half crit rolls, which lands on the 20-ish figure guides quote as
 * the point a piece is worth keeping, and "excelente" starts at five, near the
 * 40 they call rare.
 *
 * The bands are for a piece that can carry seven crit rolls. A crit circlet
 * can carry six (see `critCeilingRolls`), so its rolls are read against that:
 * "excelente" starts near 4.3 rolls, the same share of what it could reach.
 * Without its main stat the reading is the seven-roll one.
 */
export function critRating(value: number, mainProp?: string | null): CritRating {
  const rolls = critRolls(value) * (7 / critCeilingRolls(mainProp));
  if (rolls < 0.5) return 'ninguno';
  if (rolls < 1.5) return 'bajo';
  if (rolls < 2.5) return 'normal';
  if (rolls < 4) return 'bueno';
  if (rolls < 5) return 'muy bueno';
  return 'excelente';
}
