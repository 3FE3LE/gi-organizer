import 'server-only';

import type { Locale } from './locales';
import {
  getCoreArtifacts,
  getCoreCharacters,
  getCoreMaterials,
  getCoreWeapons,
  getEnkaStore,
  getMeta,
  loadStrings,
} from './registry';
import type {
  ArtifactSlot,
  ArtifactView,
  CatalogIndexes,
  CoreArtifact,
  CharacterView,
  LocalizedArtifact,
  LocalizedCharacter,
  LocalizedMaterial,
  LocalizedWeapon,
  MaterialView,
  WeaponView,
} from './types';

/**
 * The catalog is the read side of the app: everything the game defines, as
 * opposed to what a player owns.
 *
 * It is assembled once per locale per server process and frozen. Two properties
 * matter downstream:
 *
 *   1. **Lookups are O(1) by id.** Every relation in the dataset — ascension
 *      costs, artifact pieces, equipped gear from an Enka import — is stored as
 *      an id, so resolution has to be free.
 *   2. **Reverse indexes exist up front.** Planning questions are of the form
 *      "which polearms could this character use" or "who else on this team wants
 *      this set", which are scans unless the index is precomputed.
 *
 * Locale only affects strings; ids, stats and costs are shared, so switching
 * language never invalidates a relation.
 */
export type Catalog = {
  locale: Locale;
  gameVersion: string;
  characters: Map<number, CharacterView>;
  weapons: Map<number, WeaponView>;
  artifacts: Map<number, ArtifactView>;
  materials: Map<number, MaterialView>;
  props: Record<string, string>;
  /** Enka's skill ordering table, keyed by `avatarId` or `avatarId-depotId`. */
  enka: Awaited<ReturnType<typeof getEnkaStore>>;
  index: CatalogIndexes;
};

const catalogs = new Map<Locale, Promise<Catalog>>();

export function getCatalog(locale: Locale): Promise<Catalog> {
  let pending = catalogs.get(locale);
  if (!pending) {
    pending = build(locale);
    catalogs.set(locale, pending);
  }
  return pending;
}

async function build(locale: Locale): Promise<Catalog> {
  const [
    meta, coreCharacters, coreWeapons, coreArtifacts, coreMaterials,
    characterStrings, weaponStrings, artifactStrings, materialStrings,
    props, enka,
  ] = await Promise.all([
    getMeta(),
    getCoreCharacters(),
    getCoreWeapons(),
    getCoreArtifacts(),
    getCoreMaterials(),
    loadStrings<LocalizedCharacter>('characters', locale),
    loadStrings<LocalizedWeapon>('weapons', locale),
    loadStrings<LocalizedArtifact>('artifacts', locale),
    loadStrings<LocalizedMaterial>('materials', locale),
    loadStrings<string>('props', locale),
    getEnkaStore(),
  ]);

  const characters = join<CharacterView>(coreCharacters, characterStrings);
  const weapons = join<WeaponView>(coreWeapons, weaponStrings);
  const artifacts = joinArtifacts(coreArtifacts, artifactStrings);
  const materials = join<MaterialView>(coreMaterials, materialStrings);

  const collator = new Intl.Collator(locale);
  const byName = (a: { name: string }, b: { name: string }) =>
    collator.compare(a.name, b.name);

  const index: CatalogIndexes = {
    charactersByElement: group([...characters.values()], (c) => c.elementType, byName),
    charactersByWeaponType: group([...characters.values()], (c) => c.weaponType, byName),
    /**
     * The index a scarcity-aware planner reads: a character can only ever hold a
     * weapon of its own type, so candidate sets are per weapon type.
     */
    weaponsByType: group([...weapons.values()], (w) => w.weaponType, byName),
    materialsByCategory: group([...materials.values()], (m) => m.category, byName),
    charactersSorted: [...characters.values()].sort(
      (a, b) => b.rarity - a.rarity || byName(a, b),
    ),
    weaponsSorted: [...weapons.values()].sort(
      (a, b) => b.rarity - a.rarity || byName(a, b),
    ),
    artifactsSorted: [...artifacts.values()].sort(byName),
  };

  return Object.freeze({
    locale,
    gameVersion: meta.gameVersion,
    characters,
    weapons,
    artifacts,
    materials,
    props,
    enka,
    index,
  });
}

/**
 * Artifacts are the one record whose two halves collide: both carry a `pieces`
 * map — icons on the neutral side, names on the localized one — and a shallow
 * merge would drop whichever came first. So the slots are merged per slot.
 */
function joinArtifacts(
  core: Record<string, CoreArtifact>,
  strings: Record<string, LocalizedArtifact>,
): Map<number, ArtifactView> {
  const merged = new Map<number, ArtifactView>();

  for (const [id, record] of Object.entries(core)) {
    const localized = strings[id];
    const slots = new Set([
      ...Object.keys(record.pieces ?? {}),
      ...Object.keys(localized?.pieces ?? {}),
    ]) as Set<ArtifactSlot>;

    const pieces: ArtifactView['pieces'] = {};
    for (const slot of slots) {
      pieces[slot] = { ...localized?.pieces?.[slot], ...record.pieces?.[slot] } as
        ArtifactView['pieces'][ArtifactSlot];
    }

    merged.set(record.id, { ...record, ...localized, pieces } as ArtifactView);
  }

  return merged;
}

/** Merges a language-neutral record with its strings, keyed by id. */
function join<T>(
  core: Record<string, { id: number }>,
  strings: Record<string, object>,
): Map<number, T> {
  const merged = new Map<number, T>();
  for (const [id, record] of Object.entries(core)) {
    merged.set(record.id, { ...record, ...strings[id] } as T);
  }
  return merged;
}

function group<T>(items: T[], key: (item: T) => string, sort: (a: T, b: T) => number) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const bucket = groups.get(key(item));
    if (bucket) bucket.push(item);
    else groups.set(key(item), [item]);
  }
  for (const bucket of groups.values()) bucket.sort(sort);
  return groups;
}

/** Resolves `{ id, count }` cost entries into names and icons. */
export function resolveCosts(
  catalog: Catalog,
  costs: Record<string, { id: number; count: number }[]>,
) {
  return Object.entries(costs).map(([phase, items]) => ({
    phase,
    items: items.map(({ id, count }) => {
      const material = catalog.materials.get(id);
      return {
        id,
        count,
        name: material?.name ?? `#${id}`,
        icon: material?.icon ?? null,
      };
    }),
  }));
}

/** Localized stat label, falling back to the raw prop id so gaps are visible. */
export function propLabel(catalog: Catalog, prop: string) {
  return catalog.props[prop] ?? prop;
}

/**
 * `propLabel` with the percent variants told apart.
 *
 * The game names flat HP and HP% identically and lets the value carry the
 * difference — `311` against `46.6%`. That works on a stat line and fails
 * anywhere the name appears alone: a filter listing its ten substats showed
 * "Vida", "ATQ" and "DEF" twice each, and those pairs are the difference
 * between a roll worth having and a wasted one.
 */
export function statLabel(catalog: Catalog, prop: string) {
  const label = propLabel(catalog, prop);
  return prop.endsWith('_PERCENT') ? `${label}%` : label;
}

/**
 * Enka's per-character table: skill ordering, talent art and constellation art.
 *
 * Only the Traveler is keyed by skill depot, because only the Traveler's skills
 * change with the element; everyone else is keyed by avatar id alone.
 */
export function enkaEntry(catalog: Catalog, characterId: number, skillDepotId: number | null) {
  const byDepot = skillDepotId === null
    ? undefined
    : catalog.enka[`${characterId}-${skillDepotId}`];

  return byDepot ?? catalog.enka[String(characterId)] ?? null;
}
