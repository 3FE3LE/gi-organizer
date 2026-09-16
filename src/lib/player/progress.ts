import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import { ascensionForLevel } from '@/lib/data/stats';
import type { ArtifactSlot } from '@/lib/data/types';

import { readBuild, saveBuild, type Build, type SetPlan, type StatGoal } from './builds';
import { setCharacterTarget } from './characters';
import { getProfileId } from './db';
import { readTargets, setTarget } from './targets';

/**
 * Writes both halves of "where this character is and where they are going".
 *
 * They live in three tables — the roster holds progress, the build holds the
 * target, and `build_target` holds the weapon the scarcity pass reads — but
 * they are one thought to the player. Splitting the write would mean saving a
 * third of the form and silently dropping the rest.
 *
 * Fields the caller does not own are read back rather than blanked: the
 * mechanic and the notes have no control on screen, and pinned sets belong to
 * the suggestion list.
 */

/** The account does not have this character, so there is nothing to plan for. */
export class NotInRoster extends Error {
  readonly characterId: number;

  constructor(characterId: number) {
    super(`character ${characterId} is not in the roster`);
    this.name = 'NotInRoster';
    this.characterId = characterId;
  }
}

export type ProgressInput = {
  characterId: number;
  /** The goal being edited, or `null` to start the character's first one. */
  buildId: string | null;
  /** What the goal is for. Its identity, since a goal has no name. */
  role?: string | null;
  /** Substat priority, where the position is the weight. */
  substats?: string[];
  target: {
    level: number;
    ascended: boolean;
    talents: { auto: number; skill: number; burst: number };
  };
  weaponId: number | null;
  weaponRefinement: number | null;
  /** One set is a four-piece, two are a 2+2. */
  setIds: number[];
  mainStats: Partial<Record<ArtifactSlot, string>>;
  goals: StatGoal[];
};

export async function applyProgress(input: ProgressInput, db: Db = getDb()) {
  const profileId = await getProfileId(db);

  const setPlan: SetPlan[] = input.setIds.length === 1
    ? [{ setIds: [input.setIds[0]], pieces: 4 }]
    : input.setIds.length >= 2
      ? [{ setIds: input.setIds.slice(0, 2), pieces: 2 }]
      : [];

  const mainStats: Partial<Record<ArtifactSlot, string[]>> = {};
  for (const [slot, prop] of Object.entries(input.mainStats)) {
    if (prop) mainStats[slot as ArtifactSlot] = [prop];
  }

  const existing = input.buildId ? await readBuild(input.buildId, db) : null;

  const buildId = await saveBuild({
    id: existing?.id,
    characterId: input.characterId,
    // `undefined` means the caller does not own the field; `null` means they
    // own it and cleared it. Collapsing the two would make a role impossible to
    // remove once set.
    role: (input.role !== undefined ? input.role : existing?.role ?? null) as Build['role'],
    // The mechanic and the notes belong to nobody on screen any more: read
    // back rather than blanked, so an older goal keeps what it was given.
    objective: existing?.objective ?? null,
    weaponId: input.weaponId,
    weaponRefinement: input.weaponRefinement,
    setPlan,
    mainStats,
    substats: input.substats ?? existing?.substats ?? [],
    goals: input.goals,
    notes: existing?.notes ?? null,
  }, db);

  // Levelling is the character's, not the goal's: one character, one ascension.
  //
  // The row it updates is the import's, and there is no longer anything here
  // that would create one: a target for somebody the account does not own is a
  // plan for a character you cannot field, and silently writing nothing would
  // look like a save.
  const targeted = await setCharacterTarget(db, profileId, input.characterId, {
    level: input.target.level,
    ascension: ascensionForLevel(input.target.level, input.target.ascended),
    talents: input.target.talents,
  });

  if (targeted === 0) throw new NotInRoster(input.characterId);

  // Scarcity is planned from `build_target`: four supports pencilled in for one
  // Favonius Lance. The sets on that row used to be a separate "pin" control;
  // the build's own plan says the same thing with more detail, so it is the one
  // that writes them now. Notes on the row belong to nobody here.
  const target = (await readTargets(db)).get(input.characterId);
  await setTarget({
    characterId: input.characterId,
    weaponId: input.weaponId,
    refinement: input.weaponRefinement,
    setIds: setPlan.flatMap((plan) => plan.setIds),
    notes: target?.notes ?? null,
  }, db);

  return buildId;
}
