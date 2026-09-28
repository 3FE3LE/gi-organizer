import type { Need } from '@/lib/rules/materials';

/**
 * The ungated materials, sorted into the piles the game itself keeps them in.
 *
 * Everything with no rotation lands in one list: Mora, gems, boss drops, local
 * specialties, mob drops. Laid out flat that was twenty unrelated chips in a
 * wrap, which reads as one long shopping list and hides the only thing worth
 * knowing — that four of them are the same arrowhead at three tiers, and two
 * are a trip to one boss.
 *
 * The catalog already carries the pile each material belongs to, so the
 * grouping is read rather than invented. Inside a pile the game's own sort
 * order applies, which is what puts the tiers of one family next to each
 * other.
 */

export type MaterialGrouping = {
  /** The pile, as the catalog words it in this locale. */
  typeText?: string | null;
  /** The game's inventory order. Tiers of one family share a rank. */
  sortRank?: number;
};

export type AnytimeGroup = {
  label: string;
  needs: Need[];
  /** What the whole pile is short, which is the number worth collapsing to. */
  short: number;
};

export function groupAnytime(
  needs: Need[],
  describe: (materialId: number) => MaterialGrouping | undefined,
  unsortedLabel: string,
): AnytimeGroup[] {
  const rankOf = (need: Need) => describe(need.materialId)?.sortRank ?? Number.MAX_SAFE_INTEGER;

  const groups = new Map<string, { rank: number; needs: Need[] }>();

  for (const need of needs) {
    const label = describe(need.materialId)?.typeText?.trim() || unsortedLabel;
    const group = groups.get(label) ?? { rank: Number.MAX_SAFE_INTEGER, needs: [] };

    group.rank = Math.min(group.rank, rankOf(need));
    group.needs.push(need);
    groups.set(label, group);
  }

  return [...groups.entries()]
    .map(([label, group]) => ({
      label,
      needs: [...group.needs].sort((a, b) => rankOf(a) - rankOf(b) || a.materialId - b.materialId),
      short: group.needs.reduce((total, need) => total + need.short, 0),
      rank: group.rank,
    }))
    // Mora, specialties, mob drops, bosses, gems — the order the bag is in.
    .sort((a, b) => a.rank - b.rank)
    .map(({ label, needs: sorted, short }) => ({ label, needs: sorted, short }));
}

/**
 * A pile split by the nation its drops come from, for the boss drops.
 *
 * Opened, the character level-up pile was one flat list of every boss on the
 * map — Hurricane Seed next to a Natlan statue core — when the question it
 * answers is a route: which bosses to run on this trip to Inazuma. So a pile
 * whose materials carry a nation is sectioned by it, in the order the journey
 * reaches them, and whatever the curated table does not name trails as a
 * section with no nation. `null` for a pile none of whose materials has one,
 * which is drawn flat as before.
 */
export function byNation<N extends string>(
  needs: Need[],
  nationOf: (materialId: number) => N | undefined,
  order: readonly N[],
): { nation: N | null; needs: Need[] }[] | null {
  const sections = new Map<N | null, Need[]>();
  for (const need of needs) {
    const nation = nationOf(need.materialId) ?? null;
    sections.set(nation, [...(sections.get(nation) ?? []), need]);
  }
  if (!sections.keys().some((nation) => nation !== null)) return null;

  const rank = (nation: N | null) => (nation === null ? order.length : order.indexOf(nation));
  return [...sections.entries()]
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([nation, sectioned]) => ({ nation, needs: sectioned }));
}
