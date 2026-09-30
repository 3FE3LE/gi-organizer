import { progressLevel } from '@/lib/data/stats';
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
  /**
   * Current level over the level aimed at, capped at one, with the ascension
   * counted on both sides: a character at 80 aimed at 80+ still has an
   * ascension to pay for, and a full ring said otherwise. Null when out of the
   * plan.
   */
  level: number | null;
  /** Whether any talent is still short of where it is headed. */
  talentsShort: boolean;
  /**
   * Each talent on its own: reached its target or not. One colour for the
   * three hid which one was short — a normal attack left at 1 on purpose read
   * as unfinished next to a skill that really was.
   */
  talentsMet: { auto: boolean; skill: boolean; burst: boolean } | null;
  /** Whether a talent book they still need drops from a domain open today. */
  booksToday: boolean;
};

export function cardProgress(
  entry: {
    level: number;
    ascension: number;
    talent: Talents;
    target: { level: number | null; ascension: number | null; talents: Talents | null };
    dismissedAt: string | null;
  },
  /** The days the character's talent books drop, read off the catalog. */
  bookDays: ReadonlySet<string>,
  today: Weekday,
): CardProgress {
  if (entry.dismissedAt) {
    return { level: null, talentsShort: false, talentsMet: null, booksToday: false };
  }

  const targetLevel = progressLevel(
    entry.target.level ?? ASSUMED_TARGET.level,
    entry.target.ascension ?? ASSUMED_TARGET.ascension,
  );
  const level = progressLevel(entry.level, entry.ascension);
  const talents = entry.target.talents ?? ASSUMED_TARGET.talents;
  const talentsMet = {
    auto: entry.talent.auto >= talents.auto,
    skill: entry.talent.skill >= talents.skill,
    burst: entry.talent.burst >= talents.burst,
  };
  const talentsShort = !talentsMet.auto || !talentsMet.skill || !talentsMet.burst;

  return {
    level: targetLevel > 0 ? Math.min(1, level / targetLevel) : 1,
    talentsShort,
    talentsMet,
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
