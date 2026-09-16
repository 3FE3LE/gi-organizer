import 'server-only';

import type { DatabaseSync } from 'node:sqlite';

import { getDb } from '@/lib/db/client';
import type { ArtifactSlot } from '@/lib/data/types';
import type { NormalizedStat } from '@/lib/inventory/model';

import { getProfileId } from './db';

/**
 * Reads for the build screen.
 *
 * Every one of these filters in SQL. A real inventory is over a thousand pieces
 * and a slot picker needs tens of them, so shipping the collection to the
 * client and filtering there would be the difference between a page that opens
 * and one that does not.
 */

export type GearPiece = {
  id: string;
  setId: number;
  slot: ArtifactSlot;
  rarity: number;
  level: number;
  mainProp: string;
  substats: NormalizedStat[];
  lock: boolean | null;
  equippedTo: number | null;
};

export type GearWeapon = {
  id: string;
  weaponId: number;
  level: number;
  ascension: number;
  refinement: number;
  equippedTo: number | null;
};

type ArtifactRow = {
  id: string; set_id: number; slot: string; rarity: number; level: number;
  main_prop: string; substats_json: string; locked: number | null;
  assigned_character_id: number | null;
};

type WeaponRow = {
  id: string; weapon_id: number; level: number; ascension: number;
  refinement: number; assigned_character_id: number | null;
};

const ARTIFACT_FIELDS = `id, set_id, slot, rarity, level, main_prop, substats_json,
                         locked, assigned_character_id`;
const WEAPON_FIELDS = 'id, weapon_id, level, ascension, refinement, assigned_character_id';

function toPiece(row: ArtifactRow): GearPiece {
  return {
    id: row.id,
    setId: row.set_id,
    slot: row.slot as ArtifactSlot,
    rarity: row.rarity,
    level: row.level,
    mainProp: row.main_prop,
    substats: JSON.parse(row.substats_json) as NormalizedStat[],
    lock: row.locked === null ? null : row.locked === 1,
    equippedTo: row.assigned_character_id,
  };
}

function toWeapon(row: WeaponRow): GearWeapon {
  return {
    id: row.id,
    weaponId: row.weapon_id,
    level: row.level,
    ascension: row.ascension,
    refinement: row.refinement,
    equippedTo: row.assigned_character_id,
  };
}

export function readGear(characterId: number, db: DatabaseSync = getDb()) {
  const profileId = getProfileId(db);

  const artifacts = db
    .prepare(`SELECT ${ARTIFACT_FIELDS} FROM artifact_instance
              WHERE profile_id = ? AND assigned_character_id = ?`)
    .all(profileId, characterId) as unknown as ArtifactRow[];

  const weapon = db
    .prepare(`SELECT ${WEAPON_FIELDS} FROM weapon_instance
              WHERE profile_id = ? AND assigned_character_id = ?`)
    .get(profileId, characterId) as WeaponRow | undefined;

  const bySlot = new Map<ArtifactSlot, GearPiece>();
  for (const row of artifacts) {
    const piece = toPiece(row);
    bySlot.set(piece.slot, piece);
  }

  return { bySlot, weapon: weapon ? toWeapon(weapon) : null };
}

export type CandidateFilter = {
  /** Free pieces only, or also what other characters are already wearing. */
  includeAssigned?: boolean;
  setId?: number;
  mainProp?: string;
  limit?: number;
};

export function artifactCandidates(
  slot: ArtifactSlot,
  filter: CandidateFilter = {},
  db: DatabaseSync = getDb(),
): GearPiece[] {
  const profileId = getProfileId(db);
  const clauses = ['profile_id = ?', 'slot = ?'];
  const values: (string | number)[] = [profileId, slot];

  if (!filter.includeAssigned) clauses.push('assigned_character_id IS NULL');
  if (filter.setId !== undefined) {
    clauses.push('set_id = ?');
    values.push(filter.setId);
  }
  if (filter.mainProp) {
    clauses.push('main_prop = ?');
    values.push(filter.mainProp);
  }

  const rows = db
    .prepare(`SELECT ${ARTIFACT_FIELDS} FROM artifact_instance
              WHERE ${clauses.join(' AND ')}
              ORDER BY rarity DESC, level DESC
              LIMIT ?`)
    .all(...values, filter.limit ?? 60) as unknown as ArtifactRow[];

  return rows.map(toPiece);
}

/**
 * Weapon candidates are restricted to the ids the character can hold — the
 * catalog fact the schema cannot express, so the caller supplies it.
 */
export function weaponCandidates(
  weaponIds: number[],
  filter: CandidateFilter = {},
  db: DatabaseSync = getDb(),
): GearWeapon[] {
  if (weaponIds.length === 0) return [];

  const profileId = getProfileId(db);
  const clauses = ['profile_id = ?', `weapon_id IN (${weaponIds.map(() => '?').join(',')})`];
  const values: (string | number)[] = [profileId, ...weaponIds];

  if (!filter.includeAssigned) clauses.push('assigned_character_id IS NULL');

  const rows = db
    .prepare(`SELECT ${WEAPON_FIELDS} FROM weapon_instance
              WHERE ${clauses.join(' AND ')}
              ORDER BY refinement DESC, level DESC
              LIMIT ?`)
    .all(...values, filter.limit ?? 60) as unknown as WeaponRow[];

  return rows.map(toWeapon);
}

export type EquipPreview = {
  /** Who holds it right now, which is what a confirm compares against. */
  currentHolder: number | null;
  /** Who would lose gear for this to happen. */
  displaces: { instanceId: string; fromCharacterId: number } | null;
  blocked: 'not-found' | null;
};

/**
 * A pure read that answers "what happens if I do this", so the dialog can say
 * *this goblet is on Xiangling — move it?* before anything is written.
 */
export function previewEquipArtifact(
  instanceId: string,
  toCharacterId: number,
  db: DatabaseSync = getDb(),
): EquipPreview {
  const profileId = getProfileId(db);

  const piece = db
    .prepare(`SELECT slot, assigned_character_id FROM artifact_instance
              WHERE id = ? AND profile_id = ?`)
    .get(instanceId, profileId) as
    | { slot: string; assigned_character_id: number | null }
    | undefined;

  if (!piece) return { currentHolder: null, displaces: null, blocked: 'not-found' };

  const occupant = db
    .prepare(`SELECT id FROM artifact_instance
              WHERE profile_id = ? AND assigned_character_id = ? AND slot = ? AND id != ?`)
    .get(profileId, toCharacterId, piece.slot, instanceId) as { id: string } | undefined;

  return {
    currentHolder: piece.assigned_character_id,
    displaces: occupant
      ? { instanceId: occupant.id, fromCharacterId: toCharacterId }
      : null,
    blocked: null,
  };
}

export function previewEquipWeapon(
  instanceId: string,
  toCharacterId: number,
  db: DatabaseSync = getDb(),
): EquipPreview {
  const profileId = getProfileId(db);

  const weapon = db
    .prepare('SELECT assigned_character_id FROM weapon_instance WHERE id = ? AND profile_id = ?')
    .get(instanceId, profileId) as { assigned_character_id: number | null } | undefined;

  if (!weapon) return { currentHolder: null, displaces: null, blocked: 'not-found' };

  const occupant = db
    .prepare(`SELECT id FROM weapon_instance
              WHERE profile_id = ? AND assigned_character_id = ? AND id != ?`)
    .get(profileId, toCharacterId, instanceId) as { id: string } | undefined;

  return {
    currentHolder: weapon.assigned_character_id,
    displaces: occupant
      ? { instanceId: occupant.id, fromCharacterId: toCharacterId }
      : null,
    blocked: null,
  };
}

/** Characters that hold gear, for the roster view. */
export function holdersWithGear(db: DatabaseSync = getDb()) {
  const profileId = getProfileId(db);

  const rows = db
    .prepare(`SELECT assigned_character_id AS id, COUNT(*) AS pieces
              FROM artifact_instance
              WHERE profile_id = ? AND assigned_character_id IS NOT NULL
              GROUP BY assigned_character_id`)
    .all(profileId) as unknown as { id: number; pieces: number }[];

  return new Map(rows.map((row) => [row.id, row.pieces]));
}
