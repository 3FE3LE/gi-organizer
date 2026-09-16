import { findConflicts, type AssignmentConflict, type WeaponTypeLookup } from './assignment';
import { weaponFingerprint } from './fingerprint';
import type { NormalizedArtifact, NormalizedWeapon } from './model';
import type { ImportPlan, Inventory, OwnedArtifact, OwnedWeapon } from './plan';

/**
 * Applies a reviewed plan. Pure: it returns a new inventory and never mutates
 * the one it was given, so a rejected apply leaves nothing half-written.
 *
 * Authority is decided per field, not per source. The most recent observation
 * wins, except where a source is structurally blind: Enka cannot see a lock and
 * GOOD cannot see the constellation talent bonus, and neither may overwrite
 * what it cannot observe.
 */

export type Resolution =
  | { kind: 'merge'; ownedId: string }
  | { kind: 'keep-both' }
  | { kind: 'skip' };

export type Repair = {
  kind: 'weapon-type-mismatch';
  instanceId: string;
  characterId: number;
  weaponType: string;
  characterWeaponType: string;
};

export type ApplyResult = {
  inventory: Inventory;
  /**
   * Assignments the import claimed that the game cannot hold, dropped rather
   * than obeyed. The item is kept; only its holder is discarded.
   */
  repairs: Repair[];
};

export type ApplyOptions = {
  /** Only honored for a `full` import, and only when the user confirmed it. */
  onAbsent?: 'keep' | 'remove';
  /** Answers for the plan's ambiguous verdicts, keyed by verdict index. */
  resolutions?: Map<number, Resolution>;
  newId?: () => string;
  types?: WeaponTypeLookup;
};

export class AssignmentViolation extends Error {
  // A plain field rather than a parameter property: Node's type stripping does
  // not support those, and the pure layer has to run under `node --test`.
  readonly conflicts: AssignmentConflict[];

  constructor(conflicts: AssignmentConflict[]) {
    super(`import would violate exclusivity: ${conflicts.length} conflict(s)`);
    this.name = 'AssignmentViolation';
    this.conflicts = conflicts;
  }
}

export function applyImport(
  inventory: Inventory,
  plan: ImportPlan,
  options: ApplyOptions = {},
): ApplyResult {
  const newId = options.newId ?? (() => crypto.randomUUID());
  const resolutions = options.resolutions ?? new Map<number, Resolution>();
  const onAbsent = options.onAbsent ?? 'keep';

  const artifacts = new Map(inventory.artifacts.map((piece) => [piece.id, piece]));

  plan.artifacts.verdicts.forEach((verdict, index) => {
    switch (verdict.kind) {
      case 'unchanged':
      case 'upgraded': {
        const owned = artifacts.get(verdict.ownedId);
        if (owned) artifacts.set(owned.id, mergeArtifact(owned, verdict.incoming, plan));
        break;
      }
      case 'added': {
        const id = newId();
        artifacts.set(id, adoptArtifact(verdict.incoming, plan, id));
        break;
      }
      case 'ambiguous': {
        const resolution = resolutions.get(index);
        if (!resolution || resolution.kind === 'skip') break;

        if (resolution.kind === 'keep-both') {
          const id = newId();
          artifacts.set(id, adoptArtifact(verdict.incoming, plan, id));
          break;
        }

        const owned = artifacts.get(resolution.ownedId);
        if (owned) artifacts.set(owned.id, mergeArtifact(owned, verdict.incoming, plan));
        break;
      }
    }
  });

  if (onAbsent === 'remove' && plan.coverage === 'full') {
    for (const id of plan.artifacts.absentIds) artifacts.delete(id);
  }

  const weapons = applyWeapons(inventory.weapons, plan, newId, onAbsent);

  let next: Inventory = { artifacts: [...artifacts.values()], weapons };

  // A weapon on a character that cannot hold it is bad input, not a broken
  // invariant. A real scan produces these — a misread `location` puts a quest
  // sword on a catalyst user — and losing the weapon, or the other 1442 items
  // with it, would be a far worse outcome than losing one assignment. So the
  // assignment is dropped and reported, and the item is kept.
  const repairs: Repair[] = [];
  for (const conflict of findConflicts(next, options.types)) {
    if (conflict.kind !== 'weapon-type-mismatch') continue;
    repairs.push({
      kind: conflict.kind,
      instanceId: conflict.instanceId,
      characterId: conflict.characterId,
      weaponType: conflict.weaponType,
      characterWeaponType: conflict.characterWeaponType,
    });
  }

  if (repairs.length > 0) {
    const repaired = new Set(repairs.map((repair) => repair.instanceId));
    next = {
      ...next,
      weapons: next.weapons.map((weapon) =>
        repaired.has(weapon.id) ? { ...weapon, equippedTo: null } : weapon),
    };
  }

  // What remains is exclusivity, and that one does refuse: better no import at
  // all than an inventory claiming one piece is on two characters, because the
  // plan's only value is being true.
  const conflicts = findConflicts(next, options.types);
  if (conflicts.length > 0) throw new AssignmentViolation(conflicts);

  return { inventory: next, repairs };
}

function adoptArtifact(
  incoming: NormalizedArtifact,
  plan: ImportPlan,
  id: string,
): OwnedArtifact {
  return { ...incoming, id, source: plan.source, seenAt: plan.observedAt };
}

function mergeArtifact(
  owned: OwnedArtifact,
  incoming: NormalizedArtifact,
  plan: ImportPlan,
): OwnedArtifact {
  return {
    ...owned,
    ...incoming,
    id: owned.id,
    source: plan.source,
    seenAt: plan.observedAt,
    // A source that cannot see locks must not report them as absent.
    lock: incoming.lock ?? owned.lock,
    // Enka observes roll order; GOOD does not, and losing it would weaken
    // every future match.
    rollHistory: incoming.rollHistory ?? owned.rollHistory,
    // Only a source that saw the whole inventory can say a piece was unequipped.
    equippedTo: plan.coverage === 'full' ? incoming.equippedTo : incoming.equippedTo ?? owned.equippedTo,
  };
}

function applyWeapons(
  owned: OwnedWeapon[],
  plan: ImportPlan,
  newId: () => string,
  onAbsent: 'keep' | 'remove',
) {
  const removed = new Set<string>();
  const added: OwnedWeapon[] = [];

  for (const verdict of plan.weapons.verdicts) {
    if (verdict.kind === 'added') {
      for (let i = 0; i < verdict.count; i += 1) {
        added.push(adoptWeapon(verdict.incoming, plan, newId()));
      }
    } else if (verdict.kind === 'absent' && onAbsent === 'remove' && plan.coverage === 'full') {
      for (const id of verdict.ownedIds) removed.add(id);
    }
  }

  const survivors = owned.filter((weapon) => !removed.has(weapon.id));
  const result = [...survivors, ...added];

  if (plan.coverage !== 'full') return result;

  // A weapon that simply changed hands produces no verdict, because the counts
  // did not move. So a full import re-derives every holder from the file: per
  // fingerprint, the observed assignments are handed to the copies. Copies at
  // one refinement are interchangeable, which is what makes that sound.
  const observed = new Map<string, (number | null)[]>();
  for (const weapon of plan.weapons.incoming) {
    const fingerprint = weaponFingerprint(weapon);
    observed.set(fingerprint, [...(observed.get(fingerprint) ?? []), weapon.equippedTo]);
  }

  const holderById = new Map<string, number | null>();
  const byFingerprint = new Map<string, OwnedWeapon[]>();
  for (const weapon of result) {
    const fingerprint = weaponFingerprint(weapon);
    byFingerprint.set(fingerprint, [...(byFingerprint.get(fingerprint) ?? []), weapon]);
  }

  for (const [fingerprint, copies] of byFingerprint) {
    // Claim in two passes. A copy whose current holder the file still reports
    // keeps it, and only what is left over gets handed out — otherwise an
    // identical re-import would shuffle interchangeable copies between
    // characters, which reads as a change the user did not make.
    const pool = [...(observed.get(fingerprint) ?? [])];
    const unclaimed: OwnedWeapon[] = [];

    for (const weapon of copies) {
      const index = weapon.equippedTo === null ? -1 : pool.indexOf(weapon.equippedTo);
      if (index === -1) unclaimed.push(weapon);
      else {
        pool.splice(index, 1);
        holderById.set(weapon.id, weapon.equippedTo);
      }
    }

    for (const weapon of unclaimed) {
      holderById.set(weapon.id, pool.shift() ?? null);
    }
  }

  return result.map((weapon) => ({
    ...weapon,
    equippedTo: holderById.get(weapon.id) ?? null,
  }));
}

function adoptWeapon(
  incoming: NormalizedWeapon,
  plan: ImportPlan,
  id: string,
): OwnedWeapon {
  return { ...incoming, id, source: plan.source, seenAt: plan.observedAt };
}
