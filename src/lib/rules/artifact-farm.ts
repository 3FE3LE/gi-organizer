import type { Locale } from '@/lib/data/locales';

/**
 * Where to spend resin on artifacts.
 *
 * An artifact domain drops two sets, half and half. So a domain is worth what
 * *both* of its sets are worth to the characters in the plan: one whose pair
 * is also wanted pays twice per run, one whose pair nobody wears pays half —
 * and that other half is not lost either, because the strongbox trades three
 * unwanted five-star pieces for one of a set the player picks.
 *
 * What a character needs is how far their artifacts are from finished: the
 * artifact part of their rating, the same useful rolls the build page counts.
 * A character already there asks for nothing, however much resin a domain
 * would take.
 *
 * The numbers per run are averages, and the strongbox figure is the floor a
 * set can be had at: farming its own domain beats it, since half of every run
 * is the set itself and the other half still feeds the strongbox. The
 * strongbox only offers the older sets, though, so leftovers count as useful
 * only when somebody in the plan wears one it offers.
 */

export type ArtifactDomain = {
  entranceId: number;
  unlockRank: number;
  setIds: [number, number];
  entrance: Record<Locale, string>;
  region: Record<Locale, string>;
};

export type ArtifactFarmConfig = {
  /** Five-star pieces a run of the top domain level drops, on average. */
  fiveStarPerRun: number;
  /** Unwanted five-star pieces the strongbox takes for one of a chosen set. */
  strongboxCost: number;
  /** The newest version whose sets the strongbox offers, e.g. `4.0`. */
  strongboxThrough: string;
};

export type FarmCharacter = {
  characterId: number;
  /** The artifact part of the rating, 0–1. */
  artifacts: number;
  /** The sets the build is after; a 2+2 lists both. */
  setIds: number[];
};

export type SetDemand = {
  setId: number;
  /** Whether the strongbox offers the set, so pieces nobody wants can become it. */
  strongbox: boolean;
  /** Who wants the set, most in need first. */
  characters: { characterId: number; need: number }[];
};

export type DomainAdvice = {
  domain: ArtifactDomain;
  /** Both sets, in the domain's order, with who wants each. */
  sets: [SetDemand, SetDemand];
  /** The summed need the domain answers: what it is ranked by. */
  value: number;
  /** Five-star pieces of a wanted set per run, the strongbox's share included. */
  usefulPerRun: number;
};

export type ArtifactFarmAdvice = {
  domains: DomainAdvice[];
  /** Wanted sets no domain drops: bosses and the strongbox only. */
  elsewhere: SetDemand[];
  /** Per run, a set had only through the strongbox from pieces nobody wants. */
  strongboxPerRun: number;
  /** Whether anybody in the plan wears a set the strongbox offers: if not, leftovers are only leftovers. */
  strongboxUseful: boolean;
  /** Per run, one of the two sets of a domain, not counting the strongbox. */
  perSetPerRun: number;
};

/** Below this a character's artifacts read as done and ask for nothing. */
const DONE = 0.02;

/** `4.0` → 400, so versions compare as numbers; `4.10` would sort after `4.9`. */
const versionRank = (version: string) => {
  const [major, minor] = version.split('.').map(Number);
  return major * 100 + (minor ?? 0);
};

/**
 * Whether the strongbox offers a set released in `version`. A set with no
 * version on record is one of the oldest, and those are all in it.
 */
export function inStrongbox(version: string | null, through: string) {
  return version === null || versionRank(version) <= versionRank(through);
}

export function adviseArtifactFarm(
  characters: FarmCharacter[],
  domains: ArtifactDomain[],
  config: ArtifactFarmConfig,
  /** The version each set came out in, null for the oldest. */
  versionOf: (setId: number) => string | null,
): ArtifactFarmAdvice {
  const perSetPerRun = config.fiveStarPerRun / 2;
  const strongboxPerRun = config.fiveStarPerRun / config.strongboxCost;

  // Who wants each set. A 2+2 build splits its need between the two sets,
  // so a character counts once in total wherever their pieces come from.
  const demand = new Map<number, { characterId: number; need: number }[]>();
  for (const character of characters) {
    const need = 1 - character.artifacts;
    if (need <= DONE || character.setIds.length === 0) continue;
    for (const setId of new Set(character.setIds)) {
      const list = demand.get(setId) ?? [];
      list.push({ characterId: character.characterId, need: need / character.setIds.length });
      demand.set(setId, list);
    }
  }
  const offered = (setId: number) => inStrongbox(versionOf(setId), config.strongboxThrough);
  const strongboxUseful = [...demand.keys()].some(offered);
  const leftover = strongboxUseful ? perSetPerRun / config.strongboxCost : 0;

  const demandOf = (setId: number): SetDemand => ({
    setId,
    strongbox: offered(setId),
    characters: [...(demand.get(setId) ?? [])].sort((a, b) => b.need - a.need),
  });
  const valueOf = (set: SetDemand) => set.characters.reduce((sum, entry) => sum + entry.need, 0);

  const advised = domains.map((domain): DomainAdvice => {
    const sets: [SetDemand, SetDemand] = [demandOf(domain.setIds[0]), demandOf(domain.setIds[1])];
    const wanted = sets.filter((set) => set.characters.length > 0).length;
    return {
      domain,
      sets,
      value: valueOf(sets[0]) + valueOf(sets[1]),
      usefulPerRun: wanted === 2
        ? config.fiveStarPerRun
        : wanted === 1 ? perSetPerRun + leftover : 0,
    };
  })
    .filter((entry) => entry.value > 0)
    .sort((a, b) => b.value - a.value || b.usefulPerRun - a.usefulPerRun);

  const dropped = new Set(domains.flatMap((domain) => domain.setIds));
  const elsewhere = [...demand.keys()]
    .filter((setId) => !dropped.has(setId))
    .map(demandOf)
    .sort((a, b) => valueOf(b) - valueOf(a));

  return { domains: advised, elsewhere, strongboxPerRun, strongboxUseful, perSetPerRun };
}
