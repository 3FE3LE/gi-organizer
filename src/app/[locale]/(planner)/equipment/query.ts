import 'server-only';

import type { Db } from '@/lib/db/client';
import { filterArtifacts, readArtifacts } from '@/lib/player/artifacts';

import { archetypeOf, type ArtifactFilters } from './filters';

/**
 * The box, and the slice of it the filters in the URL ask for.
 *
 * One read and one pass. The whole box is a single round trip, and the counts
 * in the header are of the box rather than of the slice, so narrowing it
 * further in SQL would only cost a second trip to answer the same thing.
 *
 * Shared by the page, which draws the first cards of the slice, and by the
 * action that hands the list the rest as it scrolls — so the two cannot
 * disagree about what the slice is or what order it is in.
 */
export async function queryArtifacts(filters: ArtifactFilters, db: Db) {
  const all = await readArtifacts(db);
  const shown = filterArtifacts(
    all,
    {
      slot: filters.slot,
      setId: filters.set,
      archetype: archetypeOf(filters),
      mainProp: filters.main,
      held: filters.held,
      minCritValue: filters.cv,
      levelCap: filters.lvl,
    },
    filters.sort,
    filters.scaler,
  );

  return { all, shown };
}

/** Cards the page draws before the first scroll, and per batch after it. */
export const PAGE_SIZE = 40;
