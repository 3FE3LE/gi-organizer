import 'server-only';

import type { Catalog } from '@/lib/data/catalog';
import type { CharacterView } from '@/lib/data/types';
import { getProfileId, readMaterialStock } from '@/lib/player/db';
import {
  ASSUMED_TARGET,
  computeDemand,
  type CostsByPhase,
  type DemandSource,
  type Progress,
  type Reason,
} from '@/lib/rules/materials';

import type { BuildContext } from './context';

/** Mora is a cost line like any other in the data, and a total on screen. */
const MORA = 202;

export type CostTier = {
  id: number;
  name: string;
  icon: string | null;
  needed: number;
  owned: number;
  short: number;
};

export type CostRow = {
  key: string;
  name: string;
  icon: string | null;
  needed: number;
  owned: number;
  short: number;
  /** Ascension, talents, or both — the same drop often pays for both. */
  reasons: Reason[];
  /** The tiers behind the row, when there is more than one. Empty otherwise. */
  tiers: CostTier[];
};

export type UpgradeCost = {
  from: Progress;
  to: Progress;
  rows: CostRow[];
  /**
   * Needed, held and missing, like every other row. It used to be the missing
   * figure alone, which read as the price: 400 000 for two talents 6→8 that
   * cost 760 000, because the bag's mora had quietly been taken off.
   */
  mora: Pick<CostRow, 'needed' | 'owned' | 'short'>;
  /** True when the bag and the character already cover the target. */
  covered: boolean;
};

/**
 * What this character still costs, and only that.
 *
 * Three subtractions, in this order: phases already passed, levels already
 * reached, and what the bag already holds. What a level cost on the way here is
 * spent money — the character sheet lists it phase by phase as reference, and
 * that is the right place for it, but a plan that repeats it is asking the
 * player to do the arithmetic the plan exists to do.
 *
 * `computeDemand` is the same function the farming plan runs, given one source
 * instead of the roster, so the number here and the number on the plan screen
 * cannot drift apart. It already drops anything the bag covers.
 */
export async function upgradeCostFor(context: BuildContext): Promise<UpgradeCost> {
  const { catalog, character, characterId, db, loadout } = context;

  const from: Progress = {
    level: loadout?.level ?? 1,
    ascension: loadout?.ascension ?? 0,
    talents: loadout?.talent ?? { auto: 1, skill: 1, burst: 1 },
  };

  // The same fallback the goal form and the planner use, for the same reason:
  // a target nobody wrote down is still the one being costed. See
  // `ASSUMED_TARGET`.
  const to: Progress = {
    level: loadout?.target.level ?? ASSUMED_TARGET.level,
    ascension: loadout?.target.ascension ?? ASSUMED_TARGET.ascension,
    talents: loadout?.target.talents ?? ASSUMED_TARGET.talents,
  };

  const source: DemandSource = {
    characterId,
    buildName: character.name,
    current: from,
    target: to,
    ascensionCosts: character.costs,
    talentCosts: character.talentCosts,
    weapon: null,
  };

  const stock = await readMaterialStock(db, await getProfileId(db));
  const needs = computeDemand([source], stock);

  const families = familiesOf(catalog, character);
  const rows = new Map<string, CostRow>();
  let mora = { needed: 0, owned: 0, short: 0 };

  for (const need of needs) {
    if (need.materialId === MORA) {
      mora = { needed: need.needed, owned: need.owned, short: need.short };
      continue;
    }

    const material = catalog.materials.get(need.materialId);
    const key = families.get(need.materialId) ?? `material-${need.materialId}`;
    const row = rows.get(key) ?? {
      key,
      name: material?.name ?? `#${need.materialId}`,
      icon: material?.icon ?? null,
      needed: 0,
      owned: 0,
      short: 0,
      reasons: [],
      tiers: [],
    };

    row.needed += need.needed;
    row.owned += need.owned;
    row.short += need.short;
    for (const entry of need.by) {
      if (!row.reasons.includes(entry.reason)) row.reasons.push(entry.reason);
    }
    row.tiers.push({
      id: need.materialId,
      name: material?.name ?? `#${need.materialId}`,
      icon: material?.icon ?? null,
      needed: need.needed,
      owned: need.owned,
      short: need.short,
    });

    rows.set(key, row);
  }

  const ordered = [...rows.values()].map((row) => {
    // Lowest tier first: the row is named after what you farm, and the higher
    // tiers are crafted from it.
    row.tiers.sort((a, b) => a.id - b.id);
    row.name = row.tiers[0]?.name ?? row.name;
    row.icon = row.tiers[0]?.icon ?? row.icon;
    if (row.tiers.length === 1) row.tiers = [];
    return row;
  });

  /*
   * Ordered by the game's own `sortRank`, descending: crown, books, gems, boss
   * drops, mob drops, the local specialty. It is the order the bag itself uses,
   * so a row is where the player's eye already expects it — and it is stable,
   * which sorting by "what is most missing" is not.
   */
  ordered.sort((a, b) => rankOf(catalog, b) - rankOf(catalog, a) || a.key.localeCompare(b.key));

  return { from, to, rows: ordered, mora, covered: ordered.length === 0 && mora.short === 0 };
}

function rankOf(catalog: Catalog, row: CostRow) {
  const id = row.tiers[0]?.id ?? Number(row.key.replace(/\D/g, ''));
  return catalog.materials.get(id)?.sortRank ?? 0;
}

/**
 * Which materials are tiers of one another, for this character.
 *
 * A gem is four items in the data and one thing to farm: three fragments craft
 * into the tier above, so "how much jade do I still need" is a question about
 * the family, not about the row the bag happens to be showing. The game groups
 * them with `sortRank` — every tier of a family shares one — but a rank is not
 * unique on its own: a character's ascension boss drop and their weekly boss
 * drop both rank `11101`, and for eight characters the two ids are even
 * adjacent, so no rule over ids alone tells them apart.
 *
 * What does tell them apart is which table they are billed from. The two never
 * appear in the same one: the ascension drop is only in `costs`, the weekly
 * only in `talentCosts`. So families are grouped inside each table, where a
 * rank *is* unique (checked across the whole dataset), and then merged across
 * tables when they share an id — which is exactly the mob drop, the one family
 * that really does pay for both.
 */
export function familiesOf(catalog: Catalog, character: CharacterView): Map<number, string> {
  const groups: Set<number>[] = [];

  for (const table of [character.costs, character.talentCosts] as CostsByPhase[]) {
    const byRank = new Map<number, Set<number>>();

    for (const items of Object.values(table)) {
      for (const item of items) {
        if (item.id === MORA) continue;
        const rank = catalog.materials.get(item.id)?.sortRank;
        if (rank === undefined) continue;

        const ids = byRank.get(rank) ?? new Set<number>();
        ids.add(item.id);
        byRank.set(rank, ids);
      }
    }

    for (const ids of byRank.values()) {
      const shared = groups.find((group) => [...ids].some((id) => group.has(id)));
      if (shared) for (const id of ids) shared.add(id);
      else groups.push(ids);
    }
  }

  const families = new Map<number, string>();
  for (const group of groups) {
    const key = `family-${Math.min(...group)}`;
    for (const id of group) families.set(id, key);
  }

  return families;
}
