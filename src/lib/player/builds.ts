import 'server-only';

import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import { getDb } from '@/lib/db/client';
import type { ArtifactSlot } from '@/lib/data/types';
import type { TeamRole } from '@/lib/rules/types';

import { getProfileId } from './db';

/**
 * A build is a target, not a record of what is equipped.
 *
 * The distinction is the point of the whole planner. What a character wears
 * today is inventory; a build is what they are meant to become, and the gap
 * between the two is the only thing worth reporting.
 *
 * A character has several, because the same character is a different target in
 * different teams. Venti supporting and Venti as a sub-dps want different main
 * stats, different sets and different thresholds — one row per character could
 * only ever hold one of them.
 */

export type SetPlan = { setIds: number[]; pieces: number };

/** A threshold that decides whether the build works, not a wish. */
export type StatGoal = { prop: string; min: number };

export type Build = {
  id: string;
  characterId: number;
  /**
   * What the goal is for. Role and mechanic are its identity — a character has
   * one goal per role, not a list of named variants, and the levelling target
   * lives on the character.
   */
  role: TeamRole | null;
  objective: string | null;
  weaponId: number | null;
  weaponRefinement: number | null;
  setPlan: SetPlan[];
  mainStats: Partial<Record<ArtifactSlot, string[]>>;
  substats: string[];
  goals: StatGoal[];
  notes: string | null;
};

type Row = {
  id: string; character_id: number; role: string | null;
  objective: string | null; weapon_id: number | null; weapon_refinement: number | null;
  set_plan_json: string; main_stats_json: string; substats_json: string;
  goals_json: string; notes: string | null;
};

const FIELDS = `id, character_id, role, objective, weapon_id, weapon_refinement,
                set_plan_json, main_stats_json, substats_json, goals_json, notes`;

function toBuild(row: Row): Build {
  return {
    id: row.id,
    characterId: row.character_id,
    role: (row.role as TeamRole | null) ?? null,
    objective: row.objective,
    weaponId: row.weapon_id,
    weaponRefinement: row.weapon_refinement,
    setPlan: JSON.parse(row.set_plan_json) as SetPlan[],
    mainStats: JSON.parse(row.main_stats_json) as Build['mainStats'],
    substats: JSON.parse(row.substats_json) as string[],
    goals: JSON.parse(row.goals_json) as StatGoal[],
    notes: row.notes,
  };
}

export function readBuilds(db: DatabaseSync = getDb()): Build[] {
  const rows = db
    .prepare(`SELECT ${FIELDS} FROM build WHERE profile_id = ?
              ORDER BY character_id, role IS NULL, role`)
    .all(getProfileId(db)) as unknown as Row[];

  return rows.map(toBuild);
}

export function readBuildsFor(characterId: number, db: DatabaseSync = getDb()): Build[] {
  const rows = db
    .prepare(`SELECT ${FIELDS} FROM build WHERE profile_id = ? AND character_id = ?
              ORDER BY role IS NULL, role`)
    .all(getProfileId(db), characterId) as unknown as Row[];

  return rows.map(toBuild);
}

export function readBuild(buildId: string, db: DatabaseSync = getDb()): Build | null {
  const row = db
    .prepare(`SELECT ${FIELDS} FROM build WHERE id = ? AND profile_id = ?`)
    .get(buildId, getProfileId(db)) as Row | undefined;

  return row ? toBuild(row) : null;
}

/**
 * The build a slot is aiming at.
 *
 * An explicit choice wins. Otherwise the one whose role matches what the slot
 * declared, and only then the default — because a slot that says "support"
 * should not be measured against a sub-dps target just because it was authored
 * first.
 */
export function resolveBuildForSlot(
  characterId: number,
  declaredRoles: TeamRole[],
  explicitBuildId: string | null,
  db: DatabaseSync = getDb(),
): Build | null {
  const builds = readBuildsFor(characterId, db);
  if (builds.length === 0) return null;

  if (explicitBuildId) {
    const chosen = builds.find((build) => build.id === explicitBuildId);
    if (chosen) return chosen;
  }

  const byRole = builds.find((build) => build.role !== null && declaredRoles.includes(build.role));
  // A goal with no role is the character's plain target, which is the right
  // answer when the slot declared nothing this character has a goal for.
  return byRole ?? builds.find((build) => build.role === null) ?? builds[0];
}

export type BuildInput = Omit<Build, 'id'> & { id?: string };

/**
 * How a goal reads in a list. It has no name by design — what it is *for* is
 * its identity, and a name was one more thing to keep in step with the role.
 */
export function goalLabel(build: Pick<Build, 'role' | 'objective'>) {
  return build.role ?? 'objetivo';
}

export function saveBuild(build: BuildInput, db: DatabaseSync = getDb()) {
  const profileId = getProfileId(db);
  const id = build.id ?? randomUUID();

  db.prepare(`INSERT INTO build
      (id, profile_id, character_id, role, objective, weapon_id, weapon_refinement,
       set_plan_json, main_stats_json, substats_json, goals_json, notes, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT (id) DO UPDATE SET
        role = excluded.role, objective = excluded.objective,
        weapon_id = excluded.weapon_id, weapon_refinement = excluded.weapon_refinement,
        set_plan_json = excluded.set_plan_json, main_stats_json = excluded.main_stats_json,
        substats_json = excluded.substats_json, goals_json = excluded.goals_json,
        notes = excluded.notes`)
    .run(
      id, profileId, build.characterId, build.role, build.objective,
      build.weaponId, build.weaponRefinement,
      JSON.stringify(build.setPlan), JSON.stringify(build.mainStats),
      JSON.stringify(build.substats), JSON.stringify(build.goals),
      build.notes, new Date().toISOString(),
    );

  return id;
}

export function deleteBuild(buildId: string, db: DatabaseSync = getDb()) {
  return db
    .prepare('DELETE FROM build WHERE id = ? AND profile_id = ?')
    .run(buildId, getProfileId(db)).changes;
}
