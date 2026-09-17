import type { Team } from '@/lib/player/teams';

import type { Filters } from './filters';

/**
 * Who the plan is being computed for.
 *
 * A team narrows to its members; picking faces narrows further; both empty
 * means the whole roster, which is the account-wide question. Lives on its own
 * because the day view and the backlog view have to agree on it — two copies of
 * this is two answers to "what does my electro team need".
 */
export function resolveScope(teams: Team[], filters: Filters) {
  const team = teams.find((entry) => entry.id === filters.team) ?? null;
  const picked = new Set(filters.chars);
  const inTeam = new Set(team?.slots.map((slot) => slot.characterId) ?? []);

  let characterIds: Set<number> | undefined;
  if (team && picked.size > 0) characterIds = new Set([...picked].filter((id) => inTeam.has(id)));
  else if (team) characterIds = inTeam;
  else if (picked.size > 0) characterIds = picked;

  return { team, characterIds };
}

/** The filter as `farmingPlan` wants it. */
export function farmingFilter(filters: Filters, characterIds: Set<number> | undefined) {
  return {
    characterIds,
    reasons: filters.reason.length > 0 ? new Set(filters.reason) : undefined,
    includeWithoutTarget: filters.assume,
  };
}
