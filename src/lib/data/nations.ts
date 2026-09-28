/**
 * The nation a boss stands in, for the boss drops on the plan.
 *
 * The catalog does not carry it — a material record is id, category, rank,
 * icon and version, and the boss that drops it has no region either — so it is
 * curated by hand in `src/data/curated/boss-nations.json`. Reading it off the
 * characters who use a drop does not work: Lightning Prism levels Keqing and
 * Beidou as well as Fischl and Razor, and the later drops go to whoever the
 * patch needed.
 *
 * In the order the journey reaches them, which is the order the plan lists
 * them in.
 */
export const NATIONS = [
  'mondstadt', 'liyue', 'inazuma', 'sumeru', 'fontaine', 'natlan', 'nodKrai', 'snezhnaya',
] as const;

export type Nation = (typeof NATIONS)[number];

export function isNation(value: unknown): value is Nation {
  return typeof value === 'string' && (NATIONS as readonly string[]).includes(value);
}
