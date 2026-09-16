import { pieceQuality, type RollQuality } from './rolls';

/**
 * What a piece's rolls are worth when no character is on screen.
 *
 * `pieceQuality` answers "did the dice treat this piece well" and deliberately
 * does not look at *where* they landed, which is right for judging luck and
 * wrong for judging a piece: five maximum rolls into flat DEF is perfect luck
 * and a worthless artifact. `scorePiece` answers the other half, but it needs a
 * build, and the box has no build in front of it.
 *
 * So this is the reading in between — the conventional one, the one a player
 * uses to decide whether a piece is worth keeping before knowing who will wear
 * it. Three groups, and only three:
 *
 *   - **Crit** is the premium. Every build that deals damage wants it, and it
 *     is the only substat that is never a compromise.
 *   - **Energy recharge** is nearly as portable: most rotations need some, few
 *     need much, so it is worth having and not worth chasing.
 *   - **The scalers** — ATK%, HP%, Mastery, DEF% — are each excellent for the
 *     builds that scale off them and dead for every other one, so exactly one
 *     of them counts.
 *
 * Which one is the caller's to say, and saying nothing is the useful default
 * rather than a missing answer: with no scaler named, the piece is priced on
 * the best one it actually carries and reports which. A mastery piece is a good
 * artifact — for mastery builds — and a reading that scores it zero because
 * nobody named mastery first is a reading that hides half the box.
 *
 * Everything left is flat ATK, flat HP and flat DEF. Those never scale with
 * anything and are a loss in every build, which is why they are counted
 * separately: a wasted roll is not a low score, it is luck that went nowhere,
 * and the difference matters when deciding what to throw away.
 *
 * The main stat is deliberately absent. It is the most build-dependent fact
 * about a piece — a crit circlet is obvious until the build is a shield Yanfei
 * who would rather have ATK% — so pricing it generically would be inventing an
 * opinion. It is a thing to filter by, not to score.
 */

export const CRIT_PROPS = ['FIGHT_PROP_CRITICAL', 'FIGHT_PROP_CRITICAL_HURT'];
export const RECHARGE_PROP = 'FIGHT_PROP_CHARGE_EFFICIENCY';

export type Scaler = 'atk' | 'hp' | 'em' | 'def';

export const SCALERS: Scaler[] = ['atk', 'hp', 'em', 'def'];

export const SCALER_PROPS: Record<Scaler, string> = {
  atk: 'FIGHT_PROP_ATTACK_PERCENT',
  hp: 'FIGHT_PROP_HP_PERCENT',
  em: 'FIGHT_PROP_ELEMENT_MASTERY',
  def: 'FIGHT_PROP_DEFENSE_PERCENT',
};

/**
 * Substats that scale with nothing, worst first.
 *
 * The order is the one a player regrets them in: flat DEF does nothing for any
 * build, and flat ATK is at least a small part of a number somebody's damage
 * uses.
 */
export const ALWAYS_DEAD = [
  'FIGHT_PROP_DEFENSE',
  'FIGHT_PROP_HP',
  'FIGHT_PROP_ATTACK',
];

/**
 * The same list with DEF% in the place it is usually regretted from.
 *
 * DEF% is the one substat that is both a scaler and a liability: dead for
 * everything that is not a DEF build, and the whole point of the piece when it
 * is. So it counts when it is the scaler the piece is being priced on, and is
 * waste when it is not — which is what `deadFor` decides.
 */
export const DEAD_ORDER = [
  'FIGHT_PROP_DEFENSE',
  SCALER_PROPS.def,
  'FIGHT_PROP_HP',
  'FIGHT_PROP_ATTACK',
];

/**
 * A crit roll is the unit; the others are priced against it.
 *
 * Recharge below the scaler because a build needs a bounded amount of it and
 * then stops caring, where a scaler keeps paying for every roll it gets.
 */
export const WEIGHTS = { crit: 1, scaler: 0.7, recharge: 0.6 } as const;

export function deadFor(serves: Scaler | null): string[] {
  return serves === 'def' ? ALWAYS_DEAD : [...ALWAYS_DEAD, SCALER_PROPS.def];
}

/**
 * The scaler a piece is worth anything for: the one it carries most of.
 *
 * Only one, because a piece with a roll of ATK%, a roll of HP% and a roll of
 * Mastery serves no build well, and adding the three up would rank it above
 * one that put all three into the stat a build actually needs.
 */
export function servingScaler(
  substats: { prop: string; rolls: number }[],
): Scaler | null {
  let best: Scaler | null = null;
  let most = 0;

  for (const scaler of SCALERS) {
    const rolls = substats
      .filter((entry) => entry.prop === SCALER_PROPS[scaler])
      .reduce((total, entry) => total + entry.rolls, 0);

    if (rolls > most) {
      most = rolls;
      best = scaler;
    }
  }

  return best;
}

/**
 * What one roll of this substat is worth, given the scaler being ranked for.
 *
 * Zero covers two different things on purpose. A flat substat is dead and
 * always will be; a scaler that was not chosen is dead *for this question* and
 * excellent for the next one. `pieceWorth` keeps them apart in its counts, and
 * only the first is reported as waste.
 */
export function substatWeight(prop: string, scaler: Scaler | null): number {
  if (CRIT_PROPS.includes(prop)) return WEIGHTS.crit;
  if (prop === RECHARGE_PROP) return WEIGHTS.recharge;
  if (scaler !== null && prop === SCALER_PROPS[scaler]) return WEIGHTS.scaler;
  return 0;
}

export type PieceWorth = {
  /** Weighted top rolls. The number the list is ranked by. */
  value: number;
  /**
   * The scaler this piece is priced on — the caller's when they named one, the
   * best one present when they did not. Null when it carries none.
   */
  serves: Scaler | null;
  /** Top rolls that counted for something. */
  useful: number;
  /** Top rolls in substats that scale with nothing. */
  wasted: number;
  /** Times the piece has rolled at all, wasted or not. */
  count: number;
  /** Of those, the ones that landed on a dead substat. */
  wastedCount: number;
  /** Per substat, so a card can grey out the ones that went nowhere. */
  substats: (RollQuality & { weight: number; dead: boolean })[];
};

export function pieceWorth(
  piece: { rarity: number; substats: { prop: string; value: number }[] },
  scaler: Scaler | null,
): PieceWorth {
  const quality = pieceQuality(piece);
  const serves = scaler ?? servingScaler(quality.substats);
  const dead = new Set(deadFor(serves));

  const substats = quality.substats.map((entry) => ({
    ...entry,
    weight: substatWeight(entry.prop, serves),
    dead: dead.has(entry.prop),
  }));

  return {
    value: substats.reduce((total, entry) => total + entry.rolls * entry.weight, 0),
    serves,
    useful: substats.reduce(
      (total, entry) => total + (entry.weight > 0 ? entry.rolls : 0), 0,
    ),
    wasted: substats.reduce((total, entry) => total + (entry.dead ? entry.rolls : 0), 0),
    count: quality.count,
    wastedCount: substats.reduce((total, entry) => total + (entry.dead ? entry.count : 0), 0),
    substats,
  };
}
