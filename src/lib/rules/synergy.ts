import type { MechanicId } from '@/lib/data/mechanics';
import type { Stacking } from '@/lib/annotations/types';

/**
 * What a team is, over and above four builds.
 *
 * The rest of the engine reports faults: a weapon claimed twice, an aura worn
 * by two people, a role nobody covers. None of that says what the team *does*
 * when it works, and that is the half of a team a player actually assembles
 * for — the resonance the elements buy, the reaction the pair enables, the
 * aura one member's gear hangs over the other three.
 *
 * So this is the positive half, and it is deliberately not diagnostics: there
 * is no severity here and nothing to fix. It is derived, pure and free of
 * language — ids and game enums out, sentences assembled by the screen.
 */

/* ------------------------------------------------------------ resonance --- */

/**
 * Two of an element, and the party gets something for it.
 *
 * Keyed by the element enum rather than by name, so a locale change cannot
 * reach it. The ids are the game's own names for the resonances, which is what
 * the message catalog translates and what a player can search for.
 */
export const RESONANCE_BY_ELEMENT: Record<string, string> = {
  ELEMENT_PYRO: 'fervent-flames',
  ELEMENT_HYDRO: 'soothing-water',
  ELEMENT_CRYO: 'shattering-ice',
  ELEMENT_ELECTRO: 'high-voltage',
  ELEMENT_ANEMO: 'impetuous-winds',
  ELEMENT_GEO: 'enduring-rock',
  ELEMENT_DENDRO: 'sprawling-greenery',
};

/** Four elements, four different: the resonance for a team that has no pair. */
export const CANOPY = 'protective-canopy';

export type Resonance = {
  id: string;
  /** `null` for Protective Canopy, which is nobody's element. */
  elementType: string | null;
  /** Who makes it happen. */
  members: number[];
};

/* ------------------------------------------------------------ mechanics --- */

type Requirement = {
  /** Every one of these has to be on the team. */
  all?: string[];
  /** At least one of these, for the two that react with anything. */
  any?: string[];
  /**
   * Whether the mechanic also needs someone whose own kit brings it. A team of
   * Hydro and Electro makes Electro-Charged by standing there; it makes
   * Lunar-Charged only with a character who carries the Moonsign that turns it
   * into one, and no element check can see that.
   */
  carrier?: boolean;
};

const AURABLE = [
  'ELEMENT_PYRO', 'ELEMENT_HYDRO', 'ELEMENT_ELECTRO', 'ELEMENT_CRYO', 'ELEMENT_DENDRO',
];

/**
 * What each mechanic needs on the field.
 *
 * Only the element side is stated here, because that is the part that is a
 * fact about the team rather than about a character: the reaction table has not
 * changed since 3.0 and does not depend on who is holding what. Everything
 * else — whether a character is any *good* at the mechanic — stays where it
 * already lives, in the tags derived from their own text.
 *
 * A mechanic missing from this table is not element-gated at all: Hexerei,
 * Nightsoul and the Bond of Life are properties of the characters who carry
 * them, and two carriers on one team is the whole synergy.
 */
export const MECHANIC_REQUIREMENTS: Partial<Record<MechanicId, Requirement>> = {
  vaporize: { all: ['ELEMENT_PYRO', 'ELEMENT_HYDRO'] },
  melt: { all: ['ELEMENT_PYRO', 'ELEMENT_CRYO'] },
  overloaded: { all: ['ELEMENT_PYRO', 'ELEMENT_ELECTRO'] },
  'electro-charged': { all: ['ELEMENT_HYDRO', 'ELEMENT_ELECTRO'] },
  superconduct: { all: ['ELEMENT_CRYO', 'ELEMENT_ELECTRO'] },
  swirl: { all: ['ELEMENT_ANEMO'], any: AURABLE },
  crystallize: { all: ['ELEMENT_GEO'], any: AURABLE },
  bloom: { all: ['ELEMENT_DENDRO', 'ELEMENT_HYDRO'] },
  hyperbloom: { all: ['ELEMENT_DENDRO', 'ELEMENT_HYDRO', 'ELEMENT_ELECTRO'] },
  burgeon: { all: ['ELEMENT_DENDRO', 'ELEMENT_HYDRO', 'ELEMENT_PYRO'] },
  burning: { all: ['ELEMENT_DENDRO', 'ELEMENT_PYRO'] },
  quicken: { all: ['ELEMENT_DENDRO', 'ELEMENT_ELECTRO'] },
  aggravate: { all: ['ELEMENT_DENDRO', 'ELEMENT_ELECTRO'] },
  spread: { all: ['ELEMENT_DENDRO', 'ELEMENT_ELECTRO'] },
  // The lunar pair reads as its ordinary reaction until somebody on the team
  // carries a Moonsign, which is a fact about the character, not the elements.
  'lunar-charged': { all: ['ELEMENT_HYDRO', 'ELEMENT_ELECTRO'], carrier: true },
  'lunar-bloom': { all: ['ELEMENT_DENDRO', 'ELEMENT_HYDRO'], carrier: true },
  'stellar-conduct': { carrier: true },
  'stellar-swirl': { all: ['ELEMENT_ANEMO'], carrier: true },
  'stellar-glimmer': { carrier: true },
};

export type MechanicSynergy = {
  id: string;
  /** Every element this needs, in the order the requirement states them. */
  elements: string[];
  /** The ones the team does not field. Empty means the mechanic is live. */
  missing: string[];
  /** Members whose own kit names the mechanic. */
  carriers: number[];
  /** Whether it is live: elements present, and a carrier where one is needed. */
  active: boolean;
  /** Whether the team was assembled for this one. */
  objective: boolean;
};

/* ---------------------------------------------------------------- auras --- */

export type Aura = {
  setId: number;
  /** How many pieces the wearer has on, which decides which bonus is live. */
  pieces: number;
  wearer: number;
  /** Non-stacking only within a partition — Viridescent Venerer's element. */
  partitioned: boolean;
  /** Anyone else on the team wearing the same set at the same threshold. */
  alsoWornBy: number[];
};

/* ---------------------------------------------------------------- input --- */

export type SynergyMember = {
  characterId: number;
  elementType: string;
  /** Mechanic tags this character carries, derived and curated. */
  mechanics: string[];
  /** Sets worn, with how many pieces of each. */
  sets: { setId: number; pieces: number }[];
};

export type TeamSynergy = {
  resonances: Resonance[];
  mechanics: MechanicSynergy[];
  auras: Aura[];
};

/**
 * Everything the team is, as opposed to everything wrong with it.
 *
 * `setStacking` is asked rather than passed as a map because the caller already
 * holds the annotations and there is no reason to copy them: the only question
 * this module has about a set is whether its bonus reaches past its wearer.
 */
export function synergyOf(
  members: SynergyMember[],
  {
    objective,
    setStacking,
    auraAt = () => 4,
  }: {
    /** The mechanic the team is built around, if the player named one. */
    objective?: string | null;
    setStacking: (setId: number) => Stacking | undefined;
    /** See `aurasOf`. */
    auraAt?: (setId: number) => number;
  },
): TeamSynergy {
  return {
    resonances: resonancesOf(members),
    mechanics: mechanicsOf(members, objective ?? null),
    auras: aurasOf(members, setStacking, auraAt),
  };
}

/**
 * The resonance, or the lack of one.
 *
 * Two of an element is the trigger, and it stays the trigger below four
 * members: a pair resonates in a party of two exactly as it does in a party of
 * four, and a team being assembled is worth telling what it already has. The
 * Canopy is the exception and is checked at four, because "four different
 * elements" is not a thing a team of three can be.
 */
export function resonancesOf(members: SynergyMember[]): Resonance[] {
  const byElement = new Map<string, number[]>();
  for (const member of members) {
    if (!(member.elementType in RESONANCE_BY_ELEMENT)) continue;
    byElement.set(member.elementType, [
      ...(byElement.get(member.elementType) ?? []), member.characterId,
    ]);
  }

  const paired = [...byElement]
    .filter(([, holders]) => holders.length >= 2)
    .map(([elementType, holders]): Resonance => ({
      id: RESONANCE_BY_ELEMENT[elementType],
      elementType,
      members: holders,
    }));

  if (paired.length > 0) return paired;

  if (members.length === 4 && byElement.size === 4) {
    return [{
      id: CANOPY,
      elementType: null,
      members: members.map((member) => member.characterId),
    }];
  }

  return [];
}

/**
 * Which mechanics this team can actually produce.
 *
 * Three ways in, and they answer three different questions. A mechanic whose
 * elements are on the field is listed because the team *does* it, whether or
 * not anybody built for it. A mechanic two members both carry is listed because
 * that agreement is the synergy — this is what catches Hexerei and the
 * Nightsoul characters, who share no element requirement at all. And the team's
 * own objective is always listed, even when it cannot fire yet, because a plan
 * that is one element short should say which one.
 */
export function mechanicsOf(members: SynergyMember[], objective: string | null): MechanicSynergy[] {
  const present = new Set(members.map((member) => member.elementType));
  const carriersOf = (id: string) => members
    .filter((member) => member.mechanics.includes(id))
    .map((member) => member.characterId);

  const ids = new Set<string>([
    ...members.flatMap((member) => member.mechanics),
    ...(objective ? [objective] : []),
  ]);

  const synergies: MechanicSynergy[] = [];

  for (const id of ids) {
    const requirement = MECHANIC_REQUIREMENTS[id as MechanicId] ?? {};
    const all = requirement.all ?? [];
    const any = requirement.any ?? [];

    const missing = [
      ...all.filter((element) => !present.has(element)),
      // The "and anything to react with" half of Swirl and Crystallize: one of
      // the list is enough, so it is missing only when none of them is there.
      ...(any.length > 0 && !any.some((element) => present.has(element)) ? ['any'] : []),
    ];

    const carriers = carriersOf(id);
    const active = missing.length === 0 && (!requirement.carrier || carriers.length > 0);
    const isObjective = id === objective;

    // Something with no element gate and one carrier is just that character's
    // kit, not the team's. It is listed once a second member agrees with it, or
    // once the team says it is the point.
    if (!isObjective && all.length === 0 && any.length === 0 && carriers.length < 2) continue;
    if (!isObjective && !active) continue;

    synergies.push({
      id,
      elements: [...all, ...(any.length > 0 ? ['any'] : [])],
      missing,
      carriers,
      active,
      objective: isObjective,
    });
  }

  // The team's objective first, then what is live, then what it is short of —
  // and alphabetically inside each band so the list does not reshuffle itself
  // between renders.
  return synergies.sort((a, b) =>
    Number(b.objective) - Number(a.objective)
    || Number(b.active) - Number(a.active)
    || a.id.localeCompare(b.id));
}

/**
 * The gear one member wears that the other three are standing in.
 *
 * `non-stacking` and `partitioned` are exactly the sets whose effect reaches
 * past the wearer — that is *why* a second wearer would be wasted — so the
 * annotation the duplicate check already depends on is the same one that says
 * which bonuses belong to the team rather than to one build.
 */
export function aurasOf(
  members: SynergyMember[],
  setStacking: (setId: number) => Stacking | undefined,
  /**
   * How many pieces a set needs on before its effect reaches the party. Four
   * for everything with a four-piece bonus, which is every party aura in the
   * game bar the circlet-only sets that carry a single-piece effect instead.
   * Two pieces of Noblesse Oblige is twenty percent burst damage for its
   * wearer and nothing at all for anyone else, and listing it as a team aura
   * would credit the team with a buff that is not there.
   */
  auraAt: (setId: number) => number = () => 4,
): Aura[] {
  const wearers = new Map<number, number[]>();
  for (const member of members) {
    for (const set of member.sets) {
      if (set.pieces < auraAt(set.setId)) continue;
      wearers.set(set.setId, [...(wearers.get(set.setId) ?? []), member.characterId]);
    }
  }

  const auras: Aura[] = [];

  for (const member of members) {
    for (const set of member.sets) {
      if (set.pieces < auraAt(set.setId)) continue;
      const stacking = setStacking(set.setId);
      if (stacking !== 'non-stacking' && stacking !== 'partitioned') continue;

      auras.push({
        setId: set.setId,
        pieces: set.pieces,
        wearer: member.characterId,
        partitioned: stacking === 'partitioned',
        alsoWornBy: (wearers.get(set.setId) ?? [])
          .filter((characterId) => characterId !== member.characterId),
      });
    }
  }

  // Four pieces before two: the bigger claim on the same set is the one worth
  // reading first.
  return auras.sort((a, b) => b.pieces - a.pieces || a.setId - b.setId);
}
