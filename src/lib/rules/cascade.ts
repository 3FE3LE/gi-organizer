import type { ArtifactSlot } from '@/lib/data/types';

import type { ComparablePiece } from './compare';
import { type BuildStats, scorePiece } from './piece-score';
import { type SetRequirement, setFitOf } from './set-fit';

/**
 * The chain.
 *
 * Three artifacts arrive, one improves a character, the piece they were
 * wearing frees up, that piece improves somebody else, and the piece *they*
 * were wearing frees up in turn. Evaluating each build alone never finds this:
 * the second move only looks good once the first has happened.
 *
 * The search is greedy with displacement accounting — repeatedly take the move
 * with the best net effect across the whole account, apply it, and look again.
 * Deliberately not an optimal assignment: a maximum-weight matching would score
 * higher and produce a list nobody can follow, while this produces a sequence
 * with a reason at every step. The point is to be actionable, not maximal.
 */

export type CascadeBuild = {
  buildId: string;
  characterId: number;
  name: string;
  stats: BuildStats;
  /**
   * The sets the build is held to — its own plan, or the default one when the
   * player has not written one (see `effectiveSetPlan`). A move that spends a
   * slot the plan needs is not made; see `setFitOf`.
   */
  plannedSets: SetRequirement[];
};

/**
 * How much better a piece taken off somebody has to be than a free one.
 *
 * One top-priority roll. Without it the search took whatever scored highest,
 * and the highest-scoring piece in a slot is almost always one a character is
 * already wearing — the leftovers in the box are leftovers for a reason — so
 * nearly every step undressed somebody for a gain a spare piece would have
 * come within a decimal of. A move that asks the player to re-gear two
 * characters has to be worth clearly more than one that touches only one.
 *
 * It orders the moves and gates them; it is not a cost, so the gain and the
 * net a move reports stay the scores themselves. The queue applies the same
 * margin between a free swap and a taken one.
 */
export const DISPLACEMENT_MARGIN = 1;

/**
 * What the wearer of `piece` gives up by losing it: its score to them, minus
 * the best free piece in the box that could take its place without costing
 * them their own set plan.
 *
 * Null when taking it is not a trade at all — the piece counts toward the
 * wearer's own planned set and nothing free could stand in for it. Their
 * bonus would go with it, which no substat score prices, so the move is
 * refused rather than priced low. A piece the wearer's plan does not use
 * (their flex slot, or a set they are not chasing) can be replaced by
 * anything, and costs only the rolls.
 *
 * Pricing the replacement against every free piece, as the chain used to,
 * let a Crimson Witch circlet leave its four-piece for a gain elsewhere
 * because a random-set circlet in the box "covered" it on substats.
 */
export function costOfGivingUp(input: {
  stats: BuildStats;
  plan: SetRequirement[];
  piece: ComparablePiece;
  /** Sets of what the wearer has on in the other four slots. */
  otherSetIds: number[];
  /** Free pieces in the same slot, any set. */
  pool: ComparablePiece[];
  /** Scorer, for callers that cache; defaults to `scorePiece`. */
  score?: (piece: ComparablePiece) => number;
}): number | null {
  const score = input.score ?? ((piece: ComparablePiece) => scorePiece(piece, input.stats).score);
  const held = score(input.piece);
  const fit = setFitOf(input.plan, input.otherSetIds, input.piece.setId);

  // Whatever replaces a piece that respected the plan has to respect it too.
  const eligible = fit === 'off-plan'
    ? input.pool
    : input.pool.filter((piece) =>
        setFitOf(input.plan, input.otherSetIds, piece.setId) !== 'off-plan');

  if (fit === 'on-plan' && eligible.length === 0) return null;

  const replacement = eligible.reduce((best, piece) => Math.max(best, score(piece)), 0);
  return Math.max(0, held - replacement);
}

export type CascadeInput = {
  builds: CascadeBuild[];
  /** Every owned piece, with its current holder. */
  pieces: (ComparablePiece & { equippedTo: number | null })[];
  /** Ignore anything gaining less than this, or the chain never ends. */
  minGain?: number;
  maxMoves?: number;
};

export type CascadeMove = {
  order: number;
  instanceId: string;
  slot: ArtifactSlot;
  toBuildId: string;
  toCharacterId: number;
  /**
   * Who loses the piece, planned or not. A character with no build costs the
   * plan nothing, and still ends up without it.
   */
  fromCharacterId: number | null;
  /** Whether the loser had a build the plan accounted for. */
  fromPlanned: boolean;
  /** What the receiving build gains. */
  gain: number;
  /**
   * What the losing build gives up after taking its own best replacement —
   * one that keeps its set plan. See `costOfGivingUp`.
   */
  cost: number;
  net: number;
  /** The piece pushed out, which is what the next move may pick up. */
  frees: string | null;
  /**
   * The receiving build, when the piece is off its set plan. Only ever a hole
   * being filled: an off-plan piece never replaces one that is worn.
   */
  breaksSetFor: string | null;
};

export type CascadePlan = {
  moves: CascadeMove[];
  /** Score before and after, per build. */
  byBuild: { buildId: string; name: string; characterId: number; before: number; after: number }[];
  netGain: number;
  /** True when the search stopped on the cap rather than on running out. */
  truncated: boolean;
};

const ALL_SLOTS: ArtifactSlot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

type State = {
  /** instanceId → the build holding it, or null when no build plans around it. */
  holder: Map<string, string | null>;
  /**
   * instanceId → the character wearing it, whether or not they have a build.
   *
   * Tracked separately because the two answers differ: taking a piece off a
   * character nobody has planned costs the plan nothing, but it still
   * undresses them, and a plan that does not say so is lying by omission.
   */
  wearer: Map<string, number | null>;
  /** buildId → slot → instanceId. */
  worn: Map<string, Map<ArtifactSlot, string>>;
};

function initialState(input: CascadeInput): State {
  const buildOf = new Map(input.builds.map((build) => [build.characterId, build.buildId]));
  const holder = new Map<string, string | null>();
  const wearer = new Map<string, number | null>();
  const worn = new Map<string, Map<ArtifactSlot, string>>();

  for (const build of input.builds) worn.set(build.buildId, new Map());

  for (const piece of input.pieces) {
    const buildId = piece.equippedTo === null ? null : buildOf.get(piece.equippedTo) ?? null;
    holder.set(piece.instanceId, buildId);
    wearer.set(piece.instanceId, piece.equippedTo);
    if (buildId) worn.get(buildId)?.set(piece.slot, piece.instanceId);
  }

  return { holder, wearer, worn };
}

export function planCascade(input: CascadeInput): CascadePlan {
  const minGain = input.minGain ?? 0.5;
  const maxMoves = input.maxMoves ?? 12;

  const byId = new Map(input.pieces.map((piece) => [piece.instanceId, piece]));
  const bySlot = new Map<ArtifactSlot, ComparablePiece[]>();
  for (const piece of input.pieces) {
    bySlot.set(piece.slot, [...(bySlot.get(piece.slot) ?? []), piece]);
  }

  const builds = new Map(input.builds.map((build) => [build.buildId, build]));
  const state = initialState(input);

  // Scores are pure functions of piece and build, so caching them turns the
  // inner loop from arithmetic-heavy into lookups.
  const cache = new Map<string, number>();
  const scoreOf = (instanceId: string, build: CascadeBuild) => {
    const key = `${instanceId}|${build.buildId}`;
    let value = cache.get(key);
    if (value === undefined) {
      const piece = byId.get(instanceId);
      value = piece ? scorePiece(piece, build.stats).score : 0;
      cache.set(key, value);
    }
    return value;
  };

  const scoreBuild = (build: CascadeBuild) => {
    let total = 0;
    for (const instanceId of state.worn.get(build.buildId)?.values() ?? []) {
      total += scoreOf(instanceId, build);
    }
    return total;
  };

  const before = new Map(input.builds.map((build) => [build.buildId, scoreBuild(build)]));

  const moves: CascadeMove[] = [];
  let truncated = false;

  /** Sets worn in every slot of a build but one. */
  const otherSetIds = (worn: Map<ArtifactSlot, string>, slot: ArtifactSlot) => {
    const setIds: number[] = [];
    for (const [wornSlot, instanceId] of worn) {
      const piece = wornSlot === slot ? undefined : byId.get(instanceId);
      if (piece) setIds.push(piece.setId);
    }
    return setIds;
  };

  while (moves.length < maxMoves) {
    let best: CascadeMove | null = null;
    let bestRank = -Infinity;

    for (const build of input.builds) {
      const worn = state.worn.get(build.buildId);
      if (!worn) continue;

      for (const slot of ALL_SLOTS) {
        const currentId = worn.get(slot);
        const current = currentId ? scoreOf(currentId, build) : 0;
        const around = otherSetIds(worn, slot);

        for (const candidate of bySlot.get(slot) ?? []) {
          const holderId = state.holder.get(candidate.instanceId) ?? null;
          if (holderId === build.buildId) continue;

          const gain = scoreOf(candidate.instanceId, build) - current;
          if (gain <= 0) continue;

          // A piece that spends a slot the set plan needs is not an upgrade,
          // whatever its rolls — that is how a set nobody named for the
          // character got proposed. The one exception is a hole: an empty
          // slot is worse than an off-set piece, and the move says so.
          const fit = setFitOf(build.plannedSets, around, candidate.setId);
          if (fit === 'off-plan' && currentId) continue;

          // Taking from another build is only worth it if that build can cover
          // the hole for less than this build gains. Without pricing the
          // replacement, every move looks free and the chain is a fiction.
          let cost = 0;
          if (holderId !== null) {
            const loser = builds.get(holderId);
            const loserWorn = state.worn.get(holderId);
            if (!loser || !loserWorn) continue;

            const priced = costOfGivingUp({
              stats: loser.stats,
              plan: loser.plannedSets,
              piece: candidate,
              otherSetIds: otherSetIds(loserWorn, slot),
              pool: (bySlot.get(slot) ?? [])
                .filter((piece) => (state.holder.get(piece.instanceId) ?? null) === null),
              score: (piece) => scoreOf(piece.instanceId, loser),
            });
            if (priced === null) continue;
            cost = priced;
          }

          const net = gain - cost;
          // Anybody wearing it — planned or not — has to be undressed for it,
          // so a taken piece has to clear the free ones by a margin.
          const wearer = state.wearer.get(candidate.instanceId) ?? null;
          const rank = net - (wearer === null ? 0 : DISPLACEMENT_MARGIN);
          if (rank < minGain || rank <= bestRank) continue;

          bestRank = rank;
          best = {
            order: moves.length + 1,
            instanceId: candidate.instanceId,
            slot,
            toBuildId: build.buildId,
            toCharacterId: build.characterId,
            // Whoever actually loses the piece, planned or not.
            fromCharacterId: wearer,
            fromPlanned: holderId !== null,
            gain,
            cost,
            net,
            frees: currentId ?? null,
            breaksSetFor: fit === 'off-plan' ? build.buildId : null,
          };
        }
      }
    }

    if (!best) break;

    // Apply it. The displaced piece becomes free, which is exactly what lets
    // the next round find a move that did not exist before this one.
    const previousHolder = state.holder.get(best.instanceId) ?? null;
    if (previousHolder) state.worn.get(previousHolder)?.delete(best.slot);

    const receiving = state.worn.get(best.toBuildId);
    const displaced = receiving?.get(best.slot);
    if (displaced) state.holder.set(displaced, null);

    receiving?.set(best.slot, best.instanceId);
    state.holder.set(best.instanceId, best.toBuildId);
    state.wearer.set(best.instanceId, best.toCharacterId);
    if (displaced) state.wearer.set(displaced, null);

    moves.push(best);
  }

  if (moves.length >= maxMoves) truncated = true;

  return {
    moves,
    byBuild: input.builds.map((build) => ({
      buildId: build.buildId,
      name: build.name,
      characterId: build.characterId,
      before: before.get(build.buildId) ?? 0,
      after: scoreBuild(build),
    })),
    netGain: moves.reduce((total, move) => total + move.net, 0),
    truncated,
  };
}

/**
 * Groups the plan into the chains a person would actually follow: a move and
 * everything it made possible.
 */
export function chainsOf(plan: CascadePlan) {
  const chains: CascadeMove[][] = [];
  const index = new Map<string, number>();

  for (const move of plan.moves) {
    const parent = index.get(move.instanceId);
    if (parent === undefined) {
      chains.push([move]);
      if (move.frees) index.set(move.frees, chains.length - 1);
    } else {
      chains[parent].push(move);
      if (move.frees) index.set(move.frees, parent);
    }
  }

  return chains;
}
