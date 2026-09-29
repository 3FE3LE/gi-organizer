'use server';

import { setRegion } from '@/lib/player/region';
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
