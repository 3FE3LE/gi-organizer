import type { StatTable } from './types';

/**
 * Ordered stat-table keys, as the game presents ascension breakpoints. A `+`
 * suffix means the level after the ascension at that breakpoint.
 */
export const STAT_LEVEL_KEYS = [
  '1', '20', '20+', '40', '40+', '50', '50+',
  '60', '60+', '70', '70+', '80', '80+', '90',
] as const;

export type StatLevelKey = (typeof STAT_LEVEL_KEYS)[number];

/**
 * The two table rows a level sits between, per ascension phase.
 *
 * A stat table only carries the ascension breakpoints, so any level in between
 * has to be read off the pair that brackets it. The phase is what disambiguates
 * level 60: pre-ascension it is `'60'`, post-ascension `'60+'`.
 */
const PHASES: { from: StatLevelKey; to: StatLevelKey; low: number; high: number }[] = [
  { from: '1', to: '20', low: 1, high: 20 },
  { from: '20+', to: '40', low: 20, high: 40 },
  { from: '40+', to: '50', low: 40, high: 50 },
  { from: '50+', to: '60', low: 50, high: 60 },
  { from: '60+', to: '70', low: 60, high: 70 },
  { from: '70+', to: '80', low: 70, high: 80 },
  { from: '80+', to: '90', low: 80, high: 90 },
];

/** The table row for a level, or the row below it when the level is between. */
export function statLevelKey(level: number, ascension: number): StatLevelKey {
  const phase = PHASES[Math.min(Math.max(ascension, 0), PHASES.length - 1)];
  return level >= phase.high ? phase.to : phase.from;
}

/**
 * Stats at an arbitrary level, interpolated between the bracketing rows.
 *
 * HP, ATK and DEF grow on a curve the table does not carry, so a level inside a
 * phase is linear between its two anchors. Over a ten-level phase that is
 * accurate to well under a percent, and exact at every breakpoint — which is
 * where a levelled character usually sits. The ascension bonus (`specialized`)
 * is constant inside a phase, so interpolating it changes nothing.
 */
export function statsAtLevel(
  table: StatTable,
  level: number,
  ascension: number,
): Record<string, number> {
  const phase = PHASES[Math.min(Math.max(ascension, 0), PHASES.length - 1)];
  const low = table[phase.from];
  const high = table[phase.to];
  if (!low) return high ?? {};
  if (!high || level <= phase.low) return low;
  if (level >= phase.high) return high;

  const share = (level - phase.low) / (phase.high - phase.low);
  const interpolated: Record<string, number> = {};
  for (const key of Object.keys(low)) {
    interpolated[key] = low[key] + ((high[key] ?? low[key]) - low[key]) * share;
  }
  return interpolated;
}

/**
 * The ascension a level implies, and whether a stored one is the ascended
 * form of it.
 *
 * Every level has exactly one ascension except the six breakpoints, where the
 * game allows both: level 80 before ascending and level 80 after are different
 * characters with different stats. So the pair is `(level, ascended)`, and a
 * form only has to ask the second part at those six levels.
 */
export function ascensionForLevel(level: number, ascended = false) {
  const phase = PHASES.findIndex((entry) => level <= entry.high);
  const base = phase === -1 ? PHASES.length - 1 : phase;
  return ascended && level === PHASES[base].high && base < PHASES.length - 1
    ? base + 1
    : base;
}

/** Whether a stored ascension is past the breakpoint its level sits on. */
export function isAscended(level: number, ascension: number) {
  return ascension > ascensionForLevel(level, false);
}
