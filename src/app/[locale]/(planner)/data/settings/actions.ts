'use server';

import { isUid, setUid } from '@/lib/player/enka-profile';
import { setRegion } from '@/lib/player/region';
import { syncShowcase } from '@/lib/player/showcase-sync';
import { setWorldLevel } from '@/lib/player/world-level';
import { isGameRegion, type GameRegion } from '@/lib/rules/game-day';
import { refreshEverywhere } from '@/lib/refresh';
import { isWorldLevel, type WorldLevel } from '@/lib/rules/resin';

/**
 * Which server's clock the plan is read against, or `null` to go back to
 * reading it off the browser's timezone.
 *
 * One fact per account rather than a filter in the URL: a player is on one
 * server, and a link that carried the answer would let a shared plan claim a
 * different day than the account it was shared from.
 */
export async function chooseRegion(region: GameRegion | null) {
  await setRegion(region !== null && isGameRegion(region) ? region : null);
  refreshEverywhere();
}

/** The world level the resin estimate reads drop rates at, or `null` for eight. */
export async function chooseWorldLevel(worldLevel: WorldLevel | null) {
  await setWorldLevel(isWorldLevel(worldLevel) ? worldLevel : null);
  refreshEverywhere();
}

export type UidState = { status: 'idle' | 'saved' | 'cleared' | 'invalid' | 'unreachable' };

/**
 * The account's UID. Saved, it is read straight away so the profile and the
 * showcase marks appear without waiting for the next visit; a UID Enka cannot
 * find is kept anyway, since a hidden showcase is a setting, not a typo.
 */
export async function saveUid(_previous: UidState, form: FormData): Promise<UidState> {
  const raw = String(form.get('uid') ?? '').trim();
  if (raw === '') {
    await setUid(null);
    refreshEverywhere();
    return { status: 'cleared' };
  }
  if (!isUid(raw)) return { status: 'invalid' };

  await setUid(raw);
  const result = await syncShowcase({ force: true }).catch(() => null);
  refreshEverywhere();
  return { status: result?.status === 'synced' ? 'saved' : 'unreachable' };
}
