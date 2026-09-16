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
export const VIEWS = ['talento', 'arma'] as const;
export type DomainView = (typeof VIEWS)[number];

export const filterParsers = {
  /** The day being planned. Absent means today, which only the request knows. */
  dia: parseAsStringLiteral(WEEKDAYS),
  /** The team whose members count. Absent means the whole roster. */
  equipo: parseAsString,
  /** Characters picked by hand. Empty means no restriction. */
  pj: parseAsArrayOf(parseAsInteger, ',').withDefault([]),
  /** Kinds of cost counted. Empty means all three. */
  tipo: parseAsArrayOf(parseAsStringLiteral(REASONS), ',').withDefault([]),
  /** Count characters with no stated target, headed for the cap. */
  sinmeta: parseAsBoolean.withDefault(false),
  /** Which of the day's two domain kinds is on screen. */
  ver: parseAsStringLiteral(VIEWS).withDefault('talento'),
};

const load = createLoader(filterParsers);
const serialize = createSerializer(filterParsers);

/**
 * What the pages pass around: the parsed state with the day resolved.
 *
 * `dia` is the one value with no static default — "today" is a fact about the
 * request, not about the schema — so it is filled in here rather than left
 * nullable for every reader to handle.
 */
export type Filters = Omit<inferParserType<typeof filterParsers>, 'dia'> & { dia: Weekday };

export async function loadFilters(
  searchParams: Promise<Record<string, string | string[] | undefined>>,
): Promise<Filters> {
  const parsed = await load(searchParams);
  return { ...parsed, dia: parsed.dia ?? todayName() };
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

/** Today in the game's own week, which starts on Sunday like `Date`. */
export function todayName(): Weekday {
  return WEEKDAYS[new Date().getDay()];
}

/**
 * The seven days around today, today in the middle.
 *
 * Centred rather than week-aligned: a calendar that starts on Monday puts
 * Sunday six columns away on a Monday, and the days anyone actually plans are
 * the ones next to the one they are on.
 */
export function weekStrip(now = new Date()): { day: Weekday; date: number }[] {
  return Array.from({ length: 7 }, (_, column) => {
    const date = new Date(now);
    date.setDate(now.getDate() + column - 3);
    return { day: WEEKDAYS[date.getDay()], date: date.getDate() };
  });
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
