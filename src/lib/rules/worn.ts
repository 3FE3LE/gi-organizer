import type { ArtifactSlot } from '@/lib/data/types';

import { CHOOSABLE_SLOTS } from './piece-score';
import { ROLLABLE, rollsOf } from './rolls';

/**
 * What the gear already says about the goal.
 *
 * A character nobody has written a goal for is not a character nobody has
 * decided anything about: the pieces they are wearing were chosen, and a form
 * that opens blank asks the player to type back a decision their account
 * already records. So the default goal is read off the box — the set plan, the
 * three main stats, the substats the build actually leans on.
 *
 * It stops where the evidence stops. A character wearing nothing tells us
 * nothing, and guessing for them would put a plan in the planner that nobody
 * chose, which is worse than an empty field. That case returns empty on
 * purpose.
 */

export type WornPiece = {
  setId: number;
  slot: ArtifactSlot;
  rarity: number;
  mainProp: string;
  substats: { prop: string; value: number }[];
};

/**
 * The set plan a character is already wearing.
 *
 * Four of one set is a four-piece plan; two and two is a 2+2; two of one and
 * nothing else is somebody halfway to four of it. Anything below that says
 * nothing, and an empty plan is the honest reading of five unrelated pieces.
 *
 * This is a reading of the box, not a suggestion — the ranking is the thing
 * with an opinion.
 */
export function wornSetPlan(pieces: WornPiece[]): number[] {
  const worn = new Map<number, number>();
  for (const piece of pieces) {
    worn.set(piece.setId, (worn.get(piece.setId) ?? 0) + 1);
  }

  const ranked = [...worn.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) return [];
  if (ranked[0][1] >= 4) return [ranked[0][0]];
  if (ranked.length >= 2) return [ranked[0][0], ranked[1][0]];
  return [ranked[0][0]];
}

/**
 * The main stats the character is already running.
 *
 * Only the three slots where a main stat is a choice: a flower is always HP
 * and a plume is always ATK, so neither says anything about the plan. A slot
 * that is empty stays empty rather than borrowing a guess from the others.
 */
export function wornMainStats(pieces: WornPiece[]): Partial<Record<ArtifactSlot, string>> {
  const chosen: Partial<Record<ArtifactSlot, string>> = {};

  for (const piece of pieces) {
    if (!CHOOSABLE_SLOTS.includes(piece.slot)) continue;
    if (piece.mainProp) chosen[piece.slot] = piece.mainProp;
  }

  return chosen;
}

/**
 * The substats the build leans on, best first.
 *
 * Two readings, in this order. The ascension stat comes first because it is
 * the one thing the character says about themselves: a kit that scales its
 * ascension bonus into Crit DMG is a kit whose gear wants Crit DMG, and that
 * is true before a single piece is equipped.
 *
 * The rest is read off the pieces, ranked by rolls rather than by raw value —
 * 19 Elemental Mastery and 19 flat ATK are not the same amount of anything.
 * That ranking describes what the player has been keeping, which for a
 * character who is already geared is a better statement of intent than any
 * generic template.
 *
 * Nothing worn means nothing to read, and the ascension stat alone is too
 * thin to build a priority out of, so that case is empty.
 */
export function wornSubstats(
  ascensionProp: string,
  pieces: WornPiece[],
  limit = 4,
): string[] {
  if (pieces.length === 0) return [];

  const rolls = new Map<string, number>();
  for (const piece of pieces) {
    for (const substat of piece.substats) {
      if (!ROLLABLE.includes(substat.prop)) continue;
      const weight = rollsOf(substat.prop, substat.value, piece.rarity);
      rolls.set(substat.prop, (rolls.get(substat.prop) ?? 0) + weight);
    }
  }

  const ranked = [...rolls.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([prop]) => prop);

  // The ascension bonus is not always a substat — healing bonus and elemental
  // damage are ascension stats no artifact can roll — and one that is not
  // cannot head a substat priority.
  const head = ROLLABLE.includes(ascensionProp) ? [ascensionProp] : [];

  return [...head, ...ranked.filter((prop) => !head.includes(prop))].slice(0, limit);
}
