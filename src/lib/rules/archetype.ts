import type { RollQuality } from './rolls';

/**
 * A build's substats, as the search for pieces for it is actually phrased.
 *
 * "Best for DEF" priced every piece on crit first and the named scaler second,
 * so a DEF search opened on five pieces with no DEF on them at all. The
 * question is narrower than a weighting can say: this build *needs* DEF% and
 * recharge, would like crit on top, and can live with ATK% in place of either
 * crit line. So it is said in those terms:
 *
 *   - **required** — up to two. A piece without every one is not listed.
 *   - **optional** — up to two. Never filters; a piece with both leads.
 *   - **wildcard** — one. Stands in for either optional, never for both.
 *
 * A piece has four substat lines and the required take two of them, so two
 * lines are left for the rest to compete for. That is why the wildcard is a
 * substitute and not a fifth optional: with both optionals on the piece there
 * is no line left for it.
 */
export type Archetype = {
  required: string[];
  optional: string[];
  wildcard: string | null;
};

export const MAX_REQUIRED = 2;
export const MAX_OPTIONAL = 2;

export function isEmptyArchetype(archetype: Archetype) {
  return archetype.required.length === 0
    && archetype.optional.length === 0
    && archetype.wildcard === null;
}

/** Every substat the archetype names, required first. */
export function archetypeProps(archetype: Archetype) {
  return [
    ...archetype.required,
    ...archetype.optional,
    ...(archetype.wildcard === null ? [] : [archetype.wildcard]),
  ];
}

/** Whether a piece carries every required substat. The locked line counts. */
export function meetsArchetype(props: Set<string>, archetype: Archetype) {
  return archetype.required.every((prop) => props.has(prop));
}

/**
 * How well a piece's remaining lines fit, best first:
 *
 *   4 — both optionals
 *   3 — one optional and the wildcard
 *   2 — one optional
 *   1 — the wildcard alone
 *   0 — none of them
 */
export function archetypeFit(props: Set<string>, archetype: Archetype) {
  const optionals = archetype.optional.filter((prop) => props.has(prop)).length;
  const wildcard = archetype.wildcard !== null && props.has(archetype.wildcard);

  if (optionals >= 2) return 4;
  if (optionals === 1) return wildcard ? 3 : 2;
  return wildcard ? 1 : 0;
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
