import type { Need } from './materials';

/**
 * The least resin the plan can cost.
 *
 * Only what resin is the one way to get: talent books and weapon materials
 * from their domains, ascension drops from world bosses, and weekly boss
 * drops. Mora is the scarcest line on most plans, but it also arrives by
 * playing — commissions, chests, the parametric transformer — so pricing it in
 * resin would bury the number that matters under one that is optional. It is
 * reported beside the total, never inside it. Gems, local specialties and mob
 * drops cost no resin of their own; gems come with the same boss runs, and the
 * rest is walking. Crowns cost none either: there is no farming them.
 *
 * Every figure is an expectation, not a promise. The drop rates are the
 * community's averages (see `src/data/curated/resin.json` for where each comes
 * from), and three of a tier craft into one of the tier above, so a family is
 * costed in its lowest tier: that is what lets a pile of spare Teachings pay
 * for the Guides the plan asks for. Higher tiers never craft down, which is
 * why the deficit is walked from the top.
 *
 * The same equivalence prices the drops, so a run that yields a Philosophies
 * the plan has no use for still counts nine Teachings towards it. That, and
 * pooling a weekly boss's three drops as if the Dream Solvent always converted
 * the wrong one, is what makes this a minimum rather than a forecast.
 */

/** Resin comes back one every eight minutes, capped at two hundred. */
export type ResinRates = {
  regen: { minutesPerResin: number; cap: number };
  cost: {
    domain: number;
    worldBoss: number;
    /** The price of each of the first `weeklyDiscounted` weekly bosses of a week. */
    weeklyBoss: number;
    weeklyBossFull: number;
    weeklyDiscounted: number;
    blossom: number;
  };
  /**
   * The highest domain level open at the start of each world level. A domain
   * level unlocks at an adventure rank, not a world level, so the rank a world
   * level begins at is the one assumed: the lower of the two readings.
   */
  domainLevel: { talent: number[]; weapon: number[] };
  /** Mean drops per run by domain level, lowest tier first. */
  talentDomain: Record<string, number[]>;
  weaponDomain: Record<string, number[]>;
  /** Mean ascension drops per world boss run, by world level. */
  worldBoss: number[];
  /** Mean weekly drops per run, any of the boss's three, by world level. */
  weeklyBoss: number[];
  /** Mora per Blossom of Wealth, by world level. */
  blossomMora: number[];
};

export const WORLD_LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8] as const;
export type WorldLevel = (typeof WORLD_LEVELS)[number];

/** Where a player with nothing said is taken to be: anyone planning builds. */
export const DEFAULT_WORLD_LEVEL: WorldLevel = 8;

export function isWorldLevel(value: unknown): value is WorldLevel {
  return typeof value === 'number' && (WORLD_LEVELS as readonly number[]).includes(value);
}

/** What the estimate needs to know about a material. */
export type ResinMaterial = {
  category: string;
  /** Tiers of one family share it. */
  sortRank: number;
  domain: string | null;
};

/**
 * Which boss drops a boss material. Curated in `boss-nations.json`, because
 * the catalog files world and weekly drops under the same category.
 */
export type BossDrop = { kind: 'world' | 'weekly' | 'quest'; boss?: string };

export type ResinSource = 'talent' | 'weapon' | 'world-boss' | 'weekly-boss';

export const RESIN_SOURCES: readonly ResinSource[] = [
  'talent', 'weapon', 'world-boss', 'weekly-boss',
];

export type ResinFamily = {
  /** The lowest tier the plan asks for: what names the row. */
  materialId: number;
  runs: number;
  resin: number;
};

export type ResinEstimate = {
  total: number;
  bySource: {
    source: ResinSource;
    runs: number;
    resin: number;
    /** Most resin first. */
    families: ResinFamily[];
  }[];
  /** Weeks of discounted weekly bosses, three a week. Zero without any. */
  weeklyWeeks: number;
  /** Days of regeneration the total takes, from empty. */
  resinDays: number;
  /**
   * How long it takes, all told: the resin, or the weekly bosses when they are
   * the slower of the two. Three runs a week is a calendar, not a budget.
   */
  days: number;
  mora: {
    short: number;
    /** What the missing mora would cost in Blossoms of Wealth. Not in `total`. */
    resinIfFarmed: number;
  };
};

const MORA = 202;
const TIER_RATIO = 3;

export function resinPerDay(rates: ResinRates) {
  return (24 * 60) / rates.regen.minutesPerResin;
}

/** Tiers of every family, lowest first, keyed by the rank they share. */
const familyIndexes = new WeakMap<Map<number, ResinMaterial>, Map<number, number[]>>();

function familiesOf(materials: Map<number, ResinMaterial>) {
  let index = familyIndexes.get(materials);
  if (index) return index;

  index = new Map();
  for (const [id, material] of materials) {
    const tiers = index.get(material.sortRank) ?? [];
    tiers.push(id);
    index.set(material.sortRank, tiers);
  }
  for (const tiers of index.values()) tiers.sort((a, b) => a - b);

  familyIndexes.set(materials, index);
  return index;
}

/**
 * What a family still has to be farmed for, in its lowest tier.
 *
 * Walked from the top: what the top tier lacks is three of the one below per
 * piece, added to what that tier already needs, and so on down. A surplus at a
 * high tier is left where it is, since nothing crafts down.
 */
function deficitInLowestTier(
  tiers: number[],
  needed: Map<number, number>,
  stock: Map<number, number>,
) {
  let carried = 0;
  for (let tier = tiers.length - 1; tier >= 0; tier -= 1) {
    const id = tiers[tier];
    const missing = Math.max(0, (needed.get(id) ?? 0) + carried - (stock.get(id) ?? 0));
    carried = tier === 0 ? missing : missing * TIER_RATIO;
  }
  return carried;
}

/** A run's drops, counted in the family's lowest tier. */
function yieldInLowestTier(drops: number[], tiers: number) {
  let total = 0;
  for (let tier = 0; tier < Math.min(drops.length, tiers); tier += 1) {
    total += drops[tier] * TIER_RATIO ** tier;
  }
  return total;
}

function sourceOf(
  material: ResinMaterial,
  boss: BossDrop | undefined,
): ResinSource | null {
  if (material.domain && material.category === 'characterTalentMaterial') return 'talent';
  if (material.domain && material.category === 'weaponAscensionMaterial') return 'weapon';
  if (boss?.kind === 'world') return 'world-boss';
  if (boss?.kind === 'weekly') return 'weekly-boss';
  return null;
}

export function estimateResin({
  demand,
  stock,
  materials,
  bosses,
  rates,
  worldLevel,
}: {
  /** Every material the plan costs, covered or not — see `tallyDemand`. */
  demand: Need[];
  stock: Map<number, number>;
  materials: Map<number, ResinMaterial>;
  bosses: Map<number, BossDrop>;
  rates: ResinRates;
  worldLevel: WorldLevel;
}): ResinEstimate {
  const families = familiesOf(materials);
  const needed = new Map(demand.map((need) => [need.materialId, need.needed]));

  const talentDrops = rates.talentDomain[String(rates.domainLevel.talent[worldLevel])] ?? [];
  const weaponDrops = rates.weaponDomain[String(rates.domainLevel.weapon[worldLevel])] ?? [];
  const worldMean = rates.worldBoss[worldLevel];
  const weeklyMean = rates.weeklyBoss[worldLevel];

  const bySource = new Map<ResinSource, ResinFamily[]>(
    RESIN_SOURCES.map((source) => [source, []]),
  );
  const seenFamilies = new Set<number>();
  // A weekly boss drops any of three, so its drops are pooled by boss.
  const weekly = new Map<string, { materialId: number; short: number }>();

  let moraShort = 0;

  for (const need of demand) {
    if (need.materialId === MORA) {
      moraShort = need.short;
      continue;
    }

    const material = materials.get(need.materialId);
    if (!material) continue;
    const boss = bosses.get(need.materialId);
    const source = sourceOf(material, boss);
    if (!source) continue;

    if (source === 'weekly-boss') {
      if (need.short === 0) continue;
      const key = boss?.boss ?? String(need.materialId);
      const pooled = weekly.get(key) ?? { materialId: need.materialId, short: 0 };
      pooled.materialId = Math.min(pooled.materialId, need.materialId);
      pooled.short += need.short;
      weekly.set(key, pooled);
      continue;
    }

    if (source === 'world-boss') {
      if (need.short === 0) continue;
      const runs = Math.ceil(need.short / worldMean);
      bySource.get(source)!.push({
        materialId: need.materialId, runs, resin: runs * rates.cost.worldBoss,
      });
      continue;
    }

    if (seenFamilies.has(material.sortRank)) continue;
    seenFamilies.add(material.sortRank);

    const tiers = families.get(material.sortRank) ?? [need.materialId];
    const deficit = deficitInLowestTier(tiers, needed, stock);
    if (deficit === 0) continue;

    const perRun = yieldInLowestTier(source === 'talent' ? talentDrops : weaponDrops, tiers.length);
    if (perRun === 0) continue;

    const runs = Math.ceil(deficit / perRun);
    bySource.get(source)!.push({
      materialId: tiers.find((id) => needed.has(id)) ?? tiers[0],
      runs,
      resin: runs * rates.cost.domain,
    });
  }

  for (const pooled of weekly.values()) {
    const runs = Math.ceil(pooled.short / weeklyMean);
    bySource.get('weekly-boss')!.push({
      materialId: pooled.materialId, runs, resin: runs * rates.cost.weeklyBoss,
    });
  }

  const sources = RESIN_SOURCES.map((source) => {
    const list = bySource.get(source)!.sort((a, b) => b.resin - a.resin || a.materialId - b.materialId);
    return {
      source,
      runs: list.reduce((sum, family) => sum + family.runs, 0),
      resin: list.reduce((sum, family) => sum + family.resin, 0),
      families: list,
    };
  }).filter((entry) => entry.resin > 0);

  const total = sources.reduce((sum, entry) => sum + entry.resin, 0);
  const weeklyRuns = sources.find((entry) => entry.source === 'weekly-boss')?.runs ?? 0;
  const weeklyWeeks = Math.ceil(weeklyRuns / rates.cost.weeklyDiscounted);
  const resinDays = total / resinPerDay(rates);
  // The last week's bosses fall on its first day, so N weeks span N-1 resets.
  const weeklyDays = weeklyWeeks === 0 ? 0 : (weeklyWeeks - 1) * 7 + 1;

  return {
    total,
    bySource: sources,
    weeklyWeeks,
    resinDays,
    days: Math.max(Math.ceil(resinDays), weeklyDays),
    mora: {
      short: moraShort,
      resinIfFarmed: Math.ceil(moraShort / rates.blossomMora[worldLevel]) * rates.cost.blossom,
    },
  };
}

/**
 * A span of days in the one unit that reads best: days under two weeks, weeks
 * under two months, months under a year, then years.
 */
export type Span = { unit: 'day' | 'week' | 'month' | 'year'; count: number };

export function spanOf(days: number): Span {
  if (days < 14) return { unit: 'day', count: Math.max(0, Math.ceil(days)) };
  if (days < 60) return { unit: 'week', count: Math.round(days / 7) };
  if (days < 365) return { unit: 'month', count: Math.round(days / 30.44) };
  return { unit: 'year', count: Math.round((days / 365.25) * 10) / 10 };
}
