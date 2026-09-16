import 'server-only';

import { randomUUID } from 'node:crypto';

import { getDb, type Db } from '@/lib/db/client';
import { transaction } from '@/lib/db/tx';
import type { ArtifactSlot } from '@/lib/data/types';

import { getProfileId } from './db';
import {
  type ArtifactAssignment,
  type Assignable,
  type Displacement,
  type Move,
  type MoveState,
  applyMove,
} from './move';

/**
 * The transactional move.
 *
 * There is no public `unassign` + `assign` pair, only `equip(to)` and
 * `unequip()`. Two writes that cannot be issued separately cannot interleave,
 * so the invariant has no window to be violated in — and the schema would
 * refuse anyway, which is the point of keeping it there.
 */

export type MoveFailure =
  | { ok: false; reason: 'not-found' }
  /** The holder changed between the preview and the confirm. */
  | { ok: false; reason: 'conflict'; actualHolderId: number | null }
  | { ok: false; reason: 'wrong-weapon-type'; weaponType: string; characterWeaponType: string }
  | { ok: false; reason: 'locked' };

export type MoveSuccess = {
  ok: true;
  displaced: Displacement[];
  /** The change-log row this move produced, for undo. */
  seq: number;
};

export type MoveResult = MoveSuccess | MoveFailure;

export type MoveOptions = {
  /**
   * The holder the UI showed the user. Compare-and-set closes the window
   * between opening the confirm dialog and clicking it.
   */
  expectedHolderId?: number | null;
  /** Supplies the catalog fact the schema cannot hold. */
  weaponTypes?: {
    ofWeapon: (weaponId: number) => string | undefined;
    ofCharacter: (characterId: number) => string | undefined;
  };
  /** Labels the change-log entry; the history page resolves ids at render. */
  label?: string;
  /**
   * Set false when a move is replaying someone else's entry — an undo or a
   * redo. A replay must not append to the log, and above all must not clear the
   * redo stack it is walking.
   */
  log?: boolean;
};

export async function performMove(
  move: Move,
  options: MoveOptions = {},
  db: Db = getDb(),
): Promise<MoveResult> {
  const profileId = await getProfileId(db);

  return transaction(db, async () => {
    const context = await loadContext(db, profileId, move);
    if (!context) return { ok: false, reason: 'not-found' } as const;

    if (options.expectedHolderId !== undefined) {
      const actual = context.subject.equippedTo;
      if (actual !== options.expectedHolderId) {
        return { ok: false, reason: 'conflict', actualHolderId: actual } as const;
      }
    }

    if (move.kind === 'equip-weapon' && options.weaponTypes) {
      const weaponType = options.weaponTypes.ofWeapon(context.weaponId!);
      const characterWeaponType = options.weaponTypes.ofCharacter(move.toCharacterId);
      if (weaponType && characterWeaponType && weaponType !== characterWeaponType) {
        return {
          ok: false, reason: 'wrong-weapon-type', weaponType, characterWeaponType,
        } as const;
      }
    }

    const outcome = applyMove(context.state, move);

    // Free every slot that is losing its occupant before filling any, or the
    // partial unique indexes reject the intermediate state.
    for (const displacement of outcome.displaced) {
      await release(db, profileId, displacement.kind, displacement.instanceId);
    }

    await writeAssignments(db, profileId, context.state, outcome.state);

    // The inverse is written inside the same transaction as the change it
    // reverses. Written separately it could be lost, and an undo stack that
    // sometimes cannot undo is worse than none.
    const seq = options.log === false
      ? 0
      : await logChange(db, profileId, move, outcome.inverse, options.label);

    return { ok: true, displaced: outcome.displaced, seq } as const;
  });
}

type Context = {
  state: MoveState;
  subject: Assignable;
  weaponId?: number;
};

/**
 * Loads only the rows a move can touch: the item itself and whatever currently
 * occupies the destination. Loading the whole inventory to move one goblet
 * would be a thousand rows of waste per drag.
 */
async function loadContext(db: Db, profileId: string, move: Move): Promise<Context | null> {
  if (move.kind === 'equip-artifact' || move.kind === 'unequip-artifact') {
    const piece = (await db
      .prepare(`SELECT id, slot, assigned_character_id FROM artifact_instance
                WHERE id = ? AND profile_id = ?`)
      .get(move.instanceId, profileId)) as
      | { id: string; slot: string; assigned_character_id: number | null }
      | undefined;

    if (!piece) return null;

    const subject: ArtifactAssignment = {
      id: piece.id,
      slot: piece.slot as ArtifactSlot,
      equippedTo: piece.assigned_character_id,
    };

    const artifacts = [subject];

    if (move.kind === 'equip-artifact') {
      const occupant = (await db
        .prepare(`SELECT id, slot, assigned_character_id FROM artifact_instance
                  WHERE profile_id = ? AND assigned_character_id = ? AND slot = ? AND id != ?`)
        .get(profileId, move.toCharacterId, piece.slot, piece.id)) as
        | { id: string; slot: string; assigned_character_id: number | null }
        | undefined;

      if (occupant) {
        artifacts.push({
          id: occupant.id,
          slot: occupant.slot as ArtifactSlot,
          equippedTo: occupant.assigned_character_id,
        });
      }
    }

    return { state: { artifacts, weapons: [] }, subject };
  }

  const weapon = (await db
    .prepare(`SELECT id, weapon_id, assigned_character_id FROM weapon_instance
              WHERE id = ? AND profile_id = ?`)
    .get(move.instanceId, profileId)) as
    | { id: string; weapon_id: number; assigned_character_id: number | null }
    | undefined;

  if (!weapon) return null;

  const subject: Assignable = { id: weapon.id, equippedTo: weapon.assigned_character_id };
  const weapons = [subject];

  if (move.kind === 'equip-weapon') {
    const occupant = (await db
      .prepare(`SELECT id, assigned_character_id FROM weapon_instance
                WHERE profile_id = ? AND assigned_character_id = ? AND id != ?`)
      .get(profileId, move.toCharacterId, weapon.id)) as
      | { id: string; assigned_character_id: number | null }
      | undefined;

    if (occupant) {
      weapons.push({ id: occupant.id, equippedTo: occupant.assigned_character_id });
    }
  }

  return { state: { artifacts: [], weapons }, subject, weaponId: weapon.weapon_id };
}

async function release(
  db: Db,
  profileId: string,
  kind: 'artifact' | 'weapon',
  instanceId: string,
) {
  const table = kind === 'artifact' ? 'artifact_instance' : 'weapon_instance';
  await db.prepare(`UPDATE ${table} SET assigned_character_id = NULL WHERE id = ? AND profile_id = ?`)
    .run(instanceId, profileId);
}

async function writeAssignments(
  db: Db,
  profileId: string,
  before: MoveState,
  after: MoveState,
) {
  const setArtifact = db.prepare(
    'UPDATE artifact_instance SET assigned_character_id = ? WHERE id = ? AND profile_id = ?',
  );
  const setWeapon = db.prepare(
    'UPDATE weapon_instance SET assigned_character_id = ? WHERE id = ? AND profile_id = ?',
  );

  const previousArtifacts = new Map(before.artifacts.map((piece) => [piece.id, piece.equippedTo]));
  for (const piece of after.artifacts) {
    if (previousArtifacts.get(piece.id) !== piece.equippedTo) {
      await setArtifact.run(piece.equippedTo, piece.id, profileId);
    }
  }

  const previousWeapons = new Map(before.weapons.map((weapon) => [weapon.id, weapon.equippedTo]));
  for (const weapon of after.weapons) {
    if (previousWeapons.get(weapon.id) !== weapon.equippedTo) {
      await setWeapon.run(weapon.equippedTo, weapon.id, profileId);
    }
  }
}

async function logChange(
  db: Db,
  profileId: string,
  move: Move,
  inverse: Move[],
  label?: string,
) {
  // A forward move discards the redo stack, the way every editor behaves.
  await db.prepare('DELETE FROM change_log WHERE profile_id = ? AND undone_at IS NOT NULL')
    .run(profileId);

  const result = await db
    .prepare(`INSERT INTO change_log (profile_id, at, op, summary_json, inverse_json)
              VALUES (?,?,?,?,?)`)
    .run(
      profileId,
      new Date().toISOString(),
      move.kind,
      // Ids only. The history page resolves them through the catalog at render
      // time, so it is localized for free and never rots when names change.
      JSON.stringify({ move, label: label ?? null }),
      JSON.stringify(inverse),
    );

  return Number(result.lastInsertRowid);
}

/** A fresh id for a manually created row, kept here so callers share one source. */
export const newInstanceId = () => randomUUID();
