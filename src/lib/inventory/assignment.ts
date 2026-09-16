import type { ArtifactSlot } from '@/lib/data/types';

import type { OwnedArtifact, OwnedWeapon } from './plan';

/**
 * The exclusivity invariant, checked over a whole inventory.
 *
 * In the database this is a column and two partial unique indexes, so it cannot
 * be violated there. This module is the same rule stated in the pure layer, so
 * an import can be rejected before it reaches a transaction that would only
 * fail with a constraint error.
 */

export type AssignmentConflict =
  /** Two pieces claim one character's slot. Impossible in game. */
  | {
      kind: 'slot-occupied';
      characterId: number;
      slot: ArtifactSlot;
      instanceIds: string[];
    }
  /** Two weapons on one character. */
  | { kind: 'weapon-occupied'; characterId: number; instanceIds: string[] }
  /** A weapon a character cannot hold. */
  | {
      kind: 'weapon-type-mismatch';
      characterId: number;
      instanceId: string;
      weaponType: string;
      characterWeaponType: string;
    };

/**
 * The Traveler's elemental forms share one body, so they cannot each wear the
 * flower. Every id already maps to a body, but naming the function keeps the
 * intent visible where it matters.
 */
export const bodyOf = (characterId: number) => characterId;

export type WeaponTypeLookup = {
  ofWeapon: (weaponId: number) => string | undefined;
  ofCharacter: (characterId: number) => string | undefined;
};

export function findConflicts(
  inventory: { artifacts: OwnedArtifact[]; weapons: OwnedWeapon[] },
  types?: WeaponTypeLookup,
): AssignmentConflict[] {
  const conflicts: AssignmentConflict[] = [];

  const bySlot = new Map<string, string[]>();
  for (const piece of inventory.artifacts) {
    if (piece.equippedTo === null) continue;
    const key = `${bodyOf(piece.equippedTo)}|${piece.slot}`;
    bySlot.set(key, [...(bySlot.get(key) ?? []), piece.id]);
  }

  for (const [key, instanceIds] of bySlot) {
    if (instanceIds.length < 2) continue;
    const [characterId, slot] = key.split('|');
    conflicts.push({
      kind: 'slot-occupied',
      characterId: Number(characterId),
      slot: slot as ArtifactSlot,
      instanceIds,
    });
  }

  const byHolder = new Map<number, string[]>();
  for (const weapon of inventory.weapons) {
    if (weapon.equippedTo === null) continue;
    const holder = bodyOf(weapon.equippedTo);
    byHolder.set(holder, [...(byHolder.get(holder) ?? []), weapon.id]);
  }

  for (const [characterId, instanceIds] of byHolder) {
    if (instanceIds.length > 1) {
      conflicts.push({ kind: 'weapon-occupied', characterId, instanceIds });
    }
  }

  // Needs the catalog, so it lives here rather than in the schema.
  if (types) {
    for (const weapon of inventory.weapons) {
      if (weapon.equippedTo === null) continue;

      const weaponType = types.ofWeapon(weapon.weaponId);
      const characterWeaponType = types.ofCharacter(weapon.equippedTo);
      if (!weaponType || !characterWeaponType || weaponType === characterWeaponType) continue;

      conflicts.push({
        kind: 'weapon-type-mismatch',
        characterId: weapon.equippedTo,
        instanceId: weapon.id,
        weaponType,
        characterWeaponType,
      });
    }
  }

  return conflicts;
}
