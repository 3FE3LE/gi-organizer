import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import { DEFAULT_REGION, isGameRegion, type GameRegion } from '@/lib/rules/game-day';

import { getProfileId } from './db';

/**
 * Which game server this account plays on.
 *
 * One fact per account, and the only input the day view has that cannot be
 * derived: every instant is some day on one server and another day on the
 * next, so "what rotates today" is unanswerable until somebody says which
 * clock they are on. Stored rather than asked for on each visit, because the
 * answer changes about once a lifetime.
 */

export async function readRegion(db: Db = getDb()): Promise<GameRegion> {
  const row = (await db
    .prepare('SELECT game_region FROM profile WHERE id = ?')
    .get(await getProfileId(db))) as { game_region: string | null } | undefined;

  return isGameRegion(row?.game_region) ? row.game_region : DEFAULT_REGION;
}

export async function setRegion(region: GameRegion, db: Db = getDb()) {
  await db.prepare('UPDATE profile SET game_region = ? WHERE id = ?')
    .run(region, await getProfileId(db));
}
