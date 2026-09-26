import { ASSUMED_TARGET, type Weekday } from '@/lib/rules/materials';

/**
 * What a roster card says about where a character is headed.
 *
 * Read against the target the player wrote, and against the cap where they
 * wrote none — the same assumption the plan makes, so the ring on a card and
 * the demand in the plan are the same answer. Somebody taken out of the plan
 * is headed nowhere, and gets no ring and no "today".
 */

type Talents = { auto: number; skill: number; burst: number };

export type CardProgress = {
  /** Current level over the level aimed at, capped at one. Null when out of the plan. */
  level: number | null;
  /** Whether a talent is still short of where it is headed. */
  talentsShort: boolean;
  /** Whether a talent book they still need drops from a domain open today. */
  booksToday: boolean;
};

export function cardProgress(
  entry: {
    level: number;
    talent: Talents;
    target: { level: number | null; talents: Talents | null };
    dismissedAt: string | null;
  },
  /** The days the character's talent books drop, read off the catalog. */
  bookDays: ReadonlySet<string>,
  today: Weekday,
): CardProgress {
  if (entry.dismissedAt) return { level: null, talentsShort: false, booksToday: false };

  const targetLevel = entry.target.level ?? ASSUMED_TARGET.level;
  const talents = entry.target.talents ?? ASSUMED_TARGET.talents;
  const talentsShort = entry.talent.auto < talents.auto
    || entry.talent.skill < talents.skill
    || entry.talent.burst < talents.burst;

  return {
    level: targetLevel > 0 ? Math.min(1, entry.level / targetLevel) : 1,
    talentsShort,
    booksToday: talentsShort && bookDays.has(today),
  };
}

/** Every weekday a character's talent materials drop, from their cost table. */
export function talentBookDays(
  talentCosts: Record<string, { id: number }[]>,
  daysOf: (materialId: number) => readonly string[] | undefined,
): Set<string> {
  const days = new Set<string>();
  for (const items of Object.values(talentCosts)) {
    for (const item of items) for (const day of daysOf(item.id) ?? []) days.add(day);
  }
  return days;
}
