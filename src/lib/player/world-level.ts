import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import { DEFAULT_WORLD_LEVEL, isWorldLevel, type WorldLevel } from '@/lib/rules/resin';

import { getProfileId } from './db';

/**
 * The world level the account plays at.
 *
 * What turns a shortfall into resin: a domain at world level eight drops about
 * ten Teachings' worth a run, one at world level two about four. No import says
 * it — GOOD carries none, and Enka's is a profile field this app does not keep
 * — so it is asked for once, like the server, and until then read as eight,
 * where nearly everyone planning builds already is.
 */
export type WorldLevelSetting = {
  /** What the player chose, or `null` for the default. */
  chosen: WorldLevel | null;
  worldLevel: WorldLevel;
};

export async function readWorldLevelSetting(db: Db = getDb()): Promise<WorldLevelSetting> {
  const row = (await db
    .prepare('SELECT world_level FROM profile WHERE id = ?')
    .get(await getProfileId(db))) as { world_level: number | null } | undefined;

  const chosen = isWorldLevel(row?.world_level) ? row.world_level : null;
  return { chosen, worldLevel: chosen ?? DEFAULT_WORLD_LEVEL };
}

export async function readWorldLevel(db: Db = getDb()): Promise<WorldLevel> {
  return (await readWorldLevelSetting(db)).worldLevel;
}

/** `null` goes back to the default. */
export async function setWorldLevel(worldLevel: WorldLevel | null, db: Db = getDb()) {
  await db.prepare('UPDATE profile SET world_level = ? WHERE id = ?')
    .run(worldLevel, await getProfileId(db));
}
