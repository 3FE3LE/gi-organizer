import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDb, type Db } from '@/lib/db/client';
import { transaction } from '@/lib/db/tx';
import type { EndgameMode, TeamRole } from '@/lib/rules/types';

import { getProfileId } from './db';

/**
 * Teams and the deployments that field them.
 *
 * A team references characters only, never gear. A character has one global
 * build — which is what the game enforces — so adding them to a second team
 * cannot create a gear conflict, because there is nothing to conflict.
 *
 * The role lives on the slot rather than the character, which is the whole
 * point: Venti is a support in one team and a sub-dps in another, with no
 * duplication and no "which role is the real one".
 */

export type TeamSlot = {
  characterId: number;
  position: number;
  roles: TeamRole[];
  /** Facts the engine cannot derive, e.g. which element this wearer swirls. */
  declarations: Record<string, string>;
};

export type Team = {
  id: string;
  /** Empty on the draft — see `isDraft`. Shown through a translated label. */
  name: string;
  mode: EndgameMode;
  position: number;
  notes: string | null;
  /** The mechanic this team is built around, if any. */
  objective: string | null;
  slots: TeamSlot[];
};

export type Deployment = {
  id: string;
  name: string;
  mode: EndgameMode;
  teamIds: string[];
  theater: { allowedElements: string[] } | null;
};

export async function readTeams(db: Db = getDb()): Promise<Team[]> {
  const profileId = await getProfileId(db);

  const teams = (await db
    .prepare(`SELECT id, name, mode, position, notes, objective FROM team
              WHERE profile_id = ? ORDER BY position, name`)
    .all(profileId)) as unknown as {
      id: string; name: string; mode: EndgameMode; position: number;
      notes: string | null; objective: string | null;
    }[];

  const slots = (await db
    .prepare(`SELECT team_id, character_id, position, roles_json, declarations_json
              FROM team_slot ORDER BY position`)
    .all()) as unknown as {
      team_id: string; character_id: number; position: number;
      roles_json: string; declarations_json: string;
    }[];

  const byTeam = new Map<string, TeamSlot[]>();
  for (const row of slots) {
    byTeam.set(row.team_id, [...(byTeam.get(row.team_id) ?? []), {
      characterId: row.character_id,
      position: row.position,
      roles: JSON.parse(row.roles_json) as TeamRole[],
      declarations: JSON.parse(row.declarations_json) as Record<string, string>,
    }]);
  }

  return teams.map((team) => ({ ...team, slots: byTeam.get(team.id) ?? [] }));
}

/**
 * The draft: a team being put together that nobody has named yet.
 *
 * A team used to need a name and a mode before it could exist, which put two
 * questions in front of the only one that matters — who is in it. So a new
 * team starts as the draft, with no name, and becomes a team proper when it is
 * saved with one. There is at most one draft; starting another opens it
 * again. It is kept as it is left, and shown as the reserve team until then.
 *
 * An empty name rather than a nullable column, so the schema did not have to
 * change for it: the column is `NOT NULL`, and nothing but the draft is ever
 * saved without one.
 */
export function isDraft(team: Pick<Team, 'name'>) {
  return team.name === '';
}

/** The draft, created if there is none. */
export async function openDraft(db: Db = getDb()): Promise<string> {
  const existing = (await db
    .prepare("SELECT id FROM team WHERE profile_id = ? AND name = '' LIMIT 1")
    .get(await getProfileId(db))) as { id: string } | undefined;

  // The mode stays in the schema for deployments; a team itself is universal.
  return existing?.id ?? createTeam('', 'other', db);
}

/**
 * The list's order, as the player dragged it: `ids` first to last. Ids that
 * are not this profile's are ignored, and teams missing from the list keep
 * their place after the ones in it.
 */
export async function reorderTeams(ids: string[], db: Db = getDb()) {
  const profileId = await getProfileId(db);
  const update = db.prepare('UPDATE team SET position = ? WHERE id = ? AND profile_id = ?');
  await transaction(db, async () => {
    for (const [position, id] of ids.entries()) await update.run(position, id, profileId);
  });
}

export async function nameTeam(teamId: string, name: string, db: Db = getDb()) {
  return (await db
    .prepare('UPDATE team SET name = ? WHERE id = ? AND profile_id = ?')
    .run(name, teamId, await getProfileId(db))).changes;
}

export async function createTeam(
  name: string,
  mode: EndgameMode,
  db: Db = getDb(),
): Promise<string> {
  const profileId = await getProfileId(db);
  const id = randomUUID();

  const next = (await db
    .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS position FROM team WHERE profile_id = ?')
    .get(profileId)) as { position: number };

  await db.prepare('INSERT INTO team (id, profile_id, name, mode, position, notes) VALUES (?,?,?,?,?,NULL)')
    .run(id, profileId, name, mode, next.position);

  return id;
}

export async function deleteTeam(teamId: string, db: Db = getDb()) {
  return (await db
    .prepare('DELETE FROM team WHERE id = ? AND profile_id = ?')
    .run(teamId, await getProfileId(db))).changes;
}

export type SlotResult =
  | { ok: true }
  | { ok: false; reason: 'team-full' | 'already-in-team' | 'no-team' }
  /** Held by another team; `team` names it so the UI can say which. */
  | { ok: false; reason: 'in-another-team'; team: string };

/**
 * Places a character in a team. Four slots, and a character cannot occupy two
 * of them — both enforced by the schema, checked here so the UI gets a reason
 * rather than a constraint error.
 *
 * A character also belongs to one team at a time across the whole profile:
 * planning the same character into two teams plans them twice, and the account
 * only has one of them. Freeing them means removing them from the team that
 * holds them, which is a decision rather than a side effect, so it is refused
 * here instead of being resolved silently.
 */
export async function setSlot(
  teamId: string,
  characterId: number,
  /** One position, positions to try in order, or the first free one. */
  position: number | readonly number[] | null,
  db: Db = getDb(),
): Promise<SlotResult> {
  const profileId = await getProfileId(db);

  return transaction(db, async () => {
    const team = await db
      .prepare('SELECT id FROM team WHERE id = ? AND profile_id = ?')
      .get(teamId, profileId);
    if (!team) return { ok: false, reason: 'no-team' } as const;

    const existing = await db
      .prepare('SELECT position FROM team_slot WHERE team_id = ? AND character_id = ?')
      .get(teamId, characterId);
    if (existing) return { ok: false, reason: 'already-in-team' } as const;

    const elsewhere = (await db
      .prepare(`SELECT t.name FROM team_slot s JOIN team t ON t.id = s.team_id
                WHERE s.character_id = ? AND t.profile_id = ? AND s.team_id <> ?
                LIMIT 1`)
      .get(characterId, profileId, teamId)) as { name: string } | undefined;
    if (elsewhere) {
      return { ok: false, reason: 'in-another-team', team: elsewhere.name } as const;
    }

    const taken = (await db
      .prepare('SELECT position FROM team_slot WHERE team_id = ?')
      .all(teamId)) as unknown as { position: number }[];

    const used = new Set(taken.map((row) => row.position));
    const target = typeof position === 'number'
      ? position
      : (position ?? [0, 1, 2, 3]).find((slot) => !used.has(slot));

    if (target === undefined || target > 3) return { ok: false, reason: 'team-full' } as const;

    await db.prepare(`INSERT INTO team_slot (team_id, character_id, position, roles_json, declarations_json)
                VALUES (?,?,?,'[]','{}')
                ON CONFLICT (team_id, position) DO UPDATE SET character_id = excluded.character_id`)
      .run(teamId, characterId, target);

    return { ok: true } as const;
  });
}

/**
 * Moves a member to another position, swapping with whoever is there.
 *
 * Delete-and-reinsert rather than an `UPDATE`: SQLite checks `UNIQUE
 * (team_id, position)` row by row, so two rows trading places collide halfway
 * through a single statement, and the column's range check leaves no spare
 * position to park one in.
 */
export async function moveSlot(
  teamId: string,
  characterId: number,
  to: number,
  db: Db = getDb(),
) {
  if (!Number.isInteger(to) || to < 0 || to > 3) return false;
  const profileId = await getProfileId(db);

  return transaction(db, async () => {
    const team = await db
      .prepare('SELECT id FROM team WHERE id = ? AND profile_id = ?')
      .get(teamId, profileId);
    if (!team) return false;

    type Row = { character_id: number; position: number; roles_json: string; declarations_json: string };
    const rows = (await db
      .prepare('SELECT character_id, position, roles_json, declarations_json FROM team_slot WHERE team_id = ?')
      .all(teamId)) as unknown as Row[];

    const moving = rows.find((row) => row.character_id === characterId);
    if (!moving || moving.position === to) return false;
    const displaced = rows.find((row) => row.position === to);

    const remove = db.prepare('DELETE FROM team_slot WHERE team_id = ? AND character_id = ?');
    const insert = db.prepare(`INSERT INTO team_slot
        (team_id, character_id, position, roles_json, declarations_json) VALUES (?,?,?,?,?)`);

    await remove.run(teamId, moving.character_id);
    if (displaced) await remove.run(teamId, displaced.character_id);

    await insert.run(teamId, moving.character_id, to, moving.roles_json, moving.declarations_json);
    if (displaced) {
      await insert.run(
        teamId, displaced.character_id, moving.position,
        displaced.roles_json, displaced.declarations_json,
      );
    }
    return true;
  });
}

export async function removeSlot(teamId: string, characterId: number, db: Db = getDb()) {
  return (await db
    .prepare('DELETE FROM team_slot WHERE team_id = ? AND character_id = ?')
    .run(teamId, characterId)).changes;
}

export async function setRoles(
  teamId: string,
  characterId: number,
  roles: TeamRole[],
  db: Db = getDb(),
) {
  return (await db
    .prepare('UPDATE team_slot SET roles_json = ? WHERE team_id = ? AND character_id = ?')
    .run(JSON.stringify(roles), teamId, characterId)).changes;
}

/**
 * Records a fact the engine cannot derive. Passing an empty value clears it,
 * which returns the slot to "unprovable" rather than asserting something false.
 */
export async function setDeclaration(
  teamId: string,
  characterId: number,
  field: string,
  value: string,
  db: Db = getDb(),
) {
  return transaction(db, async () => {
    const row = (await db
      .prepare('SELECT declarations_json FROM team_slot WHERE team_id = ? AND character_id = ?')
      .get(teamId, characterId)) as { declarations_json: string } | undefined;
    if (!row) return 0;

    const declarations = JSON.parse(row.declarations_json) as Record<string, string>;
    if (value === '') delete declarations[field];
    else declarations[field] = value;

    return (await db
      .prepare('UPDATE team_slot SET declarations_json = ? WHERE team_id = ? AND character_id = ?')
      .run(JSON.stringify(declarations), teamId, characterId)).changes;
  });
}

export async function readDeployments(db: Db = getDb()): Promise<Deployment[]> {
  const rows = (await db
    .prepare('SELECT id, name, mode, team_ids_json, theater_json FROM deployment WHERE profile_id = ?')
    .all(await getProfileId(db))) as unknown as {
      id: string; name: string; mode: EndgameMode;
      team_ids_json: string; theater_json: string | null;
    }[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    mode: row.mode,
    teamIds: JSON.parse(row.team_ids_json) as string[],
    theater: row.theater_json
      ? (JSON.parse(row.theater_json) as { allowedElements: string[] })
      : null,
  }));
}

export async function saveDeployment(
  deployment: Omit<Deployment, 'id'> & { id?: string },
  db: Db = getDb(),
) {
  const profileId = await getProfileId(db);
  const id = deployment.id ?? randomUUID();

  await db.prepare(`INSERT INTO deployment (id, profile_id, name, mode, team_ids_json, theater_json)
              VALUES (?,?,?,?,?,?)
              ON CONFLICT (id) DO UPDATE SET
                name = excluded.name, mode = excluded.mode,
                team_ids_json = excluded.team_ids_json, theater_json = excluded.theater_json`)
    .run(
      id, profileId, deployment.name, deployment.mode,
      JSON.stringify(deployment.teamIds),
      deployment.theater ? JSON.stringify(deployment.theater) : null,
    );

  return id;
}

/** Sets or clears what the team is built around. */
export async function setObjective(
  teamId: string,
  objective: string | null,
  db: Db = getDb(),
) {
  return (await db
    .prepare('UPDATE team SET objective = ? WHERE id = ? AND profile_id = ?')
    .run(objective === '' ? null : objective, teamId, await getProfileId(db))).changes;
}
