'use server';

import { getDb } from '@/lib/db/client';
import { setDismissed } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import { refreshEverywhere } from '@/lib/refresh';

/**
 * Saying no to a character, and taking it back.
 *
 * The plan assumes every owned character is headed for the cap, which is the
 * only honest default once nobody has written a target down. What it produces
 * on the first screen after an import is every material in the game — true,
 * and unusable. This is the other half of that assumption: the refusal.
 */
export async function dismissRoster(characterIds: number[] | null) {
  await mark(characterIds, true);
}

/** `null` is everybody; a list is those characters — one face, or a team. */
export async function restoreRoster(characterIds: number[] | null) {
  await mark(characterIds, false);
}

async function mark(characterIds: number[] | null, dismissed: boolean) {
  const ids = characterIds?.filter((id) => Number.isInteger(id)) ?? null;
  const db = getDb();
  await setDismissed(db, await getProfileId(db), ids, dismissed);
  refreshEverywhere();
}
