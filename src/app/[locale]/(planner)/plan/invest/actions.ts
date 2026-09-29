'use server';

import { setInvestStrategy } from '@/lib/player/invest-strategy';
import { refreshEverywhere } from '@/lib/refresh';
import type { Strategy } from '@/lib/rules/invest';

/** How the account wants its resin spent; remembered, like the world level. */
export async function chooseStrategy(strategy: Strategy) {
  const safe: Strategy =
    strategy.mode === 'team' && typeof strategy.teamId === 'string' ? { mode: 'team', teamId: strategy.teamId }
      : strategy.mode === 'character' && Number.isInteger(strategy.characterId)
        ? { mode: 'character', characterId: strategy.characterId }
        : { mode: 'balance' };
  await setInvestStrategy(safe);
  refreshEverywhere();
}
