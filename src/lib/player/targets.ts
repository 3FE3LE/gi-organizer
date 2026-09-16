import 'server-only';

import type { DatabaseSync } from 'node:sqlite';

import { getDb } from '@/lib/db/client';

import { getProfileId } from './db';

/**
 * The build a character is meant to reach, as opposed to the one they hold.
 *
 * This is where scarcity lives. Two characters cannot hold one weapon instance
 * — the schema forbids it and so does the game — so a shortage never shows up
 * in what is equipped. It shows up in what is planned: four polearm supports
 * all pencilled in for the single Favonius Lance you own.
 */

export type BuildTarget = {
  characterId: number;
  weaponId: number | null;
  refinement: number | null;
  /** Sets the build is aiming for, which the rules read like worn ones. */
  setIds: number[];
  notes: string | null;
};

export function readTargets(db: DatabaseSync = getDb()): Map<number, BuildTarget> {
  const rows = db
    .prepare(`SELECT character_id, weapon_id, refinement, set_ids_json, notes
              FROM build_target WHERE profile_id = ?`)
    .all(getProfileId(db)) as unknown as {
      character_id: number; weapon_id: number | null; refinement: number | null;
      set_ids_json: string; notes: string | null;
    }[];

  return new Map(rows.map((row) => [row.character_id, {
    characterId: row.character_id,
    weaponId: row.weapon_id,
    refinement: row.refinement,
    setIds: JSON.parse(row.set_ids_json) as number[],
    notes: row.notes,
  }]));
}

export function setTarget(
  target: BuildTarget,
  db: DatabaseSync = getDb(),
) {
  db.prepare(`INSERT INTO build_target
      (profile_id, character_id, weapon_id, refinement, set_ids_json, notes)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT (profile_id, character_id) DO UPDATE SET
        weapon_id = excluded.weapon_id,
        refinement = excluded.refinement,
        set_ids_json = excluded.set_ids_json,
        notes = excluded.notes`)
    .run(
      getProfileId(db), target.characterId, target.weaponId, target.refinement,
      JSON.stringify(target.setIds), target.notes,
    );
}

export function clearTarget(characterId: number, db: DatabaseSync = getDb()) {
  return db
    .prepare('DELETE FROM build_target WHERE profile_id = ? AND character_id = ?')
    .run(getProfileId(db), characterId).changes;
}
