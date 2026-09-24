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
import { SCALERS } from '@/lib/rules/worth';

/**
 * The box, narrowed.
 *
 * Every control writes to the query string and nothing else, so a view is a
 * URL: the cheap ones are plain links and render without JavaScript, and the
 * two that want a real input — a slider and a set picker — read the same
 * parsers from the client.
 */

export const SORTS = [
  'value', 'potential', 'quality', 'cv', 'rolls', 'level', 'set',
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
  /** The four-level band: 0 is +0–3, 16 is +16–19, 20 is finished. */
  lvl: parseAsInteger,
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
  quality: null, cv: null, lvl: null,
};

/** The bands the level filter offers, one per upgrade. */
export const LEVEL_BANDS = [0, 4, 8, 12, 16, 20] as const;

export function activeCount(filters: ArtifactFilters) {
  return Object.entries(CLEARED).filter(
    ([key, empty]) => filters[key as keyof ArtifactFilters] !== empty,
  ).length;
}
