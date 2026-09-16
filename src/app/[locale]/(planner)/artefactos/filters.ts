import {
  createLoader,
  createSerializer,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server';

import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import type { ArtifactSort } from '@/lib/player/artifacts';
import { CRIT_VALUE_PER_ROLL, TIER_FRACTIONS } from '@/lib/rules/rolls';

/** The box, narrowed. Every control is a link, so a view is shareable. */

export const SORTS = [
  'calidad', 'cv', 'rolls', 'nivel', 'set',
] as const satisfies readonly ArtifactSort[];

/**
 * Crit value cut-offs, in whole crit rolls.
 *
 * Round numbers would be arbitrary; roll boundaries are not. Two and a half
 * rolls is the ~20 guides call worth keeping, five is the ~40 they call rare.
 */
export const CRIT_FILTERS = [1.5, 2.5, 4, 5].map(
  (rolls) => Math.round(rolls * CRIT_VALUE_PER_ROLL),
);

export const HELD = ['free', 'worn'] as const;

/** The tiers a piece's average can be filtered by, worst usable first. */
export const TIER_FILTERS = TIER_FRACTIONS.filter((fraction) => fraction > 0.7);

export const artifactParsers = {
  slot: parseAsStringLiteral(ARTIFACT_SLOTS),
  set: parseAsInteger,
  sub: parseAsString,
  main: parseAsString,
  rareza: parseAsInteger,
  quien: parseAsStringLiteral(HELD),
  perfectos: parseAsBoolean.withDefault(false),
  /** As a percentage, because a fraction in a URL reads as noise. */
  calidad: parseAsInteger,
  /** Minimum crit value, as a whole number. */
  cv: parseAsInteger,
  orden: parseAsStringLiteral(SORTS).withDefault('calidad'),
};

const load = createLoader(artifactParsers);
const serialize = createSerializer(artifactParsers);

export type ArtifactFilters = inferParserType<typeof artifactParsers>;

export function loadArtifactFilters(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
) {
  return load(searchParams);
}

export function href(
  base: string,
  filters: ArtifactFilters,
  patch: Partial<ArtifactFilters> = {},
) {
  return serialize(base, { ...filters, ...patch });
}

export const SLOT_LABELS: Record<string, string> = {
  flower: 'Flor', plume: 'Pluma', sands: 'Arena', goblet: 'Cáliz', circlet: 'Diadema',
};

export const HELD_LABELS: Record<(typeof HELD)[number], string> = {
  free: 'libres', worn: 'equipados',
};

export const SORT_LABELS: Record<ArtifactSort, string> = {
  calidad: 'calidad', cv: 'crit value', rolls: 'rolls', nivel: 'nivel', set: 'set',
};
