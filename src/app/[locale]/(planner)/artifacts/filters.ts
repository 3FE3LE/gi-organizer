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
import { CRIT_VALUE_PER_ROLL, TIER_FRACTIONS, TIERS, critRating } from '@/lib/rules/rolls';
import { SCALERS, type Scaler } from '@/lib/rules/worth';

/**
 * The box, narrowed.
 *
 * Every control writes to the query string and nothing else, so a view is a
 * URL: the cheap ones are plain links and render without JavaScript, and the
 * two that want a real input — a slider and a set picker — read the same
 * parsers from the client.
 */

export const SORTS = [
  'value', 'quality', 'cv', 'rolls', 'level', 'set',
] as const satisfies readonly ArtifactSort[];

/**
 * Crit value cut-offs, in whole crit rolls.
 *
 * Round numbers would be arbitrary; roll boundaries are not, and these four are
 * exactly where `critRating` changes its mind. Two and a half rolls is the ~20
 * guides call worth keeping, five is the ~40 they call rare.
 */
const CRIT_ROLL_STEPS = [1.5, 2.5, 4, 5];

export const CRIT_FILTERS = CRIT_ROLL_STEPS.map(
  (rolls) => Math.round(rolls * CRIT_VALUE_PER_ROLL),
);

/**
 * What each cut-off buys, named.
 *
 * A bare `19+` says nothing about whether that is a good piece. The rating the
 * cut-off opens onto does, and it is the same vocabulary the card under it uses.
 */
export const CRIT_STEP_LABELS = CRIT_ROLL_STEPS.map((rolls) => critRating(rolls * CRIT_VALUE_PER_ROLL));

export const HELD = ['free', 'worn'] as const;

/** The tiers a piece's average can be filtered by, worst usable first. */
export const TIER_FILTERS = TIER_FRACTIONS.filter((fraction) => fraction > 0.7);

/** The tier each cut-off lets through, so the chip can name it. */
export function tierAt(fraction: number) {
  return TIERS[TIER_FRACTIONS.indexOf(fraction as (typeof TIER_FRACTIONS)[number])];
}

export const artifactParsers = {
  slot: parseAsStringLiteral(ARTIFACT_SLOTS),
  set: parseAsInteger,
  sub: parseAsString,
  /** The piece's main stat. Not scored — see `worth.ts` — but searched for. */
  main: parseAsString,
  held: parseAsStringLiteral(HELD),
  perfect: parseAsBoolean.withDefault(false),
  /** As a percentage, because a fraction in a URL reads as noise. */
  quality: parseAsInteger,
  /** Minimum crit value, as a whole number. */
  cv: parseAsInteger,
  sort: parseAsStringLiteral(SORTS).withDefault('value'),
  /**
   * Which scaler `value` counts. Not a filter — it never changes which pieces
   * are in the list, only how they are priced — so a reset leaves it alone.
   */
  scaler: parseAsStringLiteral(SCALERS),
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

/** Everything a reset has to clear. `sort` is a view, not a narrowing. */
export const CLEARED: Partial<ArtifactFilters> = {
  slot: null, set: null, sub: null, main: null, held: null, perfect: false,
  quality: null, cv: null,
};

export function activeCount(filters: ArtifactFilters) {
  return Object.entries(CLEARED).filter(
    ([key, empty]) => filters[key as keyof ArtifactFilters] !== empty,
  ).length;
}

export const SLOT_LABELS: Record<string, string> = {
  flower: 'Flor', plume: 'Pluma', sands: 'Arena', goblet: 'Cáliz', circlet: 'Diadema',
};

export const HELD_LABELS: Record<(typeof HELD)[number], string> = {
  free: 'libres', worn: 'equipados',
};

export const SORT_LABELS: Record<ArtifactSort, string> = {
  value: 'valor', quality: 'calidad', cv: 'crit value', rolls: 'rolls',
  level: 'nivel', set: 'set',
};

export const SCALER_LABELS: Record<Scaler, string> = {
  atk: 'ATQ%', hp: 'Vida%', em: 'Maestría', def: 'DEF%',
};
