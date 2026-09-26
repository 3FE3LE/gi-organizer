import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server';

import { GROUPINGS } from '@/lib/data/grouping';

/**
 * The roster's view, as it lives in the URL.
 *
 * One definition for reading it (`loadRosterFilters`), for writing it into a
 * link (`rosterHref`) and for the search box that updates it as you type — so
 * a key cannot be parsed one way and rebuilt another. The element and weapon
 * keys are the game's enums lowercased and stripped (`pyro`, `polearm`),
 * because `ELEMENT_PYRO` in an address bar reads as noise.
 */

export const VIEWS = ['gallery', 'calendar'] as const;

export const ELEMENTS = ['pyro', 'hydro', 'anemo', 'electro', 'dendro', 'cryo', 'geo'] as const;
export type ElementKey = (typeof ELEMENTS)[number];

export const WEAPONS = ['sword', 'claymore', 'polearm', 'catalyst', 'bow'] as const;
export type WeaponKey = (typeof WEAPONS)[number];

export const RARITIES = [5, 4] as const;

/** Release is the gallery's own order; the rest answer "who is furthest along". */
export const SORTS = ['release', 'level', 'constellation', 'name'] as const;
export type RosterSort = (typeof SORTS)[number];

export const rosterParsers = {
  view: parseAsStringLiteral(VIEWS).withDefault('gallery'),
  group: parseAsStringLiteral(GROUPINGS).withDefault('owned'),
  /** A name, or part of one. */
  q: parseAsString.withDefault(''),
  element: parseAsArrayOf(parseAsStringLiteral(ELEMENTS), ',').withDefault([]),
  weapon: parseAsArrayOf(parseAsStringLiteral(WEAPONS), ',').withDefault([]),
  rarity: parseAsArrayOf(parseAsInteger, ',').withDefault([]),
  sort: parseAsStringLiteral(SORTS).withDefault('release'),
};

export type RosterFilters = inferParserType<typeof rosterParsers>;

export const loadRosterFilters = createLoader(rosterParsers);

const serialize = createSerializer(rosterParsers);

/** The same view back as a link, with some values changed. */
export function rosterHref(base: string, filters: RosterFilters, patch: Partial<RosterFilters> = {}) {
  return serialize(base, { ...filters, ...patch });
}

/** Toggling one value of a list filter, since every chip does it. */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value) ? values.filter((entry) => entry !== value) : [...values, value];
}

/** `ELEMENT_PYRO` → `pyro`. */
export function elementKey(elementType: string) {
  return elementType.replace(/^ELEMENT_/, '').toLowerCase();
}

const WEAPON_KEYS: Record<string, WeaponKey> = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_CATALYST: 'catalyst',
  WEAPON_BOW: 'bow',
};

/** `WEAPON_POLE` → `polearm`. */
export function weaponKey(weaponType: string): WeaponKey | undefined {
  return WEAPON_KEYS[weaponType];
}

/** Whether any narrowing is on, so the page can offer to clear it. */
export function isNarrowed(filters: RosterFilters) {
  return filters.q !== '' || filters.element.length > 0 || filters.weapon.length > 0
    || filters.rarity.length > 0;
}

/** For matching a typed name: case and accents ignored, as a player types them. */
export function fold(text: string) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase();
}
