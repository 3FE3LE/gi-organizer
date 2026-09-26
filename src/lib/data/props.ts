/**
 * Stat identifiers (`FIGHT_PROP_*`) are the game's own enum and appear in the
 * generated catalog, in Enka showcase payloads, and in artifact substats. They
 * are the join key for anything stat-shaped, so labels and formatting live here
 * rather than being re-derived per feature.
 */

/** Percentages, by construction of the game's naming plus four exceptions. */
const PERCENT_PROPS = new Set([
  'FIGHT_PROP_CRITICAL',
  'FIGHT_PROP_CRITICAL_HURT',
  'FIGHT_PROP_CHARGE_EFFICIENCY',
  'FIGHT_PROP_HEAL_ADD',
]);

export function isPercentProp(prop: string) {
  return (
    prop.endsWith('_PERCENT') || prop.endsWith('_ADD_HURT') || PERCENT_PROPS.has(prop)
  );
}

/**
 * Two sources, two scales for the same stat:
 *
 *   - `ratio`   as the catalog reports it — 0.24 means 24%.
 *   - `percent` as Enka reports it — 22.1 means 22.1%.
 *
 * Mixing them silently produces values off by 100, so the scale is required
 * rather than guessed.
 */
export type StatScale = 'ratio' | 'percent';

export function formatPropValue(
  prop: string,
  value: number,
  scale: StatScale,
  locale?: string,
) {
  if (!isPercentProp(prop)) {
    return Math.round(value).toLocaleString(locale);
  }

  const percent = scale === 'ratio' ? value * 100 : value;
  return `${percent.toFixed(1)}%`;
}

/**
 * `specialized` is the stat table's name for the ascension bonus.
 * Its actual stat type comes from the character's `substatType` or the weapon's
 * `mainStatType`, so a stat row can only be labelled with that context.
 */
export const ASCENSION_BONUS_KEY = 'specialized';

export type StatRowKey = 'hp' | 'attack' | 'defense' | typeof ASCENSION_BONUS_KEY;

/** Base stats in a generated stat table map onto these prop ids. */
export const STAT_ROW_PROPS: Record<string, string> = {
  hp: 'FIGHT_PROP_HP',
  attack: 'FIGHT_PROP_ATTACK',
  defense: 'FIGHT_PROP_DEFENSE',
};

/**
 * Labels the keys of a generated stat table, resolving `specialized` through
 * the owner's ascension stat type.
 */
export function statRowProp(key: string, ascensionProp: string) {
  return key === ASCENSION_BONUS_KEY ? ascensionProp : (STAT_ROW_PROPS[key] ?? key);
}
