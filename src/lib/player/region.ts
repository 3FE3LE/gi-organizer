import 'server-only';

import { cookies } from 'next/headers';

import { getDb, type Db } from '@/lib/db/client';
import {
  DEFAULT_REGION, isGameRegion, regionForTimeZone, type GameRegion,
} from '@/lib/rules/game-day';

import { getProfileId } from './db';

/**
 * Which game server this account plays on.
 *
 * One fact per account, and the only input the day view has that cannot be
 * derived: every instant is some day on one server and another day on the
 * next, so "what rotates today" is unanswerable until somebody says which
 * clock they are on. Stored rather than asked for on each visit, because the
 * answer changes about once a lifetime.
 *
 * Until somebody says, it is read off the browser's timezone — see
 * `SyncTimeZoneCookie` — which is right for nearly everyone and a setting away
 * from right for the rest. Nothing is stored for the guess, so a player who
 * moves is guessed again rather than pinned to where they first opened the
 * site.
 */

/** The cookie `SyncTimeZoneCookie` writes the browser's IANA timezone into. */
export const TIME_ZONE_COOKIE = 'ui-tz';

export type RegionSetting = {
  /** What the player chose, or `null` for "detect it". */
  chosen: GameRegion | null;
  /** What the browser's timezone suggests, if it has said. */
  detected: GameRegion | null;
  /** The one the plan is read against. */
  region: GameRegion;
};

export async function readRegionSetting(db: Db = getDb()): Promise<RegionSetting> {
  const row = (await db
    .prepare('SELECT game_region FROM profile WHERE id = ?')
    .get(await getProfileId(db))) as { game_region: string | null } | undefined;

  const chosen = isGameRegion(row?.game_region) ? row.game_region : null;
  const zone = (await cookies()).get(TIME_ZONE_COOKIE)?.value;
  const detected = zone ? regionForTimeZone(decodeURIComponent(zone)) : null;

  return { chosen, detected, region: chosen ?? detected ?? DEFAULT_REGION };
}

export async function readRegion(db: Db = getDb()): Promise<GameRegion> {
  return (await readRegionSetting(db)).region;
}

/** `null` goes back to detecting it. */
export async function setRegion(region: GameRegion | null, db: Db = getDb()) {
  await db.prepare('UPDATE profile SET game_region = ? WHERE id = ?')
    .run(region, await getProfileId(db));
}
