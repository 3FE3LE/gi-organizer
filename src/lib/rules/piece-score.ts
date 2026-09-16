import type { ArtifactSlot } from '@/lib/data/types';

import { rollsOf } from './rolls';

/**
 * Scores an owned artifact against what a build actually wants.
 *
 * This is the question the inventory is for. A four-piece set needs four
 * pieces, and which four is where a thousand-piece box either helps or does
 * nothing: an off-set goblet with the right main stat and three useful rolls
 * beats an on-set one with none.
 *
 * What a roll is worth lives in `rolls.ts`, which owns the game's own table.
 * This module only decides how much the build cares about each one.
 */

export { rollsOf } from './rolls';

/** Flower and plume have a fixed main stat, so only their substats can differ. */
export const FIXED_MAIN_SLOTS: ArtifactSlot[] = ['flower', 'plume'];

/** Upstream lists the choosable slots in this order. */
export const CHOOSABLE_SLOTS: ArtifactSlot[] = ['sands', 'goblet', 'circlet'];

/**
 * Weight per position in the build's substat priority. The curve is gentle on
 * purpose: a second-choice substat is worth having, not worthless.
 */
const SUBSTAT_WEIGHTS = [1, 0.8, 0.6, 0.45];

/** Anything the build did not ask for still has some value, just not much. */
const UNLISTED_WEIGHT = 0.15;

export type PieceScore = {
  /** Rolls the build asked for, weighted by priority. The headline number. */
  score: number;
  /** Whether the main stat is one the build wants in this slot. */
  mainStatWanted: boolean | null;
  /** Substats that carry weight, best first. */
  matched: { prop: string; rolls: number; weight: number }[];
  wastedRolls: number;
};

export type BuildStats = {
  /** Props the build accepts per choosable slot, in upstream order. */
  mainStatsBySlot: Map<ArtifactSlot, string[]>;
  /** Substat priority, best first. */
  substats: string[];
};

export function scorePiece(
  piece: {
    slot: ArtifactSlot;
    rarity: number;
    level: number;
    mainProp: string;
    substats: { prop: string; value: number }[];
  },
  build: BuildStats,
): PieceScore {
  const wanted = build.mainStatsBySlot.get(piece.slot);

  // Null rather than false for flower and plume: the game chose, so the piece
  // cannot be judged on a decision nobody made.
  const mainStatWanted = FIXED_MAIN_SLOTS.includes(piece.slot)
    ? null
    : wanted === undefined || wanted.length === 0
      ? null
      : wanted.includes(piece.mainProp);

  const matched: PieceScore['matched'] = [];
  let score = 0;
  let wastedRolls = 0;

  for (const substat of piece.substats) {
    const rolls = rollsOf(substat.prop, substat.value, piece.rarity);
    const index = build.substats.indexOf(substat.prop);
    const weight = index === -1
      ? UNLISTED_WEIGHT
      : SUBSTAT_WEIGHTS[Math.min(index, SUBSTAT_WEIGHTS.length - 1)];

    score += rolls * weight;
    if (index === -1) wastedRolls += rolls;
    else matched.push({ prop: substat.prop, rolls, weight });
  }

  matched.sort((a, b) => b.weight - a.weight || b.rolls - a.rolls);

  // A wrong main stat is not a disqualification — the piece is still ranked,
  // just far below one that fits, because a goblet's main stat outweighs any
  // realistic substat spread.
  if (mainStatWanted === false) score *= 0.25;

  return { score, mainStatWanted, matched, wastedRolls };
}

/**
 * Builds the stat expectations for one character. Upstream lists only the three
 * choosable slots, in order.
 */
export function buildStatsFor(
  priority: { mainStats: string[][]; substats: string[] } | undefined,
): BuildStats {
  const mainStatsBySlot = new Map<ArtifactSlot, string[]>();

  CHOOSABLE_SLOTS.forEach((slot, index) => {
    const props = priority?.mainStats[index];
    if (props && props.length > 0) mainStatsBySlot.set(slot, props);
  });

  return { mainStatsBySlot, substats: priority?.substats ?? [] };
}
