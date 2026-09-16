import type { ArtifactSlot } from '@/lib/data/types';

import type { ComparablePiece } from './compare';
import { type BuildStats, scorePiece } from './piece-score';

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
  /** Set ids the plan requires, so a move that breaks one is priced. */
  plannedSets: { setIds: number[]; pieces: number }[];
};

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
  /** What the losing build gives up after taking its own best replacement. */
  cost: number;
  net: number;
  /** The piece pushed out, which is what the next move may pick up. */
  frees: string | null;
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

/** Does the plan still hold with this slot changed? */
function keepsPlan(
  build: CascadeBuild,
  worn: Map<ArtifactSlot, string>,
  byId: Map<string, ComparablePiece>,
  slot: ArtifactSlot,
  candidateSetId: number,
) {
  if (build.plannedSets.length === 0) return true;

  const counts = new Map<number, number>();
  for (const [wornSlot, instanceId] of worn) {
    if (wornSlot === slot) continue;
    const piece = byId.get(instanceId);
    if (piece) counts.set(piece.setId, (counts.get(piece.setId) ?? 0) + 1);
  }
  counts.set(candidateSetId, (counts.get(candidateSetId) ?? 0) + 1);

  return build.plannedSets.every((plan) =>
    plan.setIds.every((setId) => (counts.get(setId) ?? 0) >= plan.pieces));
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

  while (moves.length < maxMoves) {
    let best: CascadeMove | null = null;

    for (const build of input.builds) {
      const worn = state.worn.get(build.buildId);
      if (!worn) continue;

      for (const slot of ALL_SLOTS) {
        const currentId = worn.get(slot);
        const current = currentId ? scoreOf(currentId, build) : 0;

        for (const candidate of bySlot.get(slot) ?? []) {
          const holderId = state.holder.get(candidate.instanceId) ?? null;
          if (holderId === build.buildId) continue;

          const gain = scoreOf(candidate.instanceId, build) - current;
          if (gain <= 0) continue;

          // Taking from another build is only worth it if that build can cover
          // the hole for less than this build gains. Without pricing the
          // replacement, every move looks free and the chain is a fiction.
          let cost = 0;
          if (holderId !== null) {
            const loser = builds.get(holderId);
            if (!loser) continue;

            const held = scoreOf(candidate.instanceId, loser);
            const replacement = (bySlot.get(slot) ?? [])
              .filter((piece) => (state.holder.get(piece.instanceId) ?? null) === null)
              .reduce((bestScore, piece) => Math.max(bestScore, scoreOf(piece.instanceId, loser)), 0);

            cost = Math.max(0, held - replacement);
          }

          const net = gain - cost;
          if (net < minGain || (best !== null && net <= best.net)) continue;

          const breaks = !keepsPlan(build, worn, byId, slot, candidate.setId);

          best = {
            order: moves.length + 1,
            instanceId: candidate.instanceId,
            slot,
            toBuildId: build.buildId,
            toCharacterId: build.characterId,
            // Whoever actually loses the piece, planned or not.
            fromCharacterId: state.wearer.get(candidate.instanceId) ?? null,
            fromPlanned: holderId !== null,
            gain,
            cost,
            net,
            frees: currentId ?? null,
            breaksSetFor: breaks ? build.buildId : null,
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
