import 'server-only';

import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { CharacterView } from '@/lib/data/types';
import { getDb, type Db } from '@/lib/db/client';
import { readLoadout, type Loadout } from '@/lib/player/loadout';
import { readGear } from '@/lib/player/queries';
import { readTargets } from '@/lib/player/targets';
import { suggestionsFor, type Suggestions } from '@/lib/rules/assemble';

import { pieceFormatter, type PieceFormatter } from './piece-view';

/**
 * Everything the build screen is a view of, read once.
 *
 * The page used to open with three hundred lines of this before it rendered
 * anything, which made every tab pay for every other tab's inputs and made the
 * file impossible to change in one place. Each view module below takes this and
 * produces exactly its own shape.
 */
export type BuildContext = {
  locale: Locale;
  catalog: Catalog;
  db: Db;
  characterId: number;
  character: CharacterView;
  gear: Awaited<ReturnType<typeof readGear>>;
  loadout: Loadout | null;
  suggestions: Suggestions;
  /** The weapon the scarcity pass has pencilled in, which is not the build's. */
  target: { weaponId: number | null; refinement: number | null };
  /** The sets this character is actually chasing. See `plannedSetsOf`. */
  plannedSetIds: Set<number>;
  /** How a piece is worded and scored. Shared, so two tabs cannot disagree. */
  format: PieceFormatter;
};

export async function loadBuildContext({
  locale,
  catalog,
  characterId,
  character,
  requestedBuild,
  db = getDb(),
}: {
  locale: Locale;
  catalog: Catalog;
  characterId: number;
  character: CharacterView;
  requestedBuild: string | null;
  db?: Db;
}): Promise<BuildContext> {
  const gear = await readGear(characterId, db);
  const [loadout, suggestions] = await Promise.all([
    readLoadout(characterId, catalog, db),
    suggestionsFor(characterId, catalog, db, requestedBuild),
  ]);

  const target = (await readTargets(db)).get(characterId) ?? { weaponId: null, refinement: null };

  return {
    locale,
    catalog,
    db,
    characterId,
    character,
    gear,
    loadout,
    suggestions,
    target,
    plannedSetIds: plannedSetsOf(gear, suggestions),
    format: pieceFormatter({ catalog, locale, characterId, suggestions }),
  };
}

/**
 * The sets this character is actually chasing.
 *
 * In order: what the build plans, then any set already worn two or more times —
 * a live bonus worth completing — and only if both are empty, the top two
 * suggestions. Every feasible suggestion would be most of the catalogue and
 * would let almost any piece through, which is the same as no rule at all.
 */
export function plannedSetsOf(
  gear: Awaited<ReturnType<typeof readGear>>,
  suggestions: Suggestions,
): Set<number> {
  const planned = new Set(suggestions.build?.setPlan.flatMap((plan) => plan.setIds) ?? []);

  const worn = new Map<number, number>();
  for (const piece of gear.bySlot.values()) {
    worn.set(piece.setId, (worn.get(piece.setId) ?? 0) + 1);
  }
  for (const [setId, count] of worn) if (count >= 2) planned.add(setId);

  if (planned.size === 0) {
    for (const suggestion of suggestions.sets.filter((entry) => entry.feasible).slice(0, 2)) {
      for (const setId of suggestion.setIds) planned.add(setId);
    }
  }

  return planned;
}
