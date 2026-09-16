import type { ArtifactSlot } from '@/lib/data/types';

/**
 * Static stat totals for a build.
 *
 * Arithmetic only: base, weapon, artifact main stats, artifact substats and
 * flat set bonuses. Conditional effects — most 4-piece bonuses — are not summed
 * here, because summing them would require a damage model and a notion of
 * uptime, and the point of this layer is that every number in it can be checked
 * by hand.
 */

/**
 * Artifact main stat values, as `[at +0, at max level]`.
 *
 * The anchors are exact; the levels between them are linearly interpolated.
 * Measured against published +4 values that is accurate to **0.6% at worst**
 * (CRIT DMG reads 19.88 where the game shows 20.0), and always low rather than
 * high. Good enough to decide whether a build clears a threshold; not a
 * substitute for the game's own numbers if one ever matters to the decimal.
 *
 * Most planning happens at max level anyway, where the value is exact.
 */
const MAIN_STAT_ANCHORS: Record<string, { 5: [number, number]; 4: [number, number] }> = {
  FIGHT_PROP_HP: { 5: [717, 4780], 4: [645, 3967] },
  FIGHT_PROP_ATTACK: { 5: [47, 311], 4: [42, 258] },
  FIGHT_PROP_HP_PERCENT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_ATTACK_PERCENT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_DEFENSE_PERCENT: { 5: [8.7, 58.3], 4: [7.9, 48.4] },
  FIGHT_PROP_ELEMENT_MASTERY: { 5: [28, 187], 4: [25, 155] },
  FIGHT_PROP_CHARGE_EFFICIENCY: { 5: [7.8, 51.8], 4: [7.0, 43.0] },
  FIGHT_PROP_CRITICAL: { 5: [4.7, 31.1], 4: [4.2, 25.8] },
  FIGHT_PROP_CRITICAL_HURT: { 5: [9.3, 62.2], 4: [8.4, 51.6] },
  FIGHT_PROP_HEAL_ADD: { 5: [5.4, 35.9], 4: [4.8, 29.8] },
  FIGHT_PROP_PHYSICAL_ADD_HURT: { 5: [8.7, 58.3], 4: [7.9, 48.4] },
  FIGHT_PROP_FIRE_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_WATER_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_ICE_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_ELEC_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_WIND_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_ROCK_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
  FIGHT_PROP_GRASS_ADD_HURT: { 5: [7.0, 46.6], 4: [6.3, 38.7] },
};

/** Highest level per rarity: a 4-star artifact stops at +16. */
const MAX_LEVEL: Record<number, number> = { 5: 20, 4: 16, 3: 12, 2: 8, 1: 4 };

export function mainStatValue(prop: string, rarity: number, level: number) {
  const anchors = MAIN_STAT_ANCHORS[prop];
  if (!anchors) return 0;

  const [base, max] = rarity >= 5 ? anchors[5] : anchors[4];
  const cap = MAX_LEVEL[rarity] ?? 20;
  const clamped = Math.min(Math.max(level, 0), cap);

  return base + ((max - base) / cap) * clamped;
}

/* ------------------------------------------------------------ totals --- */

export type StatTotals = Record<string, number>;

export type StatInput = {
  /** From the catalog's stat table at the planned level. */
  character: { hp: number; attack: number; defense: number };
  /** The character's ascension stat and its value, as a ratio. */
  ascension: { prop: string; value: number } | null;
  weapon: { baseAttack: number; prop: string | null; value: number } | null;
  pieces: {
    slot: ArtifactSlot;
    rarity: number;
    level: number;
    mainProp: string;
    substats: { prop: string; value: number }[];
  }[];
  /** Flat set bonuses that apply, as percentages or flat values. */
  setBonuses: { prop: string; value: number }[];
};

const PERCENT_OF_BASE: Record<string, 'hp' | 'attack' | 'defense'> = {
  FIGHT_PROP_HP_PERCENT: 'hp',
  FIGHT_PROP_ATTACK_PERCENT: 'attack',
  FIGHT_PROP_DEFENSE_PERCENT: 'defense',
};

const FLAT_OF_BASE: Record<string, 'hp' | 'attack' | 'defense'> = {
  FIGHT_PROP_HP: 'hp',
  FIGHT_PROP_ATTACK: 'attack',
  FIGHT_PROP_DEFENSE: 'defense',
};

/** Where each derived total starts before anything is added. */
const INNATE: StatTotals = {
  FIGHT_PROP_CRITICAL: 5,
  FIGHT_PROP_CRITICAL_HURT: 50,
  FIGHT_PROP_CHARGE_EFFICIENCY: 100,
};

export type ComputedStats = {
  /** Final values, percentages as percentages. */
  totals: StatTotals;
  /** What each source contributed, for explaining a number. */
  base: { hp: number; attack: number; defense: number };
};

export function computeStats(input: StatInput): ComputedStats {
  // Percentages and flats are gathered first, then applied, because ATK% scales
  // the character *and* weapon base together — applying them piecemeal is the
  // classic way to be quietly wrong.
  const percent = { hp: 0, attack: 0, defense: 0 };
  const flat = { hp: 0, attack: 0, defense: 0 };
  const totals: StatTotals = { ...INNATE };

  const add = (prop: string, value: number) => {
    const scales = PERCENT_OF_BASE[prop];
    if (scales) { percent[scales] += value; return; }

    const flatOf = FLAT_OF_BASE[prop];
    if (flatOf) { flat[flatOf] += value; return; }

    totals[prop] = (totals[prop] ?? 0) + value;
  };

  if (input.ascension) {
    // The catalog reports the ascension bonus as a ratio; everything here is a
    // percentage, except Elemental Mastery which is a flat number in both.
    const isMastery = input.ascension.prop === 'FIGHT_PROP_ELEMENT_MASTERY';
    add(input.ascension.prop, isMastery ? input.ascension.value : input.ascension.value * 100);
  }

  if (input.weapon?.prop) {
    const isMastery = input.weapon.prop === 'FIGHT_PROP_ELEMENT_MASTERY';
    add(input.weapon.prop, isMastery ? input.weapon.value : input.weapon.value * 100);
  }

  for (const piece of input.pieces) {
    add(piece.mainProp, mainStatValue(piece.mainProp, piece.rarity, piece.level));
    for (const substat of piece.substats) add(substat.prop, substat.value);
  }

  for (const bonus of input.setBonuses) add(bonus.prop, bonus.value);

  // A weapon's base ATK joins the character's before any percentage applies.
  const baseAttack = input.character.attack + (input.weapon?.baseAttack ?? 0);

  totals.FIGHT_PROP_HP = input.character.hp * (1 + percent.hp / 100) + flat.hp;
  totals.FIGHT_PROP_ATTACK = baseAttack * (1 + percent.attack / 100) + flat.attack;
  totals.FIGHT_PROP_DEFENSE = input.character.defense * (1 + percent.defense / 100) + flat.defense;

  return {
    totals,
    base: { hp: input.character.hp, attack: baseAttack, defense: input.character.defense },
  };
}

/* ------------------------------------------------------------- goals --- */

export type GoalVerdict = {
  prop: string;
  min: number;
  actual: number;
  /** How far off, as a share of the target. Negative means short. */
  margin: number;
  status: 'met' | 'close' | 'short';
};

/** Within this share of the target counts as close rather than short. */
const CLOSE_ENOUGH = 0.05;

export function evaluateGoals(
  totals: StatTotals,
  goals: { prop: string; min: number }[],
): GoalVerdict[] {
  return goals.map((goal) => {
    const actual = totals[goal.prop] ?? 0;
    const margin = goal.min === 0 ? 0 : (actual - goal.min) / goal.min;

    return {
      prop: goal.prop,
      min: goal.min,
      actual,
      margin,
      status: actual >= goal.min ? 'met' : margin >= -CLOSE_ENOUGH ? 'close' : 'short',
    };
  });
}
