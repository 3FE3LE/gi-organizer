import 'server-only';

import { cache } from 'react';

import { type Catalog, getCatalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { CharacterView } from '@/lib/data/types';
import { getDb, type Db } from '@/lib/db/client';

import { getProfileId } from './db';

/**
 * The Traveler, who is one character in the game and three in the data.
 *
 * The catalogue carries two bodies — Aether and Lumine, two ids — and neither
 * has an element of its own: `ELEMENT_NONE`, because the element is whichever
 * statue the player last resonated with. The account has exactly one of the
 * two, in exactly one element at a time. So:
 *
 *   - **Which body** is the account's is remembered on the profile, because no
 *     source says: GOOD carries no gender, and a scan that missed the
 *     character screen carries nothing at all.
 *   - **Which element** is the roster row's skill depot — the game's own id
 *     for a Traveler's skill set, and what Enka keys the Traveler's talents by
 *     (`10000005-504` is Anemo Aether).
 *   - **Everywhere else** reads an account-aware copy of the catalogue, in
 *     which the Traveler has that element and only the account's body is
 *     listed. See `getAccountCatalog`.
 */

export const TRAVELER_BODIES = { male: 10000005, female: 10000007 } as const;
export type TravelerBody = keyof typeof TRAVELER_BODIES;

export function isTravelerId(id: number) {
  return id === TRAVELER_BODIES.male || id === TRAVELER_BODIES.female;
}

/** Enka's element names, which are the game's internal ones. */
const ENKA_ELEMENT: Record<string, string> = {
  Wind: 'ELEMENT_ANEMO',
  Rock: 'ELEMENT_GEO',
  Electric: 'ELEMENT_ELECTRO',
  Grass: 'ELEMENT_DENDRO',
  Water: 'ELEMENT_HYDRO',
  Fire: 'ELEMENT_PYRO',
  Ice: 'ELEMENT_CRYO',
};

/** `ELEMENT_ANEMO` from either vocabulary: GOOD's enum or Enka's `Wind`. */
function asElement(value: string) {
  return value.startsWith('ELEMENT_') ? value : ENKA_ELEMENT[value] ?? null;
}

/**
 * The skill depot for a body in an element, read off Enka's table rather
 * than hard-coded: its keys are `avatarId-depotId`, and each entry names its
 * element. `null` for an element the body has no form in yet.
 */
export function travelerDepot(catalog: Catalog, characterId: number, element: string) {
  const wanted = asElement(element);
  if (!wanted) return null;

  for (const [key, entry] of Object.entries(catalog.enka)) {
    const [id, depot] = key.split('-');
    if (Number(id) !== characterId || depot === undefined) continue;
    if (entry.element && asElement(entry.element) === wanted) return Number(depot);
  }
  return null;
}

/** The element a depot is, or `null` for the elementless first one. */
export function elementOfDepot(catalog: Catalog, characterId: number, depot: number | null) {
  if (depot === null) return null;
  const entry = catalog.enka[`${characterId}-${depot}`];
  return entry?.element ? asElement(entry.element) : null;
}

/** The elements a body can take, in the order the game added them. */
export function travelerElements(catalog: Catalog, characterId: number) {
  return Object.entries(catalog.enka)
    .filter(([key]) => key.startsWith(`${characterId}-`))
    .map(([, entry]) => (entry.element ? asElement(entry.element) : null))
    .filter((element): element is string => element !== null);
}

/** An element's name in the catalogue's language, borrowed from anyone of it. */
export function elementName(catalog: Catalog, element: string) {
  return catalog.index.charactersByElement.get(element)?.[0]?.elementText ?? element;
}

export async function readTravelerBody(db: Db, profileId: string): Promise<TravelerBody | null> {
  const row = (await db
    .prepare('SELECT traveler_body FROM profile WHERE id = ?')
    .get(profileId)) as { traveler_body: string | null } | undefined;
  return row?.traveler_body === 'female' ? 'female' : row?.traveler_body === 'male' ? 'male' : null;
}

export async function setTravelerBody(db: Db, profileId: string, body: TravelerBody) {
  await db.prepare('UPDATE profile SET traveler_body = ? WHERE id = ?').run(body, profileId);
}

/**
 * Which body the account plays: the one it named, else the one on the
 * roster, else the one wearing gear, else Aether — which is what an import
 * assigns the Traveler's gear to when nothing else says.
 */
async function accountTraveler(db: Db, profileId: string) {
  // Independent reads, so one round trip rather than two.
  const [named, rows] = await Promise.all([
    readTravelerBody(db, profileId),
    db.prepare(`SELECT character_id, skill_depot_id FROM character_build
                WHERE profile_id = ? AND character_id IN (?, ?)`)
      .all(profileId, TRAVELER_BODIES.male, TRAVELER_BODIES.female) as Promise<unknown> as
      Promise<{ character_id: number; skill_depot_id: number | null }[]>,
  ]);

  let body: TravelerBody = named ?? 'male';
  if (!named) {
    if (rows.some((row) => row.character_id === TRAVELER_BODIES.female)
      && !rows.some((row) => row.character_id === TRAVELER_BODIES.male)) {
      body = 'female';
    } else if (rows.length === 0) {
      const worn = (await db
        .prepare(`SELECT assigned_character_id id FROM artifact_instance
                  WHERE profile_id = ? AND assigned_character_id IN (?, ?)
                  UNION SELECT assigned_character_id FROM weapon_instance
                  WHERE profile_id = ? AND assigned_character_id IN (?, ?)`)
        .all(
          profileId, TRAVELER_BODIES.male, TRAVELER_BODIES.female,
          profileId, TRAVELER_BODIES.male, TRAVELER_BODIES.female,
        )) as unknown as { id: number }[];
      if (worn.some((row) => row.id === TRAVELER_BODIES.female)) body = 'female';
    }
  }

  const id = TRAVELER_BODIES[body];
  const depot = rows.find((row) => row.character_id === id)?.skill_depot_id ?? null;
  return { body, id, depot };
}

/**
 * The catalogue as this account sees it.
 *
 * The same object `getCatalog` returns, except that the account's Traveler
 * carries the element of their skill depot, and the other body is left out
 * of every list — the gallery, the release order, the groupings — while
 * staying resolvable by id, so gear or a goal written against it still has a
 * name. Built once per request.
 */
export const getAccountCatalog = cache(async (locale: Locale): Promise<Catalog> => {
  // The catalogue is work on this processor and the Traveler is a trip to the
  // database, so the two run at once: on a new instance the first is the
  // catalogue's parse and the second is the connection's handshake.
  const db = getDb();
  const [catalog, traveler] = await Promise.all([
    getCatalog(locale),
    getProfileId(db).then((profileId) => accountTraveler(db, profileId)),
  ]);
  const hidden = traveler.id === TRAVELER_BODIES.male ? TRAVELER_BODIES.female : TRAVELER_BODIES.male;

  const found = catalog.characters.get(traveler.id);
  // The dataset carries no gacha art for either body, while both hosts serve
  // it under the name the other characters' art follows — derived here from
  // the avatar icon, the same way the namecard is.
  const base: CharacterView | undefined = found && !found.gachaSplash && found.icon?.startsWith('UI_AvatarIcon_')
    ? { ...found, gachaSplash: `UI_Gacha_AvatarImg_${found.icon.slice('UI_AvatarIcon_'.length)}` }
    : found;
  const element = elementOfDepot(catalog, traveler.id, traveler.depot);
  const own: CharacterView | undefined = base && element
    ? { ...base, elementType: element, elementText: elementName(catalog, element) }
    : base;

  const characters = new Map(catalog.characters);
  if (own) characters.set(own.id, own);

  const swap = (list: CharacterView[]) =>
    list.filter((character) => character.id !== hidden)
      .map((character) => (character.id === own?.id ? own : character));

  const byElement = new Map<string, CharacterView[]>();
  for (const [key, list] of catalog.index.charactersByElement) {
    byElement.set(key, swap(list).filter((character) => character.id !== own?.id));
  }
  if (own) byElement.set(own.elementType, [...(byElement.get(own.elementType) ?? []), own]);

  return {
    ...catalog,
    characters,
    index: {
      ...catalog.index,
      charactersByElement: byElement,
      charactersByWeaponType: new Map(
        [...catalog.index.charactersByWeaponType].map(([key, list]) => [key, swap(list)]),
      ),
      charactersSorted: swap(catalog.index.charactersSorted),
      // First, the way the game's own character list leads with them: by
      // release the Traveler is the oldest entry and sank to the very end of
      // the roster, behind everyone the account ever pulled.
      charactersByRelease: own
        ? [own, ...swap(catalog.index.charactersByRelease).filter((character) => character.id !== own.id)]
        : swap(catalog.index.charactersByRelease),
    },
  };
});
