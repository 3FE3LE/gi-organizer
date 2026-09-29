import type { CostsByPhase, Progress } from './materials';

/**
 * What the bag already pays for.
 *
 * The plan answers "what is missing"; this answers the other half — what can
 * be done tonight without farming anything. A character is walked up the way
 * the game makes you: EXP books to the level cap of their phase, the
 * ascension materials to break it, and on again, until the bag runs out of one
 * or the other. Talents climb their cheapest next level first, so the count of
 * levels is the most the bag can buy. A weapon climbs like a character, on
 * enhancement ores.
 *
 * Each answer is worked out on the whole bag, on its own. Two of them share
 * the same books, the same mora, often the same boss drop, so doing one
 * leaves less for the next — the page says so rather than pretending the
 * rows add up.
 */

export type LevellingData = {
  /** The highest level each ascension phase allows, phase 0 first. */
  levelCaps: number[];
  /** Total EXP to reach each level, level 1 first. */
  characterExp: number[];
  /** The same per weapon rarity, as strings: `"5"`. */
  weaponExp: Record<string, number[]>;
  characterExpItems: { id: number; exp: number }[];
  weaponExpItems: { id: number; exp: number }[];
  moraPerExp: { character: number; weapon: number };
  /** Ascension phases that grant an Acquaint Fate the first time. */
  fatePhases: number[];
};

const MORA = 202;

type Stock = Map<number, number>;

/** Takes every item, or none if any of them is short. */
function spend(stock: Stock, items: readonly { id: number; count: number }[] | undefined) {
  if (!items) return false;
  for (const item of items) if ((stock.get(item.id) ?? 0) < item.count) return false;
  for (const item of items) stock.set(item.id, (stock.get(item.id) ?? 0) - item.count);
  return true;
}

/**
 * Levels from `level` towards `goal` on EXP items and mora, as far as they go.
 *
 * The game charges mora per point of EXP fed, and a book fed whole can
 * overshoot; the largest books go in first and the last gap is closed with the
 * smallest that covers it, which is roughly how a player feeds them.
 */
function levelUp(
  level: number,
  goal: number,
  table: number[],
  items: { id: number; exp: number }[],
  moraPerExp: number,
  stock: Stock,
) {
  const pool = items.reduce((sum, item) => sum + (stock.get(item.id) ?? 0) * item.exp, 0);
  const affordable = Math.min(pool, Math.floor((stock.get(MORA) ?? 0) / moraPerExp));

  let reached = level;
  while (reached < goal && table[reached] - table[level - 1] <= affordable) reached += 1;
  if (reached === level) return level;

  let remaining = table[reached - 1] - table[level - 1];
  let fed = 0;
  for (const item of items) {
    const take = Math.min(stock.get(item.id) ?? 0, Math.floor(remaining / item.exp));
    stock.set(item.id, (stock.get(item.id) ?? 0) - take);
    remaining -= take * item.exp;
    fed += take * item.exp;
  }
  if (remaining > 0) {
    // The last gap, with the smallest item there is.
    const last = [...items].reverse().find((item) => (stock.get(item.id) ?? 0) > 0);
    if (last) {
      stock.set(last.id, (stock.get(last.id) ?? 0) - 1);
      fed += last.exp;
    }
  }
  stock.set(MORA, (stock.get(MORA) ?? 0) - Math.ceil(fed * moraPerExp));
  return reached;
}

export type Climb = {
  from: { level: number; ascension: number };
  to: { level: number; ascension: number };
};

/** Levels and phases, alternately, until the bag cannot pay for the next one. */
function climb(
  start: { level: number; ascension: number },
  target: { level: number; ascension: number },
  costs: CostsByPhase,
  table: number[],
  items: { id: number; exp: number }[],
  moraPerExp: number,
  caps: number[],
  stock: Stock,
): Climb {
  let { level, ascension } = start;
  const maxLevel = Math.min(target.level, table.length);

  for (;;) {
    const cap = caps[ascension] ?? maxLevel;
    const goal = Math.min(cap, maxLevel);

    if (level < goal) {
      level = levelUp(level, goal, table, items, moraPerExp, stock);
      if (level < goal) break;
    }
    if (level < cap || ascension >= target.ascension) break;
    if (!spend(stock, costs[`ascend${ascension + 1}`])) break;
    ascension += 1;
  }

  return { from: start, to: { level, ascension } };
}

export type CharacterReach = Climb & {
  characterId: number;
  /** Acquaint Fates the new phases grant. */
  fates: number;
};

export function characterReach(input: {
  characterId: number;
  current: Pick<Progress, 'level' | 'ascension'>;
  target: Pick<Progress, 'level' | 'ascension'>;
  ascensionCosts: CostsByPhase;
  stock: Stock;
  data: LevellingData;
}): CharacterReach {
  const { data } = input;
  const result = climb(
    input.current,
    input.target,
    input.ascensionCosts,
    data.characterExp,
    data.characterExpItems,
    data.moraPerExp.character,
    data.levelCaps,
    new Map(input.stock),
  );

  const fates = data.fatePhases
    .filter((phase) => phase > result.from.ascension && phase <= result.to.ascension).length;

  return { ...result, characterId: input.characterId, fates };
}

export type TalentReach = {
  characterId: number;
  from: Progress['talents'];
  to: Progress['talents'];
  levels: number;
};

/** The cheapest next level first — the lowest talent — so the count is the most the bag buys. */
export function talentReach(input: {
  characterId: number;
  current: Progress['talents'];
  target: Progress['talents'];
  talentCosts: CostsByPhase;
  stock: Stock;
}): TalentReach {
  const stock = new Map(input.stock);
  const to = { ...input.current };
  const open = new Set((['auto', 'skill', 'burst'] as const).filter((key) => to[key] < input.target[key]));

  while (open.size > 0) {
    const next = [...open].sort((a, b) => to[a] - to[b])[0];
    if (spend(stock, input.talentCosts[`lvl${to[next] + 1}`])) {
      to[next] += 1;
      if (to[next] >= input.target[next]) open.delete(next);
    } else {
      open.delete(next);
    }
  }

  const levels = (to.auto - input.current.auto) + (to.skill - input.current.skill) + (to.burst - input.current.burst);
  return { characterId: input.characterId, from: input.current, to, levels };
}

export type WeaponReach = Climb & {
  instanceId: string;
  weaponId: number;
  holderId: number | null;
  /** Whether it ends at the rarity's last level. */
  maxed: boolean;
};

export function weaponReach(input: {
  instanceId: string;
  weaponId: number;
  holderId: number | null;
  rarity: number;
  current: { level: number; ascension: number };
  costs: CostsByPhase;
  stock: Stock;
  data: LevellingData;
}): WeaponReach {
  const { data } = input;
  const table = data.weaponExp[String(input.rarity)] ?? data.weaponExp['5'];
  const top = table.length;
  // One- and two-star weapons stop at phase four, level seventy.
  const lastPhase = data.levelCaps.indexOf(top);

  const result = climb(
    input.current,
    { level: top, ascension: lastPhase },
    input.costs,
    table,
    data.weaponExpItems,
    data.moraPerExp.weapon,
    data.levelCaps,
    new Map(input.stock),
  );

  return {
    ...result,
    instanceId: input.instanceId,
    weaponId: input.weaponId,
    holderId: input.holderId,
    maxed: result.to.level >= top,
  };
}

/** Whether a climb moved at all. */
export function moved(reach: Climb) {
  return reach.to.level > reach.from.level || reach.to.ascension > reach.from.ascension;
}
