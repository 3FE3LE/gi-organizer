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

/**
 * The server a player in this timezone most likely plays on.
 *
 * Read off the zone's offset from UTC at this instant rather than off its
 * name: the continents in IANA names do not follow the game's lines — Dubai
 * is `Asia/` and plays on Europe, Honolulu is `Pacific/` and plays on America
 * — while the offset lands each zone on the server whose clock it sits
 * nearest. West of UTC−2 is America; up to UTC+5 is Europe, Africa and the
 * Middle East; east of that, from India on, is Asia.
 *
 * A guess, and only the starting point: the setting overrides it for anybody
 * who plays on a server away from home. `null` for a zone the runtime does not
 * know, which falls through to `DEFAULT_REGION`.
 */
export function regionForTimeZone(timeZone: string, now: Date = new Date()): GameRegion | null {
  let name: string | undefined;
  try {
    name = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value;
  } catch {
    return null;
  }
  if (!name) return null;

  // "GMT", "GMT-05:00", "GMT+05:30".
  const match = /^GMT(?:([+-])(\d{2}):(\d{2}))?$/.exec(name);
  if (!match) return null;
  const offset = match[1]
    ? (match[1] === '-' ? -1 : 1) * (Number(match[2]) + Number(match[3]) / 60)
    : 0;

  if (offset < -2) return 'america';
  if (offset < 5.5) return 'europe';
  return 'asia';
}

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

/**
 * The next daily reset on this server, as an instant.
 *
 * The start of tomorrow's game day, read on the shifted clock and shifted
 * back — the same two corrections `atGameDay` makes, run in reverse.
 */
export function nextGameReset(now: Date, region: GameRegion): Date {
  const shift = (REGION_OFFSETS[region] - RESET_HOUR) * HOUR;
  const today = new Date(now.getTime() + shift);
  const tomorrow = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1);
  return new Date(tomorrow - shift);
}
