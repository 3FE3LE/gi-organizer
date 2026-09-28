import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server';

import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import type { ArtifactSort } from '@/lib/player/artifacts';
import { CRIT_VALUE_PER_ROLL, critRating } from '@/lib/rules/rolls';
import {
  MAX_OPTIONAL, MAX_REQUIRED, archetypeProps, type Archetype,
} from '@/lib/rules/archetype';
import { SCALERS, SCALER_PROPS, type Scaler } from '@/lib/rules/worth';

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

export const artifactParsers = {
  slot: parseAsStringLiteral(ARTIFACT_SLOTS),
  set: parseAsInteger,
  /** The build's substats — see `lib/rules/archetype.ts`. Required ones filter. */
  need: parseAsArrayOf(parseAsString, ',').withDefault([]),
  /** Optional: never filters, orders. */
  want: parseAsArrayOf(parseAsString, ',').withDefault([]),
  /** The piece's main stat. Not scored — see `worth.ts` — but searched for. */
  main: parseAsString,
  held: parseAsStringLiteral(HELD),
  /** Minimum crit value, as a whole number. */
  cv: parseAsInteger,
  /**
   * The highest upgrade step shown, with the potential ordering: 8 lets
   * through +0 to +11, the pieces that have rolled at most twice. Absent is no
   * cap.
   */
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
  slot: null, set: null, need: [], want: [], main: null, held: null, cv: null, lvl: null,
};

/** The level cap's steps, one per upgrade; the last is no cap. */
export const LEVEL_CAPS = [0, 4, 8, 12, 16, 20] as const;

export function activeCount(filters: ArtifactFilters) {
  return Object.entries(CLEARED).filter(([key, empty]) => {
    const value = filters[key as keyof ArtifactFilters];
    return Array.isArray(value) ? value.length > 0 : value !== empty;
  }).length;
}

/**
 * The URL's substats as an archetype, capped and without repeats: a
 * hand-edited query must not turn one stat into both a requirement and a
 * bonus, or a third requirement into a filter the controls cannot show.
 */
export function archetypeOf(filters: ArtifactFilters): Archetype {
  const seen = new Set<string>();
  const take = (props: string[], cap: number) => {
    const kept: string[] = [];
    for (const prop of props) {
      if (kept.length === cap || seen.has(prop)) continue;
      seen.add(prop);
      kept.push(prop);
    }
    return kept;
  };

  const required = take(filters.need, MAX_REQUIRED);
  const optional = take(filters.want, MAX_OPTIONAL);

  return { required, optional };
}

/**
 * The scaler a card is priced on. With the build's substats chosen it is the
 * first scaler among them, so a DEF% the build asked for is not greyed out as
 * dead on the very pieces it was required on.
 */
export function pricingScaler(filters: ArtifactFilters): Scaler | null {
  if (!hasArchetype(filters)) return filters.scaler;
  const props = archetypeProps(archetypeOf(filters));
  for (const prop of props) {
    const scaler = SCALERS.find((candidate) => SCALER_PROPS[candidate] === prop);
    if (scaler) return scaler;
  }
  return null;
}

/** Whether the build's substats are in play, which retires the scaler. */
export function hasArchetype(filters: ArtifactFilters) {
  return filters.need.length > 0 || filters.want.length > 0;
}
