import { elementKey, fold, weaponKey, type RosterFilters } from './filters';

/** What narrowing reads off a character. */
export type Narrowable = {
  id: number;
  name: string;
  elementType: string;
  weaponType: string;
  rarity: number;
};

/** What sorting reads off the roster row, for the characters you have. */
export type Progress = { level: number; constellation: number };

/**
 * The gallery's list after the search, the chips and the order.
 *
 * Values within one filter widen (Pyro or Hydro), filters together narrow
 * (Pyro, and a bow) — which is what a row of chips promises by being one row.
 * The input is in release order, and every sort falls back to it, so two
 * level-90s keep the order the gallery already taught.
 */
export function narrowRoster<T extends Narrowable>(
  characters: readonly T[],
  filters: Pick<RosterFilters, 'q' | 'element' | 'weapon' | 'rarity' | 'sort'>,
  progress: ReadonlyMap<number, Progress>,
  locale: string,
): T[] {
  const query = fold(filters.q.trim());
  const elements = new Set<string>(filters.element);
  const weapons = new Set<string>(filters.weapon);
  const rarities = new Set(filters.rarity);

  const kept = characters.filter((character) =>
    (!query || fold(character.name).includes(query))
    && (elements.size === 0 || elements.has(elementKey(character.elementType)))
    && (weapons.size === 0 || weapons.has(weaponKey(character.weaponType) ?? ''))
    && (rarities.size === 0 || rarities.has(character.rarity)));

  if (filters.sort === 'release') return kept;

  const release = new Map(characters.map((character, index) => [character.id, index]));
  const byRelease = (a: T, b: T) => release.get(a.id)! - release.get(b.id)!;
  // Nobody you do not have outranks somebody you do.
  const of = (character: T) => progress.get(character.id);

  return [...kept].sort((a, b) => {
    switch (filters.sort) {
      case 'name':
        return a.name.localeCompare(b.name, locale) || byRelease(a, b);
      case 'level':
        return (of(b)?.level ?? -1) - (of(a)?.level ?? -1)
          || (of(b)?.constellation ?? -1) - (of(a)?.constellation ?? -1)
          || byRelease(a, b);
      case 'constellation':
        return (of(b)?.constellation ?? -1) - (of(a)?.constellation ?? -1)
          || (of(b)?.level ?? -1) - (of(a)?.level ?? -1)
          || byRelease(a, b);
      default:
        return byRelease(a, b);
    }
  });
}
