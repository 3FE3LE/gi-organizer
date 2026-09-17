import {
  createLoader,
  createSerializer,
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type inferParserType,
} from 'nuqs/server';

import { WEEKDAYS, type Reason, type Weekday } from '@/lib/rules/materials';

/**
 * The filters, as they live in the URL.
 *
 * Every one of them is a link rather than a control: the pages are server
 * components, the state is five scalars, and a bookmarked "solo el equipo mono
 * anemo, solo talentos" is worth more than a dropdown that forgets.
 *
 * The parsers below are the single definition of that state. `loadFilters`
 * reads it on the way in and `serializeFilters` writes it on the way out, so a
 * key can no longer be parsed one way and rebuilt another — which is exactly
 * what a hand-rolled pair of functions drifts into.
 */

export const REASONS = ['ascension', 'talent', 'weapon'] as const satisfies readonly Reason[];

/** Talent books and weapon materials are two runs, so they are two tabs. */
export const VIEWS = ['talent', 'weapon'] as const;
export type DomainView = (typeof VIEWS)[number];

/**
 * One day's rotation, or the whole backlog behind it — the two questions the
 * page used to answer as two separate routes.
 */
export const RANGES = ['day', 'all'] as const;
export type PlanRange = (typeof RANGES)[number];

export const filterParsers = {
  /** The day being planned. Absent means today, which only the request knows. */
  day: parseAsStringLiteral(WEEKDAYS),
  /** "day": today's rotation, compact. "all": the full backlog, by domain. */
  range: parseAsStringLiteral(RANGES).withDefault('day'),
  /** The team whose members count. Absent means the whole roster. */
  team: parseAsString,
  /** Characters picked by hand. Empty means no restriction. */
  chars: parseAsArrayOf(parseAsInteger, ',').withDefault([]),
  /** Kinds of cost counted. Empty means all three. */
  reason: parseAsArrayOf(parseAsStringLiteral(REASONS), ',').withDefault([]),
  /**
   * Count characters with no stated target, headed for the cap.
   *
   * On, because that is where the demand is: an account nobody has written
   * targets for still has a roster to level, and answering "you have not said"
   * left the plan empty for exactly the person who needed it most. Turning it
   * off narrows to the goals actually written down.
   */
  assume: parseAsBoolean.withDefault(true),
  /** Which of the day's two domain kinds is on screen. */
  view: parseAsStringLiteral(VIEWS).withDefault('talent'),
};

const load = createLoader(filterParsers);
const serialize = createSerializer(filterParsers);

/**
 * What the pages pass around: the parsed state with the day resolved.
 *
 * `day` is the one value with no static default — "today" is a fact about the
 * request and the player's game server, not about the schema — so it is filled
 * in by the caller, which is the only place that knows both. See
 * `@/lib/rules/game-day`.
 */
export type Filters = Omit<inferParserType<typeof filterParsers>, 'day'> & { day: Weekday };

export async function loadFilters(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
  today: Weekday,
): Promise<Filters> {
  const parsed = await load(searchParams);
  return { ...parsed, day: parsed.day ?? today };
}

/** The same filters back as a link, with one value changed. */
export function href(base: string, filters: Filters, patch: Partial<Filters> = {}) {
  return serialize(base, { ...filters, ...patch });
}

/** Toggling a value in one of the list filters, since every chip does it. */
export function toggle<T>(values: readonly T[], value: T): T[] {
  return values.includes(value)
    ? values.filter((entry) => entry !== value)
    : [...values, value];
}

/* ------------------------------------------------------------- wording --- */

export const REASON_LABEL: Record<Reason, string> = {
  ascension: 'ascenso', talent: 'talentos', weapon: 'arma',
};

export const DAY_LABEL: Record<Weekday, string> = {
  Sunday: 'domingo', Monday: 'lunes', Tuesday: 'martes', Wednesday: 'miércoles',
  Thursday: 'jueves', Friday: 'viernes', Saturday: 'sábado',
};

export const DAY_SHORT: Record<Weekday, string> = {
  Sunday: 'DO', Monday: 'LU', Tuesday: 'MA', Wednesday: 'MI',
  Thursday: 'JU', Friday: 'VI', Saturday: 'SA',
};
