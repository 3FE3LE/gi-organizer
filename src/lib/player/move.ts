import type { ArtifactSlot } from '@/lib/data/types';

/**
 * What it means to move a piece of gear — defined once, in a pure function with
 * no server import, so the server and the client's optimistic reducer run the
 * same code.
 *
 * That sharing is the point. A tool that keeps one copy of this rule on the
 * server and another in a client store has two definitions of "equipped", and
 * they drift the moment one of them gains a special case.
 *
 * Equipping is a **move**, never an unassign followed by an assign. There is no
 * pair of operations to interleave, so there is no window in which a piece is
 * on two characters or on none.
 */

export type Assignable = { id: string; equippedTo: number | null };
export type ArtifactAssignment = Assignable & { slot: ArtifactSlot };

/** Only the rows a move can touch, not the whole inventory. */
export type MoveState = {
  artifacts: ArtifactAssignment[];
  weapons: Assignable[];
};

export type Move =
  | { kind: 'equip-artifact'; instanceId: string; toCharacterId: number }
  | { kind: 'unequip-artifact'; instanceId: string }
  | { kind: 'equip-weapon'; instanceId: string; toCharacterId: number }
  | { kind: 'unequip-weapon'; instanceId: string };

export type Displacement =
  /** The piece left this character's slot to make room. */
  | { kind: 'artifact'; instanceId: string; fromCharacterId: number; slot: ArtifactSlot }
  | { kind: 'weapon'; instanceId: string; fromCharacterId: number };

export type MoveOutcome = {
  state: MoveState;
  /** Whoever lost gear so this move could happen. */
  displaced: Displacement[];
  /** The inverse move, which is what makes undo possible. */
  inverse: Move[];
};

export function applyMove(state: MoveState, move: Move): MoveOutcome {
  switch (move.kind) {
    case 'equip-artifact':
      return equipArtifact(state, move.instanceId, move.toCharacterId);
    case 'unequip-artifact':
      return unequipArtifact(state, move.instanceId);
    case 'equip-weapon':
      return equipWeapon(state, move.instanceId, move.toCharacterId);
    case 'unequip-weapon':
      return unequipWeapon(state, move.instanceId);
  }
}

export class UnknownItem extends Error {
  readonly instanceId: string;

  constructor(instanceId: string) {
    super(`no item with id ${instanceId} in this move's state`);
    this.name = 'UnknownItem';
    this.instanceId = instanceId;
  }
}

function equipArtifact(state: MoveState, instanceId: string, toCharacterId: number): MoveOutcome {
  const piece = state.artifacts.find((candidate) => candidate.id === instanceId);
  if (!piece) throw new UnknownItem(instanceId);

  const previousHolder = piece.equippedTo;
  if (previousHolder === toCharacterId) {
    return { state, displaced: [], inverse: [] };
  }

  // Whatever already sits in that slot has to leave; the game allows one.
  const occupant = state.artifacts.find(
    (candidate) =>
      candidate.id !== instanceId &&
      candidate.slot === piece.slot &&
      candidate.equippedTo === toCharacterId,
  );

  const displaced: Displacement[] = [];
  if (occupant) {
    displaced.push({
      kind: 'artifact',
      instanceId: occupant.id,
      fromCharacterId: toCharacterId,
      slot: piece.slot,
    });
  }

  const artifacts = state.artifacts.map((candidate) => {
    if (candidate.id === instanceId) return { ...candidate, equippedTo: toCharacterId };
    if (occupant && candidate.id === occupant.id) return { ...candidate, equippedTo: null };
    return candidate;
  });

  // Undo restores both sides: the piece goes back where it was, and the
  // displaced one returns to the slot it was pushed out of. Order matters —
  // freeing the slot has to come first.
  const inverse: Move[] = [];
  inverse.push(
    previousHolder === null
      ? { kind: 'unequip-artifact', instanceId }
      : { kind: 'equip-artifact', instanceId, toCharacterId: previousHolder },
  );
  if (occupant) {
    inverse.push({
      kind: 'equip-artifact', instanceId: occupant.id, toCharacterId: toCharacterId,
    });
  }

  return { state: { ...state, artifacts }, displaced, inverse };
}

function unequipArtifact(state: MoveState, instanceId: string): MoveOutcome {
  const piece = state.artifacts.find((candidate) => candidate.id === instanceId);
  if (!piece) throw new UnknownItem(instanceId);
  if (piece.equippedTo === null) return { state, displaced: [], inverse: [] };

  const previousHolder = piece.equippedTo;

  return {
    state: {
      ...state,
      artifacts: state.artifacts.map((candidate) =>
        candidate.id === instanceId ? { ...candidate, equippedTo: null } : candidate),
    },
    displaced: [],
    inverse: [{ kind: 'equip-artifact', instanceId, toCharacterId: previousHolder }],
  };
}

function equipWeapon(state: MoveState, instanceId: string, toCharacterId: number): MoveOutcome {
  const weapon = state.weapons.find((candidate) => candidate.id === instanceId);
  if (!weapon) throw new UnknownItem(instanceId);

  const previousHolder = weapon.equippedTo;
  if (previousHolder === toCharacterId) {
    return { state, displaced: [], inverse: [] };
  }

  const occupant = state.weapons.find(
    (candidate) => candidate.id !== instanceId && candidate.equippedTo === toCharacterId,
  );

  const displaced: Displacement[] = occupant
    ? [{ kind: 'weapon', instanceId: occupant.id, fromCharacterId: toCharacterId }]
    : [];

  const weapons = state.weapons.map((candidate) => {
    if (candidate.id === instanceId) return { ...candidate, equippedTo: toCharacterId };
    if (occupant && candidate.id === occupant.id) return { ...candidate, equippedTo: null };
    return candidate;
  });

  const inverse: Move[] = [];
  inverse.push(
    previousHolder === null
      ? { kind: 'unequip-weapon', instanceId }
      : { kind: 'equip-weapon', instanceId, toCharacterId: previousHolder },
  );
  if (occupant) {
    inverse.push({
      kind: 'equip-weapon', instanceId: occupant.id, toCharacterId: toCharacterId,
    });
  }

  return { state: { ...state, weapons }, displaced, inverse };
}

function unequipWeapon(state: MoveState, instanceId: string): MoveOutcome {
  const weapon = state.weapons.find((candidate) => candidate.id === instanceId);
  if (!weapon) throw new UnknownItem(instanceId);
  if (weapon.equippedTo === null) return { state, displaced: [], inverse: [] };

  const previousHolder = weapon.equippedTo;

  return {
    state: {
      ...state,
      weapons: state.weapons.map((candidate) =>
        candidate.id === instanceId ? { ...candidate, equippedTo: null } : candidate),
    },
    displaced: [],
    inverse: [{ kind: 'equip-weapon', instanceId, toCharacterId: previousHolder }],
  };
}
