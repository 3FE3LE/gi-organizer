import type { RollQuality } from './rolls';

/**
 * A build's substats, as the search for pieces for it is actually phrased.
 *
 * "Best for DEF" priced every piece on crit first and the named scaler second,
 * so a DEF search opened on five pieces with no DEF on them at all. The
 * question is narrower than a weighting can say: this build *needs* DEF% and
 * recharge, and would like crit on top. So it is said in those terms:
 *
 *   - **required** — up to two. A piece without every one is not listed.
 *   - **optional** — up to two. Never filters; a piece with both leads.
 *
 * A piece has four substat lines and the required take two of them, so the
 * optionals compete for the two that are left.
 */
export type Archetype = {
  required: string[];
  optional: string[];
};

export const MAX_REQUIRED = 2;
export const MAX_OPTIONAL = 2;

export function isEmptyArchetype(archetype: Archetype) {
  return archetype.required.length === 0 && archetype.optional.length === 0;
}

/** Every substat the archetype names, required first. */
export function archetypeProps(archetype: Archetype) {
  return [...archetype.required, ...archetype.optional];
}

/** Whether a piece carries every required substat. The locked line counts. */
export function meetsArchetype(props: Set<string>, archetype: Archetype) {
  return archetype.required.every((prop) => props.has(prop));
}

/**
 * How many of the optionals a piece carries: 2, 1 or 0, best first. With the
 * required ones always present, that is four, three or two matches.
 */
export function archetypeFit(props: Set<string>, archetype: Archetype) {
  return archetype.optional.filter((prop) => props.has(prop)).length;
}

/**
 * Top rolls that landed in the substats the archetype names — the tiebreak
 * between two pieces that fit equally, and the reason a +20 that rolled into
 * the build beats one that rolled into crit it did not ask for.
 */
export function archetypeRolls(substats: RollQuality[], archetype: Archetype) {
  const named = new Set(archetypeProps(archetype));
  return substats.reduce((total, entry) => total + (named.has(entry.prop) ? entry.rolls : 0), 0);
}
