/**
 * Whether a piece belongs in a slot, as far as the build's sets are concerned.
 *
 * Every layer that moves a piece asks this — the per-slot comparison, the
 * account queue, the chain — and each of them used to answer it on its own,
 * with a test that only asked "does the plan hold afterwards?". That test is
 * right about the flex slot and wrong about everything else:
 *
 *   - a build with no plan at all let any set through, so a circlet from a set
 *     nobody named for the character was offered on its substats alone — the
 *     Gilded Dreams circlet on Yanfei;
 *   - a build whose four-piece was not finished yet called *every* swap a
 *     broken set, the on-set piece that moves it closer included, so the flag
 *     stopped meaning anything and nothing downstream could filter on it.
 *
 * The answer here has three values, because there are three different things
 * to say about a candidate:
 *
 *   - **on-plan**: its set is one the plan asks for, and this piece counts
 *     toward it — it is one of the four, or one of a pair;
 *   - **flex**: its set is not in the plan, and the other four slots already
 *     carry the plan without it — the fifth slot of a four-piece, or the fifth
 *     of a two-plus-two, which is free to take whatever rolls best;
 *   - **off-plan**: anything else. Wearing it spends a slot the plan needs.
 *
 * A piece of a planned set that is surplus — a fifth Crimson Witch while the
 * two-plus-two still lacks its second pair — is off-plan too: it is the set
 * the plan names, in a slot the plan needs for a different one.
 */

export type SetRequirement = { setIds: number[]; pieces: number };

export type SetFit = 'on-plan' | 'flex' | 'off-plan';

function holds(plan: SetRequirement[], counts: Map<number, number>) {
  return plan.every((requirement) =>
    requirement.setIds.every((setId) => (counts.get(setId) ?? 0) >= requirement.pieces));
}

/**
 * How a candidate of `candidateSetId` fits a slot, given the sets of the
 * pieces worn in the *other* four slots.
 *
 * With no plan every set is flex: there is nothing to respect. Callers that
 * want a plan whether or not the player wrote one down resolve it first — see
 * `effectiveSetPlan`.
 */
export function setFitOf(
  plan: SetRequirement[],
  otherSetIds: Iterable<number>,
  candidateSetId: number,
): SetFit {
  if (plan.length === 0) return 'flex';

  const counts = new Map<number, number>();
  for (const setId of otherSetIds) counts.set(setId, (counts.get(setId) ?? 0) + 1);

  const planned = plan.find((requirement) => requirement.setIds.includes(candidateSetId));

  // The four around it already carry the plan: whatever goes here is extra,
  // and a planned set is as welcome as any other.
  if (holds(plan, counts)) return planned ? 'on-plan' : 'flex';

  // The plan is not carried yet, so this slot is one it needs. Only a piece
  // that is still short of its own requirement is progress; a surplus one
  // occupies the place a different planned set was meant to take.
  return planned && (counts.get(candidateSetId) ?? 0) < planned.pieces ? 'on-plan' : 'off-plan';
}

/**
 * The set plan a build is measured against.
 *
 * The player's own plan when they wrote one. Otherwise the plan "fill from
 * the role" would write — the first set suggestion a teammate does not already
 * cover, or the first at all — so a build nobody has finished editing is held
 * to the same sets its own form would propose, rather than to none. Measuring
 * an unplanned build against no sets at all is what let a circlet from any set
 * in the box through on its rolls.
 */
export function defaultSetPlan(
  suggestions: { setIds: number[]; pieces: number; feasible: boolean }[],
): SetRequirement[] {
  const top = suggestions.find((entry) => entry.feasible) ?? suggestions[0];
  return top ? [{ setIds: top.setIds, pieces: top.pieces }] : [];
}

export function effectiveSetPlan(
  stated: SetRequirement[] | null | undefined,
  suggestions: { setIds: number[]; pieces: number; feasible: boolean }[],
): SetRequirement[] {
  return stated && stated.length > 0 ? stated : defaultSetPlan(suggestions);
}
