import 'server-only';

import type { DatabaseSync } from 'node:sqlite';

import { getDb } from '@/lib/db/client';
import type { ArtifactSlot } from '@/lib/data/types';
import type { ImportSource, NormalizedStat } from '@/lib/inventory/model';
import type { Inventory, OwnedArtifact, OwnedWeapon } from '@/lib/inventory/plan';

/**
 * Bridges the pure inventory shape to SQLite.
 *
 * Reads are ordered by id so an export is byte-stable: two backups of the same
 * state diff to nothing, which is the only way a diff between them means
 * anything.
 *
 * `planImport` and `applyImport` stay pure and stay the only definition of what
 * a merge means; this module loads rows into that shape and writes back only
 * what changed. One definition, two callers — which is the whole reason the
 * merge logic lives outside the database in the first place.
 */

const PROFILE_ID = 'local';

/** One profile today. The column exists so sharing is a lookup, not a migration. */
export function getProfileId(db: DatabaseSync = getDb()) {
  const existing = db.prepare('SELECT id FROM profile WHERE id = ?').get(PROFILE_ID);
  if (!existing) {
    db.prepare('INSERT INTO profile (id, name, created_at) VALUES (?, ?, ?)')
      .run(PROFILE_ID, 'local', new Date().toISOString());
  }
  return PROFILE_ID;
}

type ArtifactRow = {
  id: string;
  set_id: number;
  slot: string;
  rarity: number;
  level: number;
  main_prop: string;
  substats_json: string;
  unactivated_json: string | null;
  roll_history_json: string | null;
  locked: number | null;
  source: string;
  assigned_character_id: number | null;
  seen_at: string;
};

type WeaponRow = {
  id: string;
  weapon_id: number;
  level: number;
  ascension: number;
  refinement: number;
  locked: number | null;
  source: string;
  assigned_character_id: number | null;
  seen_at: string;
};

export function readInventory(db: DatabaseSync, profileId: string): Inventory {
  const artifacts = db
    .prepare(`SELECT id, set_id, slot, rarity, level, main_prop, substats_json,
                     unactivated_json, roll_history_json, locked, source,
                     assigned_character_id, seen_at
              FROM artifact_instance WHERE profile_id = ?
              ORDER BY id`)
    .all(profileId) as unknown as ArtifactRow[];

  const weapons = db
    .prepare(`SELECT id, weapon_id, level, ascension, refinement, locked, source,
                     assigned_character_id, seen_at
              FROM weapon_instance WHERE profile_id = ?
              ORDER BY id`)
    .all(profileId) as unknown as WeaponRow[];

  return {
    artifacts: artifacts.map(toArtifact),
    weapons: weapons.map(toWeapon),
  };
}

function toArtifact(row: ArtifactRow): OwnedArtifact {
  return {
    id: row.id,
    setId: row.set_id,
    slot: row.slot as ArtifactSlot,
    rarity: row.rarity,
    level: row.level,
    mainProp: row.main_prop,
    substats: JSON.parse(row.substats_json) as NormalizedStat[],
    unactivatedSubstats: row.unactivated_json
      ? (JSON.parse(row.unactivated_json) as NormalizedStat[])
      : [],
    rollHistory: row.roll_history_json
      ? (JSON.parse(row.roll_history_json) as number[])
      : null,
    // SQLite has no boolean, and null still means "no source has seen it".
    lock: row.locked === null ? null : row.locked === 1,
    source: row.source as ImportSource,
    equippedTo: row.assigned_character_id,
    seenAt: row.seen_at,
  };
}

function toWeapon(row: WeaponRow): OwnedWeapon {
  return {
    id: row.id,
    weaponId: row.weapon_id,
    level: row.level,
    ascension: row.ascension,
    refinement: row.refinement,
    lock: row.locked === null ? null : row.locked === 1,
    source: row.source as ImportSource,
    equippedTo: row.assigned_character_id,
    seenAt: row.seen_at,
  };
}

export type PersistCounts = {
  artifacts: { inserted: number; updated: number; deleted: number };
  weapons: { inserted: number; updated: number; deleted: number };
};

/**
 * Writes the difference between two inventories.
 *
 * Diffing by id rather than rewriting every row keeps a re-import of an
 * unchanged file to zero writes, which is what makes idempotence observable in
 * the database and not only in the planner.
 */
export function persistInventory(
  db: DatabaseSync,
  profileId: string,
  before: Inventory,
  after: Inventory,
): PersistCounts {
  const counts: PersistCounts = {
    artifacts: { inserted: 0, updated: 0, deleted: 0 },
    weapons: { inserted: 0, updated: 0, deleted: 0 },
  };

  const insertArtifact = db.prepare(`
    INSERT INTO artifact_instance
      (id, profile_id, set_id, slot, rarity, level, main_prop, substats_json,
       unactivated_json, roll_history_json, locked, fingerprint, source,
       assigned_character_id, seen_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);

  const updateArtifact = db.prepare(`
    UPDATE artifact_instance SET
      set_id = ?, slot = ?, rarity = ?, level = ?, main_prop = ?, substats_json = ?,
      unactivated_json = ?, roll_history_json = ?, locked = ?, fingerprint = ?,
      source = ?, assigned_character_id = ?, seen_at = ?
    WHERE id = ? AND profile_id = ?`);

  const deleteArtifact = db.prepare(
    'DELETE FROM artifact_instance WHERE id = ? AND profile_id = ?',
  );

  const beforeArtifacts = new Map(before.artifacts.map((piece) => [piece.id, piece]));
  const now = new Date().toISOString();

  // The partial unique indexes are checked per statement, so moving an
  // assignment between two rows collides halfway through: for a moment both
  // claim the same holder. Releasing every changed assignment first keeps the
  // transaction's intermediate state legal without weakening the constraint.
  releaseChangedAssignments(db, profileId, before, after);

  for (const piece of after.artifacts) {
    const previous = beforeArtifacts.get(piece.id);
    const row = artifactValues(piece);

    if (!previous) {
      insertArtifact.run(piece.id, profileId, ...row, now);
      counts.artifacts.inserted += 1;
    } else if (!sameArtifact(previous, piece)) {
      updateArtifact.run(...row, piece.id, profileId);
      counts.artifacts.updated += 1;
    }
    beforeArtifacts.delete(piece.id);
  }

  for (const id of beforeArtifacts.keys()) {
    deleteArtifact.run(id, profileId);
    counts.artifacts.deleted += 1;
  }

  const insertWeapon = db.prepare(`
    INSERT INTO weapon_instance
      (id, profile_id, weapon_id, level, ascension, refinement, locked,
       fingerprint, source, assigned_character_id, seen_at, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);

  const updateWeapon = db.prepare(`
    UPDATE weapon_instance SET
      weapon_id = ?, level = ?, ascension = ?, refinement = ?, locked = ?,
      fingerprint = ?, source = ?, assigned_character_id = ?, seen_at = ?
    WHERE id = ? AND profile_id = ?`);

  const deleteWeapon = db.prepare(
    'DELETE FROM weapon_instance WHERE id = ? AND profile_id = ?',
  );

  const beforeWeapons = new Map(before.weapons.map((weapon) => [weapon.id, weapon]));

  for (const weapon of after.weapons) {
    const previous = beforeWeapons.get(weapon.id);
    const row = weaponValues(weapon);

    if (!previous) {
      insertWeapon.run(weapon.id, profileId, ...row, now);
      counts.weapons.inserted += 1;
    } else if (!sameWeapon(previous, weapon)) {
      updateWeapon.run(...row, weapon.id, profileId);
      counts.weapons.updated += 1;
    }
    beforeWeapons.delete(weapon.id);
  }

  for (const id of beforeWeapons.keys()) {
    deleteWeapon.run(id, profileId);
    counts.weapons.deleted += 1;
  }

  return counts;
}

/**
 * Nulls out `assigned_character_id` on every row whose holder is about to
 * change, so the write pass never has two rows claiming one slot.
 */
function releaseChangedAssignments(
  db: DatabaseSync,
  profileId: string,
  before: Inventory,
  after: Inventory,
) {
  const releaseArtifact = db.prepare(
    'UPDATE artifact_instance SET assigned_character_id = NULL WHERE id = ? AND profile_id = ?',
  );
  const releaseWeapon = db.prepare(
    'UPDATE weapon_instance SET assigned_character_id = NULL WHERE id = ? AND profile_id = ?',
  );

  const afterArtifacts = new Map(after.artifacts.map((piece) => [piece.id, piece]));
  for (const piece of before.artifacts) {
    const next = afterArtifacts.get(piece.id);
    if (piece.equippedTo !== null && next?.equippedTo !== piece.equippedTo) {
      releaseArtifact.run(piece.id, profileId);
    }
  }

  const afterWeapons = new Map(after.weapons.map((weapon) => [weapon.id, weapon]));
  for (const weapon of before.weapons) {
    const next = afterWeapons.get(weapon.id);
    if (weapon.equippedTo !== null && next?.equippedTo !== weapon.equippedTo) {
      releaseWeapon.run(weapon.id, profileId);
    }
  }
}

function artifactValues(piece: OwnedArtifact) {
  return [
    piece.setId,
    piece.slot,
    piece.rarity,
    piece.level,
    piece.mainProp,
    JSON.stringify(piece.substats),
    JSON.stringify(piece.unactivatedSubstats),
    piece.rollHistory ? JSON.stringify(piece.rollHistory) : null,
    piece.lock === null ? null : Number(piece.lock),
    fingerprintOf(piece),
    piece.source,
    piece.equippedTo,
    piece.seenAt,
  ] as const;
}

function weaponValues(weapon: OwnedWeapon) {
  return [
    weapon.weaponId,
    weapon.level,
    weapon.ascension,
    weapon.refinement,
    weapon.lock === null ? null : Number(weapon.lock),
    `w1|${weapon.weaponId}|R${weapon.refinement}`,
    weapon.source,
    weapon.equippedTo,
    weapon.seenAt,
  ] as const;
}

function fingerprintOf(piece: OwnedArtifact) {
  // Stored so a future query can bucket by it without parsing every row.
  return `a1|${piece.setId}|${piece.slot}|${piece.rarity}|${piece.mainProp}|${piece.level}`;
}

function sameArtifact(a: OwnedArtifact, b: OwnedArtifact) {
  return (
    a.level === b.level &&
    a.equippedTo === b.equippedTo &&
    a.lock === b.lock &&
    a.setId === b.setId &&
    a.slot === b.slot &&
    a.mainProp === b.mainProp &&
    JSON.stringify(a.substats) === JSON.stringify(b.substats) &&
    JSON.stringify(a.unactivatedSubstats) === JSON.stringify(b.unactivatedSubstats) &&
    JSON.stringify(a.rollHistory) === JSON.stringify(b.rollHistory)
  );
}

function sameWeapon(a: OwnedWeapon, b: OwnedWeapon) {
  return (
    a.weaponId === b.weaponId &&
    a.level === b.level &&
    a.ascension === b.ascension &&
    a.refinement === b.refinement &&
    a.lock === b.lock &&
    a.equippedTo === b.equippedTo
  );
}

export type MaterialStock = Map<number, number>;

export function readMaterialStock(db: DatabaseSync, profileId: string): MaterialStock {
  const rows = db
    .prepare('SELECT material_id, count FROM material_stock WHERE profile_id = ?')
    .all(profileId) as unknown as { material_id: number; count: number }[];

  return new Map(rows.map((row) => [row.material_id, row.count]));
}

/**
 * Replaces the counts a source reported.
 *
 * Only what the file mentions: a scan that skipped the bag reports nothing, and
 * nothing must not read as zero of everything.
 */
export function persistMaterialStock(
  db: DatabaseSync,
  profileId: string,
  materials: { materialId: number; count: number }[],
  seenAt: string,
) {
  if (materials.length === 0) return 0;

  const upsert = db.prepare(`INSERT INTO material_stock (profile_id, material_id, count, seen_at)
    VALUES (?,?,?,?)
    ON CONFLICT (profile_id, material_id) DO UPDATE SET
      count = excluded.count, seen_at = excluded.seen_at`);

  for (const material of materials) {
    upsert.run(profileId, material.materialId, material.count, seenAt);
  }

  return materials.length;
}
