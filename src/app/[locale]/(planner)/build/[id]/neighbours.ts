import 'server-only';

import type { Catalog } from '@/lib/data/catalog';
import type { Db } from '@/lib/db/client';
import { readOwnedCharacterIds } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';

export type Neighbour = { id: number; name: string; icon: string | null };

/**
 * The character before and after this one, in the order the roster shows.
 *
 * Which list to walk is the only decision here, and it follows the gallery the
 * player came from: someone opening a character they own is going through their
 * roster, and jumping from Venti to a five-star they have never pulled because
 * it happens to be next in the catalogue is not a step through anything. So an
 * owned character walks the owned, and everybody else walks the whole
 * catalogue — the two lists the roster page draws, in the same release order.
 *
 * It wraps, because a list of a hundred and twenty with two dead ends at the
 * edges is a list that stops working exactly where someone is scrubbing
 * fastest.
 */
export async function neighboursOf(
  characterId: number,
  catalog: Catalog,
  db: Db,
): Promise<{ previous: Neighbour | null; next: Neighbour | null }> {
  const owned = await readOwnedCharacterIds(db, await getProfileId(db));
  const byRelease = catalog.index.charactersByRelease;
  const list = owned.has(characterId)
    ? byRelease.filter((character) => owned.has(character.id))
    : byRelease;

  const at = list.findIndex((character) => character.id === characterId);
  if (at === -1 || list.length < 2) return { previous: null, next: null };

  const entry = (index: number): Neighbour => {
    const character = list[(index + list.length) % list.length];
    return { id: character.id, name: character.name, icon: character.icon };
  };

  return { previous: entry(at - 1), next: entry(at + 1) };
}
