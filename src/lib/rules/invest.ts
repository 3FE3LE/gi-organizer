import type { TeamRole } from './types';

/**
 * Where resin goes furthest: each levelling step valued as the damage it adds
 * per resin it still costs.
 *
 * There is no damage simulator here, and this is not one. It is a proxy — a
 * product of the few things a step actually changes:
 *
 *   P = scaler × (1 + crit rate · crit damage) × (1 + damage bonus) × level factor
 *
 * with a talent's own multiplier on top for a talent step. A step is worth
 * `P(after) / P(before) − 1` of the character's output, weighted by what the
 * character is for in their team: a main DPS's five percent is the team's five
 * percent, a healer's is a slightly bigger heal. The proxy is good at telling
 * steps apart — level 80→90 against a talent 8→9 against a weapon 80→90 — and
 * says nothing about rotations, reactions or buffs, which the page says too.
 *
 * Every constant is curated in `src/data/curated/invest.json`.
 */

export type InvestConfig = {
  /** The enemy the level factor is read against: Spiral Abyss's floor 12. */
  enemyLevel: number;
  roleWeights: Record<TeamRole, number>;
  /** For a character in the plan who is in no team. */
  unteamedWeight: number;
  /** Where "acceptable" ends, for the balancing strategy. */
  acceptable: { level: number; talent: number; weaponLevel: number };
  /** What the balancing strategy multiplies a step below acceptable by. */
  balanceBoost: number;
};

export type StatTotals = Record<string, number>;

/** The damage proxy's own stats, read off a character's totals. */
export type ProxyStats = {
  /** The stat the character's damage scales from, as a total. */
  scaler: number;
  critRate: number;
  critDamage: number;
  damageBonus: number;
};

export function proxyStats(
  totals: StatTotals,
  scalerProp: string,
  damageBonusProp: string | null,
): ProxyStats {
  return {
    scaler: totals[scalerProp] ?? 0,
    critRate: totals.FIGHT_PROP_CRITICAL ?? 0,
    critDamage: totals.FIGHT_PROP_CRITICAL_HURT ?? 0,
    damageBonus: damageBonusProp ? totals[damageBonusProp] ?? 0 : 0,
  };
}

/** The defence multiplier: how much of a hit an enemy of that level lets through. */
export function levelFactor(characterLevel: number, enemyLevel: number) {
  return (characterLevel + 100) / (characterLevel + 100 + enemyLevel + 100);
}

export function proxy(stats: ProxyStats, characterLevel: number, enemyLevel: number) {
  const crit = 1 + (Math.min(Math.max(stats.critRate, 0), 100) / 100) * (Math.max(stats.critDamage, 0) / 100);
  return stats.scaler * crit * (1 + stats.damageBonus / 100) * levelFactor(characterLevel, enemyLevel);
}

/** `after / before − 1`, and nothing for a proxy that has no base to grow from. */
export function relativeGain(before: number, after: number) {
  return before > 0 ? after / before - 1 : 0;
}

export type TalentKey = 'auto' | 'skill' | 'burst';

/**
 * What a talent level adds to the character's output: the growth of its own
 * multiplier, times the share of the damage that talent carries.
 *
 * The share comes from the player's own target, the only statement of what
 * the character is played for: a talent aimed at 1 is one nobody levels, and
 * weighs nothing; the others split the damage evenly.
 */
export function talentShare(target: Record<TalentKey, number>, key: TalentKey) {
  const levelled = (['auto', 'skill', 'burst'] as const).filter((talent) => target[talent] > 1);
  if (levelled.length === 0) return 1 / 3;
  return levelled.includes(key) ? 1 / levelled.length : 0;
}

/**
 * A talent's multiplier at each level, from the game's own table: the damage
 * rows, averaged. A row counts when its label names damage and its value is a
 * percentage; a talent without any — a pure buff — falls back to every
 * percentage it has, which is the buff growing. Index 0 is level 1.
 */
export function talentMultipliers(scaling: { labels: string[]; parameters: Record<string, number[]> } | undefined) {
  if (!scaling) return [];

  const percentParams = (onlyDamage: boolean) => {
    const names = new Set<string>();
    for (const template of scaling.labels) {
      const [label, value = ''] = template.split('|');
      if (onlyDamage && !/dmg|damage/i.test(label)) continue;
      for (const match of value.matchAll(/\{(param\d+):[^}]*P\}/g)) names.add(match[1]);
    }
    return [...names].filter((name) => (scaling.parameters[name]?.length ?? 0) > 0);
  };

  const names = percentParams(true).length > 0 ? percentParams(true) : percentParams(false);
  if (names.length === 0) return [];

  const levels = Math.min(...names.map((name) => scaling.parameters[name].length));
  return Array.from({ length: levels }, (_, index) =>
    names.reduce((sum, name) => sum + scaling.parameters[name][index], 0) / names.length);
}

/**
 * The stat a kit's damage scales from, read off its own damage rows: "Max HP"
 * or "DEF" beside a percentage says so, and a bare percentage is ATK. Read from
 * the kit rather than a substat priority, which lists Elemental Mastery ahead
 * of the scaler for half the reaction carries and put a zero at the base of
 * the proxy.
 */
export function kitScaler(scalings: readonly ({ labels: string[] } | undefined)[]) {
  let hp = 0;
  let def = 0;
  for (const scaling of scalings) {
    for (const template of scaling?.labels ?? []) {
      const [label, value = ''] = template.split('|');
      if (!/dmg|damage/i.test(label)) continue;
      if (/max hp/i.test(value)) hp += 1;
      else if (/\bdef\b/i.test(value)) def += 1;
    }
  }
  if (hp === 0 && def === 0) return null;
  return hp >= def ? 'FIGHT_PROP_HP' : 'FIGHT_PROP_DEFENSE';
}

/** The weight of a character in their team, the most any of their roles gives. */
export function roleWeight(roles: readonly TeamRole[][], config: InvestConfig) {
  if (roles.length === 0) return config.unteamedWeight;
  let best = 0;
  for (const slot of roles) {
    for (const role of slot) best = Math.max(best, config.roleWeights[role] ?? 0);
    // A slot with no role declared is still somebody fielded.
    if (slot.length === 0) best = Math.max(best, config.unteamedWeight);
  }
  return best;
}

export type StepKind = 'character' | 'talent' | 'weapon';

export type InvestStep = {
  characterId: number;
  kind: StepKind;
  /** For a talent step. */
  talent?: TalentKey;
  from: number;
  to: number;
  /** Phases the step crosses, for a character or weapon step. */
  fromPhase?: number;
  toPhase?: number;
  /**
   * For a talent step past what the character's phase allows: the level and
   * phase they must ascend to first, whose price is in the step's.
   */
  ascendFirst?: { level: number; ascension: number };
  /** The character's output this adds, before the team weight. */
  gain: number;
  /** Resin still to farm for it, after the bag. Mora is not in it. */
  resin: number;
  /** Mora still short after the bag, EXP feeding included. */
  mora: number;
  /** All the mora the step costs, what the bag has to hold to take it now. */
  moraCost: number;
  needsCrown: boolean;
  /** Below "acceptable" before the step, for the balancing strategy. */
  belowAcceptable: boolean;
};

export type Strategy =
  | { mode: 'balance' }
  | { mode: 'team'; teamId: string }
  | { mode: 'character'; characterId: number };

export type RankedStep = InvestStep & {
  /** The gain the team sees: the character's, times their weight. */
  weightedGain: number;
  /** What orders the list: weighted gain per resin, the strategy applied. */
  value: number;
};

export function rankSteps(
  steps: InvestStep[],
  context: {
    strategy: Strategy;
    /** Each character's weight in their team. */
    weightOf: (characterId: number) => number;
    /** Who a team fields, for the team strategy. */
    membersOf: (teamId: string) => ReadonlySet<number>;
    config: InvestConfig;
    /** The mora in the bag: a step with nothing to farm is only ready when it covers the step's mora too. */
    mora: number;
  },
): RankedStep[] {
  const { strategy, config } = context;
  const members = strategy.mode === 'team' ? context.membersOf(strategy.teamId) : null;

  return steps
    .filter((step) => step.gain > 0)
    .filter((step) => strategy.mode !== 'character' || step.characterId === strategy.characterId)
    .filter((step) => !members || members.has(step.characterId))
    .map((step) => {
      // Focused on one team or one character, every step in it is the point:
      // weights between its members still order them, but none is a side dish.
      const weight = strategy.mode === 'balance' ? context.weightOf(step.characterId) : Math.max(context.weightOf(step.characterId), 0.5);
      const boost = strategy.mode === 'balance' && step.belowAcceptable ? config.balanceBoost : 1;
      const weightedGain = step.gain * weight;
      return { ...step, weightedGain, value: (weightedGain * boost) / Math.max(step.resin, 1) };
    })
    // Paid already comes first, by what it adds; then gain per resin. "Paid"
    // means the mora too: materials in the bag with the mora short is a step
    // the player still cannot take, and it ranks with the rest.
    .sort((a, b) =>
      Number(!isReady(a, context.mora)) - Number(!isReady(b, context.mora))
      || (isReady(a, context.mora) ? b.weightedGain - a.weightedGain : b.value - a.value));
}

/** Whether a step can be taken now: nothing left to farm, and the mora it costs in the bag. */
export function isReady(step: Pick<InvestStep, 'resin' | 'moraCost'>, mora: number) {
  return step.resin === 0 && step.moraCost <= mora;
}

/** Gains compound: two +10% steps are +21%, not +20%. */
export function compound(gains: readonly number[]) {
  return gains.reduce((total, gain) => total * (1 + gain), 1) - 1;
}
