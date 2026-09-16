import type { ArtifactSlot } from '@/lib/data/types';

import { type BuildStats, scorePiece, type PieceScore } from './piece-score';
import { MEAN_TIER, ROLLABLE, rollsOf, TIER_FRACTIONS } from './rolls';
import { computeStats, evaluateGoals, type GoalVerdict, type StatInput } from './stats';

/**
 * What to change next, and what changing it buys.
 *
 * Every comparison here is against a build — character, role, target stats — so
 * the answer to "is this artifact good" is always "for what". The same circlet
 * is mediocre for one build and excellent for another, and a comparison that
 * cannot say which is not worth showing.
 *
 * Three kinds of opportunity, and only the first is obvious:
 *
 *   - an **upgrade** is better now and stays better;
 *   - a **prospect** is behind today, yet its substats point at the build's
 *     goals, so levelling it overtakes what is equipped — a +0 piece with three
 *     wanted rolls beats a +20 with one, and no amount of staring at current
 *     values will show that;
 *   - a **stopgap** is better now and worse later, which is what a levelled
 *     off-set piece is next to the raw on-set one already in the slot. Worth
 *     wearing today, worth abandoning once the other is fed.
 */

/** Upgrades land every four levels. */
const LEVELS_PER_ROLL = 4;
const MAX_LEVEL: Record<number, number> = { 5: 20, 4: 16, 3: 12 };

/**
 * The smallest change worth a row.
 *
 * The lists print one decimal, so anything under half of that is a swap whose
 * own display says `+0.0`. Showing it is worse than not: it reads as an
 * opportunity and buys nothing.
 */
const MEANINGFUL = 0.05;

export type ComparablePiece = {
  instanceId: string;
  setId: number;
  slot: ArtifactSlot;
  rarity: number;
  level: number;
  mainProp: string;
  substats: { prop: string; value: number }[];
};

/** Weight the build puts on a substat, mirroring `scorePiece`. */
function weightOf(prop: string, build: BuildStats) {
  const index = build.substats.indexOf(prop);
  if (index === -1) return 0.15;
  return [1, 0.8, 0.6, 0.45][Math.min(index, 3)];
}

export type Potential = {
  /** Score if every remaining roll lands worst substat, worst tier. */
  min: number;
  /**
   * What it is worth if the rolls land the way rolls land.
   *
   * The number to rank by. `max` is one path out of thousands — five rolls all
   * landing the build's first choice at the top tier — and ranking by it made
   * every unlevelled piece look like a monster, which is exactly the complaint.
   */
  expected: number;
  /** Score if every remaining roll lands best substat, best tier. */
  max: number;
  remainingRolls: number;
};

/**
 * What the piece could become.
 *
 * Bounds and a middle, not a promise. Two things the old version got wrong, and
 * both of them flattered raw pieces:
 *
 *   1. A roll was counted as a *maximum* roll. Rolls land on four tiers, and
 *      the average is 85% of the top one, so every future roll was overpriced
 *      by about a sixth.
 *   2. Every remaining roll was assumed to land on the build's best substat.
 *      A four-substat piece spreads its rolls across all four, so the honest
 *      expectation is the average of the weights it can actually hit.
 *
 * Together those turned "a level-zero piece with promising substats" into "a
 * better piece than the +20 you are wearing", which is not what the table says.
 */
export function potentialOf(piece: ComparablePiece, build: BuildStats): Potential {
  const max = MAX_LEVEL[piece.rarity] ?? 20;
  const remainingRolls = Math.floor(max / LEVELS_PER_ROLL)
    - Math.floor(Math.min(piece.level, max) / LEVELS_PER_ROLL);

  const current = scorePiece(piece, build).score;
  if (remainingRolls === 0) {
    return { min: current, expected: current, max: current, remainingRolls: 0 };
  }

  const known = piece.substats.map((substat) => weightOf(substat.prop, build));
  const everyWeight = ROLLABLE.map((prop) => weightOf(prop, build));

  // The fourth substat, when it does not exist yet, is bounded by the worst and
  // best a roll could be rather than assumed — and, in the middle, by what a
  // random one is worth.
  const missing = piece.substats.length < 4;
  const unknownMean = everyWeight.reduce((total, weight) => total + weight, 0)
    / everyWeight.length;

  const lowWeight = Math.min(...known, ...(missing ? [Math.min(...everyWeight)] : []));
  const highWeight = Math.max(...known, ...(missing ? [Math.max(...everyWeight)] : []));

  // Rolls spread across the substats the piece has, so the expectation is their
  // mean — with the unlanded fourth counted as an average stat.
  const reachable = [...known, ...(missing ? [unknownMean] : [])];
  const meanWeight = reachable.reduce((total, weight) => total + weight, 0) / reachable.length;

  const worstTier = TIER_FRACTIONS[0];
  const bestTier = TIER_FRACTIONS[TIER_FRACTIONS.length - 1];

  return {
    min: current + remainingRolls * lowWeight * worstTier,
    expected: current + remainingRolls * meanWeight * MEAN_TIER,
    max: current + remainingRolls * highWeight * bestTier,
    remainingRolls,
  };
}

export type SwapKind = 'upgrade' | 'prospect' | 'stopgap' | 'sidegrade';

export type Swap = {
  candidate: ComparablePiece;
  score: PieceScore;
  potential: Potential;
  /** Score change now. Negative for a prospect. */
  delta: number;
  /** Change once both are fed, on the expectation rather than the best case. */
  potentialDelta: number;
  /** The luckiest version of the same comparison, for the range a row shows. */
  bestCaseDelta: number;
  kind: SwapKind;
  /** Whether the build's planned set bonuses survive the swap. */
  keepsSetBonus: boolean;
  /** Goals that change status, and how. */
  goalChanges: { prop: string; from: GoalVerdict['status']; to: GoalVerdict['status'] }[];
};

export type CompareInput = {
  build: BuildStats;
  /** Set plan, so a swap that breaks a four-piece is marked as such. */
  plannedSets: { setIds: number[]; pieces: number }[];
  equipped: ComparablePiece | null;
  /** Everything the player owns in this slot, minus what is on someone else. */
  candidates: ComparablePiece[];
  /** The rest of the build's gear, for recomputing totals with the swap. */
  otherPieces: ComparablePiece[];
  statInput: Omit<StatInput, 'pieces'>;
  goals: { prop: string; min: number }[];
  /** Flat two-piece bonuses per set, for the totals after a swap. */
  bonusesBySet: Map<number, { prop: string; value: number }[]>;
};

/** Does the plan still hold if this slot changes set? */
function keepsPlan(
  input: CompareInput,
  candidateSetId: number,
): boolean {
  if (input.plannedSets.length === 0) return true;

  const counts = new Map<number, number>();
  for (const piece of input.otherPieces) {
    counts.set(piece.setId, (counts.get(piece.setId) ?? 0) + 1);
  }
  counts.set(candidateSetId, (counts.get(candidateSetId) ?? 0) + 1);

  return input.plannedSets.every((plan) =>
    plan.setIds.every((setId) => (counts.get(setId) ?? 0) >= plan.pieces));
}

function totalsWith(input: CompareInput, pieces: ComparablePiece[]) {
  const counts = new Map<number, number>();
  for (const piece of pieces) counts.set(piece.setId, (counts.get(piece.setId) ?? 0) + 1);

  const setBonuses = [...counts]
    .filter(([, count]) => count >= 2)
    .flatMap(([setId]) => input.bonusesBySet.get(setId) ?? []);

  return computeStats({ ...input.statInput, pieces, setBonuses }).totals;
}

export function compareSlot(input: CompareInput): Swap[] {
  const equippedScore = input.equipped ? scorePiece(input.equipped, input.build).score : 0;
  const equippedPotential = input.equipped
    ? potentialOf(input.equipped, input.build)
    : null;

  const before = evaluateGoals(
    totalsWith(input, [...input.otherPieces, ...(input.equipped ? [input.equipped] : [])]),
    input.goals,
  );
  const beforeByProp = new Map(before.map((verdict) => [verdict.prop, verdict.status]));

  return input.candidates
    .filter((candidate) => candidate.instanceId !== input.equipped?.instanceId)
    .map((candidate) => {
      const score = scorePiece(candidate, input.build);
      const potential = potentialOf(candidate, input.build);

      const delta = score.score - equippedScore;
      const potentialDelta = potential.expected - (equippedPotential?.expected ?? 0);
      const bestCaseDelta = potential.max - (equippedPotential?.max ?? 0);

      const after = evaluateGoals(
        totalsWith(input, [...input.otherPieces, candidate]),
        input.goals,
      );

      const goalChanges = after.flatMap((verdict) => {
        const from = beforeByProp.get(verdict.prop);
        return from && from !== verdict.status
          ? [{ prop: verdict.prop, from, to: verdict.status }]
          : [];
      });

      // The two interesting cases are the ones where now and later disagree.
      // Both sides of the test are held to what a row can actually print: a
      // gain the display rounds to zero is not a gain.
      const kind: SwapKind = delta >= MEANINGFUL
        ? potentialDelta >= 0 ? 'upgrade' : 'stopgap'
        : potentialDelta >= MEANINGFUL && potential.remainingRolls > 0
          ? 'prospect'
          : 'sidegrade';

      return {
        candidate,
        score,
        potential,
        delta,
        potentialDelta,
        bestCaseDelta,
        kind,
        keepsSetBonus: keepsPlan(input, candidate.setId),
        goalChanges,
      };
    })
    .filter((swap) => swap.kind !== 'sidegrade')
    .sort((a, b) =>
      // A swap that fixes a goal outranks one that merely scores higher.
      countFixed(b) - countFixed(a) ||
      Number(b.keepsSetBonus) - Number(a.keepsSetBonus) ||
      // A lasting gain before a temporary one, even when the stopgap is bigger
      // today: the plan is what is being built toward.
      rankKind(a) - rankKind(b) ||
      b.delta - a.delta ||
      b.potentialDelta - a.potentialDelta);
}

const KIND_ORDER: Record<SwapKind, number> = {
  upgrade: 0, prospect: 1, stopgap: 2, sidegrade: 3,
};

const rankKind = (swap: Swap) => KIND_ORDER[swap.kind];

const countFixed = (swap: Swap) =>
  swap.goalChanges.filter((change) => change.to === 'met' && change.from !== 'met').length
  - swap.goalChanges.filter((change) => change.from === 'met' && change.to !== 'met').length;

/** How many top rolls of a substat a piece is carrying, for display. */
export function usefulRolls(piece: ComparablePiece, build: BuildStats) {
  return piece.substats.reduce((total, substat) => {
    const weight = weightOf(substat.prop, build);
    return weight > 0.15 ? total + rollsOf(substat.prop, substat.value, piece.rarity) : total;
  }, 0);
}
