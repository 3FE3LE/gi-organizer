import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import type { Strategy } from '@/lib/rules/invest';

import { getProfileId } from './db';

/**
 * How the account wants its resin spent.
 *
 * Balanced raises everyone in the plan towards "acceptable" before pushing
 * anyone past it; the other two pour it into one team or one character, which
 * is how a single build gets finished while three others wait. One fact per
 * account, asked on the page that uses it and remembered, like the world
 * level.
 */
const BALANCED: Strategy = { mode: 'balance' };

function parse(raw: string | null | undefined): Strategy {
  if (!raw) return BALANCED;
  try {
    const value = JSON.parse(raw) as Partial<Strategy> & { teamId?: unknown; characterId?: unknown };
    if (value.mode === 'team' && typeof value.teamId === 'string') return { mode: 'team', teamId: value.teamId };
    if (value.mode === 'character' && typeof value.characterId === 'number') {
      return { mode: 'character', characterId: value.characterId };
    }
  } catch {
    // A value nobody can read is the default, not an error on the page.
  }
  return BALANCED;
}

export async function readInvestStrategy(db: Db = getDb()): Promise<Strategy> {
  const row = (await db
    .prepare('SELECT invest_strategy FROM profile WHERE id = ?')
    .get(await getProfileId(db))) as { invest_strategy: string | null } | undefined;
  return parse(row?.invest_strategy);
}

export async function setInvestStrategy(strategy: Strategy, db: Db = getDb()) {
  const stored = strategy.mode === 'balance' ? null : JSON.stringify(strategy);
  await db.prepare('UPDATE profile SET invest_strategy = ? WHERE id = ?')
    .run(stored, await getProfileId(db));
}
