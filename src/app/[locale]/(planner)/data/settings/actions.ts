'use server';

import { setRegion } from '@/lib/player/region';
import type { GameRegion } from '@/lib/rules/game-day';
import { refreshEverywhere } from '@/lib/refresh';

/**
 * Which server's clock the plan is read against.
 *
 * One fact per account rather than a filter in the URL: a player is on one
 * server, and a link that carried the answer would let a shared plan claim a
 * different day than the account it was shared from.
 */
export async function chooseRegion(region: GameRegion) {
  await setRegion(region);
  refreshEverywhere();
}
