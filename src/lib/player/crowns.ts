import 'server-only';

import type { Db } from '@/lib/db/client';

import { readRoster } from './characters';
import { readMaterialStock } from './db';

/**
 * The Crown of Insight, and how many of them a plan can still spend.
 *
 * Every talent from 9 to 10 costs one, and crowns are not farmed: they come a
 * few at a time from events and the reputation shops, and the account has as
 * many as it has. A plan that takes a fourth talent to 10 with three crowns in
 * the bag costs out books and boss drops for a level it can never reach. So
 * the target is capped by the crowns the account holds, less the ones other
 * characters' targets already claim.
 */
export const CROWN_OF_INSIGHT = 104319;

/** Crowns a set of targets still needs: one per talent aimed at 10 from below it. */
export function crownsNeeded(
  current: { auto: number; skill: number; burst: number },
  target: { auto: number; skill: number; burst: number } | null,
) {
  if (!target) return 0;
  return (['auto', 'skill', 'burst'] as const)
    .filter((talent) => target[talent] >= 10 && current[talent] < 10).length;
}

/**
 * What the account holds, and what everyone but `characterId` has already
 * claimed with their targets. `free` is what this character may still plan.
 */
export async function crownBudget(db: Db, profileId: string, characterId: number) {
  const [stock, roster] = await Promise.all([
    readMaterialStock(db, profileId),
    readRoster(db, profileId),
  ]);

  const owned = stock.get(CROWN_OF_INSIGHT) ?? 0;
  const claimed = roster
    .filter((entry) => entry.characterId !== characterId)
    .reduce((total, entry) => total + crownsNeeded(entry.talent, entry.target.talents), 0);

  return { owned, claimed, free: Math.max(0, owned - claimed) };
}
