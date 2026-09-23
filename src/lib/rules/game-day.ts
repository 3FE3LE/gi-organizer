import { WEEKDAYS, type Weekday } from './materials';

/**
 * Which day it is *in the game*, which is the only day a domain rotation has
 * an opinion about.
 *
 * Two things make this different from `new Date().getDay()`, and the app got
 * both wrong by asking that question:
 *
 *   - **The clock is the game server's, not the machine's.** The page renders
 *     on a server that keeps UTC, so a player farming at nine at night in
 *     GMT-5 was already being shown tomorrow's domains.
 *   - **The day turns at four in the morning, not at midnight.** A session
 *     that runs past midnight is still the same farming day, and the game
 *     treats it that way.
 *
 * So the day is read off the server's clock shifted back to its own reset, and
 * both corrections are one addition.
 */

/** Each game server's offset from UTC, in hours. */
export const REGION_OFFSETS = {
  america: -5,
  europe: 1,
  asia: 8,
} as const satisfies Record<string, number>;

export type GameRegion = keyof typeof REGION_OFFSETS;

export const GAME_REGIONS = Object.keys(REGION_OFFSETS) as GameRegion[];

export function isGameRegion(value: unknown): value is GameRegion {
  return typeof value === 'string' && (GAME_REGIONS as string[]).includes(value);
}

/**
 * The server the plan is read against when nobody has said which.
 *
 * There is no neutral answer — every instant is some day on one server and
 * another day on the next — so this is a default to be corrected, not a guess
 * that will ever be right for everyone.
 */
export const DEFAULT_REGION: GameRegion = 'america';

/** Daily reset, in the server's own hours. */
export const RESET_HOUR = 4;

const HOUR = 3_600_000;

/**
 * The instant re-expressed so that its UTC calendar fields *are* the game day.
 *
 * Shifting by the region's offset puts it on the server's clock; shifting back
 * by the reset hour makes 03:59 belong to the day before, which is what the
 * game itself does. Every reader below then uses the `getUTC*` accessors, so
 * the machine's own timezone never enters into it.
 */
function atGameDay(now: Date, region: GameRegion): Date {
  return new Date(now.getTime() + (REGION_OFFSETS[region] - RESET_HOUR) * HOUR);
}

/** Today, as the domain schedule means it. */
export function gameWeekday(now: Date, region: GameRegion): Weekday {
  return WEEKDAYS[atGameDay(now, region).getUTCDay()];
}

/**
 * The seven days around today, today in the middle.
 *
 * Centred rather than week-aligned: a calendar that starts on Monday puts
 * Sunday six columns away on a Monday, and the days anyone actually plans are
 * the ones next to the one they are on.
 */
export function gameWeekStrip(
  now: Date,
  region: GameRegion,
): { day: Weekday; date: number }[] {
  const today = atGameDay(now, region);

  return Array.from({ length: 7 }, (_, column) => {
    const date = new Date(today.getTime());
    date.setUTCDate(today.getUTCDate() + column - 3);
    return { day: WEEKDAYS[date.getUTCDay()], date: date.getUTCDate() };
  });
}

/**
 * Today's date on the game server, which is the day a birthday mail arrives.
 */
export function gameDate(now: Date, region: GameRegion): { month: number; day: number } {
  const today = atGameDay(now, region);
  return { month: today.getUTCMonth() + 1, day: today.getUTCDate() };
}
