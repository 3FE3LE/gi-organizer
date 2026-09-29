import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import { fetchShowcase } from '@/lib/enka/fetch';

import { getProfileId } from './db';
import { readRoster } from './characters';
import { readEnkaAccount, recordShowcase } from './enka-profile';
import { applyShowcasePayload } from './import';

/**
 * Reads the showcase for the stored UID, keeps the profile, and brings the
 * characters in it up to date.
 *
 * Run when the app opens, at most every `MIN_INTERVAL`, and on demand from the
 * profile's button. Progress only moves up — see `UpsertOptions.onlyForward` —
 * and the bag is never touched: a showcase cannot see it. Whoever it moved up
 * is noted, so the pages that read the bag can say it is behind.
 */
export type SyncResult =
  | { status: 'no-uid' }
  | { status: 'fresh' }
  | { status: 'failed'; code: string }
  | { status: 'synced'; changed: boolean; advanced: number[] };

/** Enka's own cache is a minute at least; a visit every few seconds need not ask. */
const MIN_INTERVAL = 5 * 60 * 1000;

export async function syncShowcase(options: { force?: boolean } = {}, db: Db = getDb()): Promise<SyncResult> {
  const { uid, profile } = await readEnkaAccount(db);
  if (!uid) return { status: 'no-uid' };
  if (!options.force && profile && Date.now() - Date.parse(profile.fetchedAt) < MIN_INTERVAL) {
    return { status: 'fresh' };
  }

  const result = await fetchShowcase(uid);
  if (!result.ok) return { status: 'failed', code: result.code };

  const profileId = await getProfileId(db);
  const progressOf = async () => new Map((await readRoster(db, profileId)).map((entry) => [
    entry.characterId,
    [entry.level, entry.ascension, entry.constellation, entry.talent.auto, entry.talent.skill, entry.talent.burst],
  ]));

  const before = await progressOf();
  // No inventory copy for the automatic read; a forced one keeps it.
  await applyShowcasePayload(result.payload, { snapshot: options.force === true });
  const after = await progressOf();

  // Only moves up, so any difference is a step forward.
  const advanced = [...after].filter(([id, values]) => {
    const old = before.get(id);
    return old !== undefined && values.some((value, index) => value > old[index]);
  }).map(([id]) => id);

  const previous = JSON.stringify(profile?.showcase ?? []);
  await recordShowcase(result.payload, new Date().toISOString(), advanced, db);
  const showcaseChanged = previous !== JSON.stringify((await readEnkaAccount(db)).profile?.showcase ?? []);

  return { status: 'synced', changed: advanced.length > 0 || showcaseChanged || !profile, advanced };
}
