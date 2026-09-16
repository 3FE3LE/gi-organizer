/**
 * Display stat names as the community build lists write them, mapped to the
 * game's own `FIGHT_PROP_*` enum.
 *
 * A `/` separates alternatives — `"CRIT Rate / CRIT DMG"` means either is a
 * fine main stat — so a slot resolves to a list, not a single prop.
 *
 * The aliases at the bottom are typos in the upstream lists. They are spelled
 * out rather than fuzzy-matched, so a new one shows up in the import report as
 * unknown instead of being silently guessed at.
 */
export const PROP_BY_DISPLAY: Record<string, string> = {
  'ATK': 'FIGHT_PROP_ATTACK',
  'ATK%': 'FIGHT_PROP_ATTACK_PERCENT',
  'HP': 'FIGHT_PROP_HP',
  'HP%': 'FIGHT_PROP_HP_PERCENT',
  'DEF': 'FIGHT_PROP_DEFENSE',
  'DEF%': 'FIGHT_PROP_DEFENSE_PERCENT',
  'Elemental Mastery': 'FIGHT_PROP_ELEMENT_MASTERY',
  'Energy Recharge': 'FIGHT_PROP_CHARGE_EFFICIENCY',
  'CRIT Rate': 'FIGHT_PROP_CRITICAL',
  'CRIT DMG': 'FIGHT_PROP_CRITICAL_HURT',
  'Healing Bonus': 'FIGHT_PROP_HEAL_ADD',
  'Physical DMG': 'FIGHT_PROP_PHYSICAL_ADD_HURT',
  'Pyro DMG': 'FIGHT_PROP_FIRE_ADD_HURT',
  'Hydro DMG': 'FIGHT_PROP_WATER_ADD_HURT',
  'Cryo DMG': 'FIGHT_PROP_ICE_ADD_HURT',
  'Electro DMG': 'FIGHT_PROP_ELEC_ADD_HURT',
  'Anemo DMG': 'FIGHT_PROP_WIND_ADD_HURT',
  'Geo DMG': 'FIGHT_PROP_ROCK_ADD_HURT',
  'Dendro DMG': 'FIGHT_PROP_GRASS_ADD_HURT',

  // Upstream typos, listed so they resolve without loosening the matcher.
  'Elemental Master': 'FIGHT_PROP_ELEMENT_MASTERY',
  'Energy Rechage': 'FIGHT_PROP_CHARGE_EFFICIENCY',
  'Crit Rate': 'FIGHT_PROP_CRITICAL',
  'Crit DMG': 'FIGHT_PROP_CRITICAL_HURT',
  'DMG': 'FIGHT_PROP_CRITICAL_HURT',
};

/** `Any` is a placeholder for "no preference", not a stat. */
const IGNORED = new Set(['Any', '']);

export type StatParse = { props: string[]; unknown: string[] };

/** Turns one slot's display string into the props that satisfy it. */
export function parseStatPriority(display: string): StatParse {
  const props: string[] = [];
  const unknown: string[] = [];

  for (const part of display.split('/').map((token) => token.trim())) {
    if (IGNORED.has(part)) continue;

    const prop = PROP_BY_DISPLAY[part];
    if (prop) {
      if (!props.includes(prop)) props.push(prop);
    } else {
      unknown.push(part);
    }
  }

  return { props, unknown };
}
