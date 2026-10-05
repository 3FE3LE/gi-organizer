import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server';

import { WEAPONS } from '@/lib/data/weapon-types';

import { HELD } from '../filters';

/**
 * The weapons tab's view, as it lives in the URL.
 *
 * Built the way the roster's is: one set of parsers for reading the page, for
 * the links every chip is, and for the search box that writes `q` as it is
 * typed. The type keys are the roster's (`sword`, `polearm`), so a bow filter
 * reads the same in either address bar.
 */

export { HELD, WEAPONS };

/** Three-star and up: below that a weapon has no passive to read. */
export const RARITIES = [5, 4, 3] as const;

/** Rarity is the bag's own order; the rest answer "which is furthest along". */
export const SORTS = ['rarity', 'level', 'refinement', 'name'] as const;
export type WeaponSort = (typeof SORTS)[number];

export const weaponParsers = {
  q: parseAsString.withDefault(''),
  type: parseAsArrayOf(parseAsStringLiteral(WEAPONS), ',').withDefault([]),
  rarity: parseAsArrayOf(parseAsInteger, ',').withDefault([]),
  /** Copies worn or in the bag; the weapons nobody owns drop out with either. */
  held: parseAsStringLiteral(HELD),
  sort: parseAsStringLiteral(SORTS).withDefault('rarity'),
};

export type WeaponFilters = inferParserType<typeof weaponParsers>;

export const loadWeaponFilters = createLoader(weaponParsers);

const serialize = createSerializer(weaponParsers);

export function weaponsHref(base: string, filters: WeaponFilters, patch: Partial<WeaponFilters> = {}) {
  return serialize(base, { ...filters, ...patch });
}

/** Everything a reset has to clear. `sort` is a view, not a narrowing. */
export const CLEARED: Partial<WeaponFilters> = { q: '', type: [], rarity: [], held: null };

export function isNarrowed(filters: WeaponFilters) {
  return filters.q !== '' || filters.type.length > 0 || filters.rarity.length > 0
    || filters.held !== null;
}
