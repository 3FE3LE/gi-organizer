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

const UNSORTED = 'Otros materiales';

export function groupAnytime(
  needs: Need[],
  describe: (materialId: number) => MaterialGrouping | undefined,
): AnytimeGroup[] {
  const rankOf = (need: Need) => describe(need.materialId)?.sortRank ?? Number.MAX_SAFE_INTEGER;

  const groups = new Map<string, { rank: number; needs: Need[] }>();

  for (const need of needs) {
    const label = describe(need.materialId)?.typeText?.trim() || UNSORTED;
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
