import type { ArtifactSlot } from '@/lib/data/types';

import { DISPLACEMENT_MARGIN } from './cascade';
import type { Swap } from './compare';
import type { GoalVerdict } from './stats';

/**
 * One queue for the whole account: what to do next, in order.
 *
 * Five slots per build and a dozen builds is sixty lists, and sixty lists is
 * not an answer. The value of this layer is the ordering — deciding that
 * finishing a set matters more than a marginal swap, and that a change costing
 * nothing outranks one that undresses somebody else.
 *
 * Nothing here is new information. It is the same comparisons, sorted by what
 * a person would do first.
 */

export type Cost =
  /** Nothing else changes. */
  | 'free'
  /** Another character loses the piece. */
  | 'displaces'
  /** The planned set bonus is lost. */
  | 'breaks-set'
  /** Needs levelling before it pays off. */
  | 'needs-levelling'
  /** Nothing in the account solves it. */
  | 'needs-farming';

export type AgendaItem = {
  id: string;
  characterId: number;
  buildId: string;
  buildName: string;
  kind:
    | 'fill-empty-slot'
    | 'fix-goal'
    | 'equip-upgrade'
    | 'level-prospect'
    | 'complete-set'
    | 'acquire-weapon'
    | 'goal-unreachable';
  slot: ArtifactSlot | null;
  cost: Cost;
  /** Goals this moves to met. The strongest reason to act. */
  fixesGoals: string[];
  /** Score change, when the item is a swap. */
  delta: number;
  data: Record<string, string | number | (string | number)[]>;
};

export type AgendaInput = {
  builds: {
    buildId: string;
    buildName: string;
    characterId: number;
    goals: GoalVerdict[];
    setPlan: { setIds: number[]; pieces: number }[];
    weaponId: number | null;
    /** Whether a copy of the planned weapon is owned and spare. */
    weaponAvailable: boolean;
    equippedSets: Map<number, number>;
    slots: {
      slot: ArtifactSlot;
      empty: boolean;
      swaps: Swap[];
    }[];
  }[];
  /** Who holds a candidate, so the cost of taking it is known. */
  holderOf: Map<string, number | null>;
  /**
   * What the character wearing a piece gives up by losing it, once they take
   * their best free replacement — `costOfGivingUp`, the chain's own pricing.
   * Null when it would cost them their planned set. Absent means nothing to
   * price: the wearer has no build, so the plan loses nothing.
   */
  takeCost?: Map<string, number | null>;
};

function costOf(swap: Swap, characterId: number, holderOf: Map<string, number | null>): Cost {
  if (!swap.keepsSetBonus) return 'breaks-set';

  const holder = holderOf.get(swap.candidate.instanceId) ?? null;
  if (holder !== null && holder !== characterId) return 'displaces';

  return swap.kind === 'prospect' ? 'needs-levelling' : 'free';
}

const fixedBy = (swap: Swap) =>
  swap.goalChanges
    .filter((change) => change.to === 'met' && change.from !== 'met')
    .map((change) => change.prop);

/** A swap that loses a goal already met is not an improvement. */
const breaksAGoal = (swap: Swap) =>
  swap.goalChanges.some((change) => change.from === 'met' && change.to !== 'met');

/** What a swap is worth before anybody else's loss: now, or once it is fed. */
const gainOf = (swap: Swap) => (swap.kind === 'prospect' ? swap.potentialDelta : swap.delta);

/**
 * The swap to name for a slot, out of those that qualify.
 *
 * The comparison ranks by what the piece does for this build alone, and the
 * best piece for a slot is nearly always one somebody is already wearing — so
 * taking the first of that list turned the queue into a list of thefts. Here a
 * free piece is the answer unless a taken one beats it, after paying for what
 * its wearer loses, by `DISPLACEMENT_MARGIN`. A taken piece whose wearer would
 * lose their set, or more than this build gains, is not a candidate at all.
 */
function choose(
  swaps: Swap[],
  characterId: number,
  input: AgendaInput,
  /** The least a swap has to gain, after the wearer's loss, to be named. */
  floor = 0,
): Swap | undefined {
  let free: Swap | undefined;
  let taken: { swap: Swap; net: number } | undefined;

  for (const swap of swaps) {
    const holder = input.holderOf.get(swap.candidate.instanceId) ?? null;

    if (holder === null || holder === characterId) {
      // The comparison's order already puts the best free one first.
      if (gainOf(swap) > floor) free ??= swap;
      continue;
    }

    const cost = input.takeCost?.has(swap.candidate.instanceId)
      ? input.takeCost.get(swap.candidate.instanceId)!
      : 0;
    if (cost === null) continue;

    // Undressing somebody for less than they lose is never the next step,
    // whatever the floor for a free piece is.
    const net = gainOf(swap) - cost;
    if (net <= Math.max(floor, 0)) continue;
    if (!taken || net > taken.net) taken = { swap, net };
  }

  if (!free) return taken?.swap;
  if (!taken) return free;
  return taken.net >= gainOf(free) + DISPLACEMENT_MARGIN ? taken.swap : free;
}

export function buildAgenda(input: AgendaInput): AgendaItem[] {
  const items: AgendaItem[] = [];

  for (const build of input.builds) {
    const base = {
      characterId: build.characterId,
      buildId: build.buildId,
      buildName: build.buildName,
    };

    // A slot with nothing in it is not a marginal decision; it is a hole.
    for (const slot of build.slots) {
      if (!slot.empty) continue;
      // A hole is filled from the plan's sets when anything in the box fits,
      // and only then from whatever else there is: an off-set piece still
      // beats nothing, and the cost says it is off-set.
      const fillers = slot.swaps.filter((swap) => !breaksAGoal(swap));
      const best = choose(
        fillers.filter((swap) => swap.keepsSetBonus), build.characterId, input, -Infinity,
      ) ?? choose(fillers, build.characterId, input, -Infinity);

      items.push({
        ...base,
        id: `${build.buildId}:empty:${slot.slot}`,
        kind: 'fill-empty-slot',
        slot: slot.slot,
        cost: best ? costOf(best, build.characterId, input.holderOf) : 'needs-farming',
        fixesGoals: best ? fixedBy(best) : [],
        delta: best?.delta ?? 0,
        data: { slot: slot.slot, candidate: best?.candidate.instanceId ?? '' },
      });
    }

    for (const slot of build.slots) {
      if (slot.empty) continue;

      // A worn slot is only ever changed for a piece the set plan has room
      // for. Its rolls are not a reason: a circlet of a set the build never
      // named, in a slot the four-piece still needs, is not an upgrade however
      // it scores. The build's own tab still shows those, marked; this queue
      // is what to do next, and that is not it.
      const usable = slot.swaps.filter((swap) => !breaksAGoal(swap) && swap.keepsSetBonus);
      // Closing a goal is worth a piece that scores no higher; the floor is off.
      const fixer = choose(
        usable.filter((swap) => fixedBy(swap).length > 0), build.characterId, input, -Infinity);
      const upgrade = choose(
        usable.filter((swap) => swap.kind === 'upgrade'), build.characterId, input, 0.5);
      // Only worth naming when the payoff is real, or every unfed piece in the
      // account becomes a to-do.
      const prospect = choose(
        usable.filter((swap) => swap.kind === 'prospect'), build.characterId, input, 1);

      if (fixer) {
        items.push({
          ...base,
          id: `${build.buildId}:fix:${slot.slot}`,
          kind: 'fix-goal',
          slot: slot.slot,
          cost: costOf(fixer, build.characterId, input.holderOf),
          fixesGoals: fixedBy(fixer),
          delta: fixer.delta,
          data: { slot: slot.slot, candidate: fixer.candidate.instanceId },
        });
        continue;
      }

      if (upgrade) {
        items.push({
          ...base,
          id: `${build.buildId}:swap:${slot.slot}`,
          kind: 'equip-upgrade',
          slot: slot.slot,
          cost: costOf(upgrade, build.characterId, input.holderOf),
          fixesGoals: [],
          delta: upgrade.delta,
          data: { slot: slot.slot, candidate: upgrade.candidate.instanceId },
        });
        continue;
      }

      if (prospect) {
        items.push({
          ...base,
          id: `${build.buildId}:level:${slot.slot}`,
          kind: 'level-prospect',
          slot: slot.slot,
          cost: 'needs-levelling',
          fixesGoals: [],
          delta: prospect.potentialDelta,
          data: {
            slot: slot.slot,
            candidate: prospect.candidate.instanceId,
            rolls: prospect.potential.remainingRolls,
          },
        });
      }
    }

    for (const plan of build.setPlan) {
      for (const setId of plan.setIds) {
        const have = build.equippedSets.get(setId) ?? 0;
        if (have >= plan.pieces) continue;

        items.push({
          ...base,
          id: `${build.buildId}:set:${setId}`,
          kind: 'complete-set',
          slot: null,
          cost: 'needs-farming',
          fixesGoals: [],
          delta: 0,
          data: { setId, have, need: plan.pieces },
        });
      }
    }

    if (build.weaponId !== null && !build.weaponAvailable) {
      items.push({
        ...base,
        id: `${build.buildId}:weapon`,
        kind: 'acquire-weapon',
        slot: null,
        cost: 'needs-farming',
        fixesGoals: [],
        delta: 0,
        data: { weaponId: build.weaponId },
      });
    }

    // A goal nothing in the account can fix is worth stating plainly, so it is
    // not mistaken for something the list forgot.
    // Fixable means fixable by something this queue would propose — a piece
    // the set plan has room for — not by any piece in the box.
    const fixableProps = new Set(build.slots.flatMap((slot) => slot.swaps
      .filter((swap) => slot.empty || swap.keepsSetBonus)
      .flatMap(fixedBy)));
    for (const goal of build.goals) {
      if (goal.status === 'met' || fixableProps.has(goal.prop)) continue;

      items.push({
        ...base,
        id: `${build.buildId}:goal:${goal.prop}`,
        kind: 'goal-unreachable',
        slot: null,
        cost: 'needs-farming',
        fixesGoals: [],
        delta: goal.margin,
        data: { prop: goal.prop, actual: Math.round(goal.actual), min: goal.min, status: goal.status },
      });
    }
  }

  return items.sort(compare);
}

/** Cheaper before dearer; a change costing nothing is the one to do first. */
const COST_ORDER: Record<Cost, number> = {
  free: 0, displaces: 1, 'needs-levelling': 2, 'breaks-set': 3, 'needs-farming': 4,
};

const KIND_ORDER: Record<AgendaItem['kind'], number> = {
  'fill-empty-slot': 0,
  'fix-goal': 1,
  'equip-upgrade': 2,
  'level-prospect': 3,
  'complete-set': 4,
  'acquire-weapon': 5,
  'goal-unreachable': 6,
};

function compare(a: AgendaItem, b: AgendaItem) {
  return (
    // Anything that closes a goal comes first, whatever it costs: a build that
    // misses its threshold is not working, and a marginal swap on a build that
    // already works is not the next thing to do.
    b.fixesGoals.length - a.fixesGoals.length ||
    KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
    COST_ORDER[a.cost] - COST_ORDER[b.cost] ||
    b.delta - a.delta
  );
}

/** Counts for a heading, so the queue can be skimmed before it is read. */
export function summarizeAgenda(items: AgendaItem[]) {
  const byCost = { free: 0, displaces: 0, 'needs-levelling': 0, 'breaks-set': 0, 'needs-farming': 0 };
  for (const item of items) byCost[item.cost] += 1;

  return {
    total: items.length,
    actionableNow: byCost.free + byCost.displaces,
    fixesGoals: items.filter((item) => item.fixesGoals.length > 0).length,
    byCost,
  };
}

/** The steps for one team's members, or all of them when no team is picked. */
export function inTeam<T extends { characterId: number }>(
  items: T[],
  team: { slots: { characterId: number }[] } | null,
): T[] {
  if (!team) return items;
  const members = new Set(team.slots.map((slot) => slot.characterId));
  return items.filter((item) => members.has(item.characterId));
}
