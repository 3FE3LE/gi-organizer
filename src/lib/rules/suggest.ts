import type { ArtifactSlot } from '@/lib/data/types';
import { isAlwaysReachable, type WeaponSource } from '@/lib/data/weapon-sources';

import type { CharacterGear } from './evaluate';
import type { Rule, TeamRole } from './types';

/**
 * Alternatives for a character, ranked by what the player can actually field.
 *
 * The candidate pool is **every set you can wear**, not the handful an external
 * list names. Those lists rank in a vacuum: they are what tells two members of
 * one team to both wear Viridescent Venerer, and they go silent the moment all
 * of their picks are taken by teammates. So the external order is the weakest
 * tiebreaker here, not the spine.
 *
 * What actually orders the list, strongest first:
 *
 *   1. what the player pinned
 *   2. whether it collides with a teammate's non-stacking aura
 *   3. whether it serves the team's stated objective
 *   4. the declared slot role against the set's curated affinity
 *   5. the external list, if it happens to mention it
 *   6. how close to complete it already is
 *
 * Note what is *not* in that list: owning the pieces. A set you cannot field
 * today is still a fine answer — you farm it. Missing pieces is a label on the
 * row, not a demotion. A teammate already supplying the aura is different: that
 * one is a dead end no amount of farming fixes.
 */

export type BuildPriority = {
  characterId: number;
  role: string | null;
  mainStats: string[][];
  substats: string[];
  weapons: { weaponId: number; minRefinement: number }[];
  artifacts: { setIds: number[]; pieces: number }[];
};

/** Every reason a suggestion sits where it does, so the UI can explain it. */
export type SuggestionReason =
  | { kind: 'pinned' }
  | { kind: 'objective'; mechanic: string }
  | { kind: 'role-match'; roles: TeamRole[] }
  | { kind: 'partial'; available: number; needed: number }
  | { kind: 'external-rank'; rank: number }
  | { kind: 'unannotated' };

export type SetSuggestion = {
  setIds: number[];
  pieces: number;
  available: number;
  needed: number;
  /** False only when a teammate already supplies the aura. */
  feasible: boolean;
  blocked: 'conflicts-in-team' | null;
  /** Whether the pieces are in the box today. Informational, never a filter. */
  complete: boolean;
  conflictsWith: number[];
  reasons: SuggestionReason[];
  /** Only for display; a low rank never outweighs feasibility or role. */
  externalRank: number | null;
};

export type SuggestionContext = {
  characterId: number;
  teamMembers: number[];
  /** Roles the player declared on this character's slot. The strongest signal. */
  declaredRoles: TeamRole[];
  /** Sets the player pinned for this build. Outranks everything. */
  pinnedSetIds: number[];
  priorities: Map<number, BuildPriority>;
  gear: Map<number, CharacterGear>;
  freeSlotsBySet: Map<number, Set<ArtifactSlot>>;
  rules: Rule[];
  roles: Map<number, TeamRole[]>;
  /** Curated role affinity per set. Absent means unannotated, not unsuitable. */
  setRoles: Map<number, TeamRole[]>;
  /** The mechanic the team is built around, if the player stated one. */
  objective: string | null;
  /** Mechanics each set's own text names. Derived, not curated. */
  setMechanics: Map<number, string[]>;
  /** Every set in the catalog, so the pool is not limited to what a list names. */
  allSetIds: number[];
};

function wornSets(gear: CharacterGear | undefined) {
  const counts = new Map<number, number>();
  for (const setId of gear?.sets.values() ?? []) {
    counts.set(setId, (counts.get(setId) ?? 0) + 1);
  }
  return counts;
}

function nonStackingSets(rules: Rule[]) {
  const byId = new Map<number, number>();

  for (const rule of rules) {
    if (rule.kind !== 'non-stacking' || !rule.enabled) continue;
    for (const provider of rule.providers) {
      if (provider.type === 'artifact-set') byId.set(provider.setId, provider.pieces);
    }
  }

  return byId;
}

export function suggestSets(context: SuggestionContext): SetSuggestion[] {
  const guarded = nonStackingSets(context.rules);
  const mine = wornSets(context.gear.get(context.characterId));

  const suppliedByOthers = new Map<number, number[]>();
  for (const member of context.teamMembers) {
    if (member === context.characterId) continue;
    for (const [setId, count] of wornSets(context.gear.get(member))) {
      const pieces = guarded.get(setId);
      if (pieces !== undefined && count >= pieces) {
        suppliedByOthers.set(setId, [...(suppliedByOthers.get(setId) ?? []), member]);
      }
    }
  }

  const external = new Map<string, number>();
  const priority = context.priorities.get(context.characterId);
  priority?.artifacts.forEach((candidate, rank) => {
    external.set(candidate.setIds.join('-'), rank);
  });

  // The pool: every set in the catalog, plus whatever the external list names
  // even when it cannot be fielded — "you are two pieces away" is worth saying.
  const pool = new Map<string, { setIds: number[]; pieces: number }>();
  for (const setId of context.allSetIds) pool.set(String(setId), { setIds: [setId], pieces: 4 });
  for (const candidate of priority?.artifacts ?? []) {
    pool.set(candidate.setIds.join('-'), candidate);
  }
  for (const setId of context.pinnedSetIds) {
    pool.set(String(setId), { setIds: [setId], pieces: 4 });
  }

  const suggestions = [...pool.values()].map((candidate) => {
    const needed = candidate.pieces * candidate.setIds.length;

    // Pieces already worn count: finishing a half-worn set is cheaper than
    // starting one from nothing.
    const available = candidate.setIds.reduce((total, setId) => {
      const free = context.freeSlotsBySet.get(setId)?.size ?? 0;
      return total + Math.min(candidate.pieces, free + (mine.get(setId) ?? 0));
    }, 0);

    const conflictsWith = candidate.setIds.flatMap((setId) => suppliedByOthers.get(setId) ?? []);
    const externalRank = external.get(candidate.setIds.join('-')) ?? null;

    const affinity = candidate.setIds.flatMap((setId) => context.setRoles.get(setId) ?? []);
    const matched = context.declaredRoles.filter((role) => affinity.includes(role));

    // A set whose own text names the team's objective is doing the job the team
    // exists for, which beats being generically right for the role.
    const servesObjective = context.objective !== null && candidate.setIds.some(
      (setId) => (context.setMechanics.get(setId) ?? []).includes(context.objective!),
    );

    const pinned = candidate.setIds.length === 1
      && context.pinnedSetIds.includes(candidate.setIds[0]);

    // Only a teammate's aura blocks. Missing pieces is a shopping list.
    const blocked = conflictsWith.length > 0 ? 'conflicts-in-team' as const : null;
    const complete = available >= needed;

    const reasons: SuggestionReason[] = [];
    if (pinned) reasons.push({ kind: 'pinned' });
    if (servesObjective) reasons.push({ kind: 'objective', mechanic: context.objective! });
    if (matched.length > 0) reasons.push({ kind: 'role-match', roles: matched });
    else if (affinity.length === 0) reasons.push({ kind: 'unannotated' });
    if (!complete) reasons.push({ kind: 'partial', available, needed });
    if (externalRank !== null) reasons.push({ kind: 'external-rank', rank: externalRank });

    return {
      setIds: candidate.setIds,
      pieces: candidate.pieces,
      available,
      needed,
      feasible: blocked === null,
      blocked,
      conflictsWith,
      reasons,
      externalRank,
      pinned,
      complete,
      objectiveScore: servesObjective ? 1 : 0,
      roleScore: matched.length,
    };
  });

  return suggestions
    .sort((a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      // The only true exclusion: a teammate is already supplying the aura, and
      // no amount of farming changes that.
      Number(b.feasible) - Number(a.feasible) ||
      // The team's purpose before the slot's role: a generically good support
      // set is worse than one that serves what the team is for.
      b.objectiveScore - a.objectiveScore ||
      b.roleScore - a.roleScore ||
      // Suitability before logistics. Owning the pieces is the last word, not
      // the first: a set you have none of is a farming target, not a bad answer.
      rankOf(a.externalRank) - rankOf(b.externalRank) ||
      b.available / b.needed - a.available / a.needed)
    // `pinned` and `roleScore` only exist to sort by; the reasons carry them
    // outward in a form the UI can explain.
    .map((entry) => ({
      setIds: entry.setIds,
      pieces: entry.pieces,
      available: entry.available,
      needed: entry.needed,
      feasible: entry.feasible,
      blocked: entry.blocked,
      complete: entry.complete,
      conflictsWith: entry.conflictsWith,
      reasons: entry.reasons,
      externalRank: entry.externalRank,
    }));
}

/** An unranked set sorts after a ranked one, never before. */
const rankOf = (rank: number | null) => rank ?? Number.MAX_SAFE_INTEGER;

export type WeaponSuggestion = {
  weaponId: number;
  externalRank: number | null;
  minRefinement: number;
  spare: number;
  owned: number;
  feasible: boolean;
  /** How it can be obtained, when that is known. */
  source: WeaponSource | undefined;
};

/**
 * Weapons the player can actually put on this character.
 *
 * The pool is not "every weapon of the right type": a five-star from a banner
 * that is not running is not a plan, it is a taunt. So a weapon qualifies when
 * a spare copy is already owned, or when it can be worked towards regardless of
 * banners — forging and the battle pass.
 *
 * The asymmetry with artifacts is deliberate. An artifact piece is farmable, so
 * a set the player does not have yet is a legitimate target; a refinement from
 * a closed banner is not.
 */
export function suggestWeapons(
  characterId: number,
  priorities: Map<number, BuildPriority>,
  stock: Map<string, number>,
  claimedByOthers: Map<number, number>,
  usableWeaponIds: number[],
  sources: Map<number, { source: WeaponSource }>,
): WeaponSuggestion[] {
  const external = new Map<number, { rank: number; minRefinement: number }>();
  priorities.get(characterId)?.weapons.forEach((candidate, rank) => {
    external.set(candidate.weaponId, { rank, minRefinement: candidate.minRefinement });
  });

  const pool = new Set<number>([...usableWeaponIds, ...external.keys()]);

  return [...pool].map((weaponId) => {
    const listed = external.get(weaponId);
    const minRefinement = listed?.minRefinement ?? 1;

    // Refinement splits the stock: owning an R1 says nothing about an R5.
    let owned = 0;
    for (let refinement = minRefinement; refinement <= 5; refinement += 1) {
      owned += stock.get(`${weaponId}|${refinement}`) ?? 0;
    }

    const spare = owned - (claimedByOthers.get(weaponId) ?? 0);
    const source = sources.get(weaponId)?.source;

    return {
      weaponId,
      externalRank: listed?.rank ?? null,
      minRefinement,
      owned,
      spare,
      feasible: spare > 0,
      source,
    };
  }).filter((suggestion) =>
    // Owning a spare is reachable by definition; so is anything the player can
    // forge or buy from the pass. Everything else is a banner away.
    suggestion.spare > 0 || isAlwaysReachable(suggestion.source),
  ).sort((a, b) =>
    Number(b.feasible) - Number(a.feasible) ||
    rankOf(a.externalRank) - rankOf(b.externalRank) ||
    b.spare - a.spare);
}

/**
 * When two builds want the same guarded set, decides who keeps it.
 *
 * The declared role wins, because it is the player's own statement about this
 * team. Only when neither side declared anything relevant does the external
 * ranking get a say, and an exact tie stays undecided rather than arbitrary.
 */
export function resolveCollision(
  setId: number,
  contenders: number[],
  context: Pick<SuggestionContext, 'priorities' | 'roles' | 'setRoles'>,
): { keeps: number | null; reason: 'role-match' | 'external-rank' | 'undecidable' } {
  const affinity = context.setRoles.get(setId) ?? [];

  if (affinity.length > 0) {
    const matching = contenders.filter((characterId) =>
      (context.roles.get(characterId) ?? []).some((role) => affinity.includes(role)));

    if (matching.length === 1) return { keeps: matching[0], reason: 'role-match' };
  }

  const ranked = contenders
    .map((characterId) => ({
      characterId,
      rank: context.priorities.get(characterId)?.artifacts
        .findIndex((entry) => entry.setIds.includes(setId)) ?? -1,
    }))
    .filter((entry) => entry.rank >= 0)
    .sort((a, b) => a.rank - b.rank);

  if (ranked.length > 0 && (ranked.length === 1 || ranked[0].rank < ranked[1].rank)) {
    return { keeps: ranked[0].characterId, reason: 'external-rank' };
  }

  return { keeps: null, reason: 'undecidable' };
}
