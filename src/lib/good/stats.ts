/**
 * GOOD's stat vocabulary, mapped to the game's own `FIGHT_PROP_*` enum.
 *
 * Nineteen fixed pairs, written by hand. Nothing here derives from a name, and
 * the list only changes if the game adds an element — so generating it would
 * add a build step for no benefit.
 *
 * The trailing underscore marks a percentage: `atk` is flat ATK, `atk_` is ATK
 * percent, and they are different stats on different artifact slots.
 */
export const PROP_BY_GOOD_STAT = {
  hp: 'FIGHT_PROP_HP',
  hp_: 'FIGHT_PROP_HP_PERCENT',
  atk: 'FIGHT_PROP_ATTACK',
  atk_: 'FIGHT_PROP_ATTACK_PERCENT',
  def: 'FIGHT_PROP_DEFENSE',
  def_: 'FIGHT_PROP_DEFENSE_PERCENT',
  eleMas: 'FIGHT_PROP_ELEMENT_MASTERY',
  enerRech_: 'FIGHT_PROP_CHARGE_EFFICIENCY',
  critRate_: 'FIGHT_PROP_CRITICAL',
  critDMG_: 'FIGHT_PROP_CRITICAL_HURT',
  heal_: 'FIGHT_PROP_HEAL_ADD',
  physical_dmg_: 'FIGHT_PROP_PHYSICAL_ADD_HURT',
  anemo_dmg_: 'FIGHT_PROP_WIND_ADD_HURT',
  geo_dmg_: 'FIGHT_PROP_ROCK_ADD_HURT',
  electro_dmg_: 'FIGHT_PROP_ELEC_ADD_HURT',
  hydro_dmg_: 'FIGHT_PROP_WATER_ADD_HURT',
  pyro_dmg_: 'FIGHT_PROP_FIRE_ADD_HURT',
  cryo_dmg_: 'FIGHT_PROP_ICE_ADD_HURT',
  dendro_dmg_: 'FIGHT_PROP_GRASS_ADD_HURT',
} as const satisfies Record<string, string>;

export type GoodStatKey = keyof typeof PROP_BY_GOOD_STAT;

export const GOOD_STAT_KEYS = Object.keys(PROP_BY_GOOD_STAT) as GoodStatKey[];

/** For the GOOD export path, so the user is never locked in. */
export const GOOD_STAT_BY_PROP: Record<string, GoodStatKey> = Object.fromEntries(
  Object.entries(PROP_BY_GOOD_STAT).map(([key, prop]) => [prop, key as GoodStatKey]),
);

/**
 * The ten stats an artifact can actually roll as a substat. Elemental damage,
 * healing bonus and flat base ATK are main stats only, so a substat claiming
 * one of them is a misread rather than a rare piece.
 */
export const SUBSTAT_KEYS: GoodStatKey[] = [
  'hp', 'hp_', 'atk', 'atk_', 'def', 'def_',
  'eleMas', 'enerRech_', 'critRate_', 'critDMG_',
];

const SUBSTAT_PROPS: Set<string> = new Set(
  SUBSTAT_KEYS.map((key) => PROP_BY_GOOD_STAT[key]),
);

export function isRollableSubstat(prop: string) {
  return SUBSTAT_PROPS.has(prop);
}
