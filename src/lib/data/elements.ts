/**
 * Element accents, keyed by the game's internal enum so a locale change never
 * affects styling.
 */
export const ELEMENT_COLORS: Record<string, string> = {
  ELEMENT_ANEMO: '#74c2a8',
  ELEMENT_GEO: '#f8ba4e',
  ELEMENT_ELECTRO: '#af8ec1',
  ELEMENT_DENDRO: '#a5c83b',
  ELEMENT_HYDRO: '#4cc2f1',
  ELEMENT_PYRO: '#ef7938',
  ELEMENT_CRYO: '#9fd6e3',
  ELEMENT_NONE: '#8c8c8c',
};

export function elementColor(elementType: string) {
  return ELEMENT_COLORS[elementType] ?? ELEMENT_COLORS.ELEMENT_NONE;
}

/**
 * The damage-bonus stat each element carries, so a character's own bonus can be
 * shown without hard-coding the pairing per screen. The prop names predate the
 * public element names — Anemo is `WIND`, Geo is `ROCK`, Dendro is `GRASS`.
 */
const ELEMENT_DAMAGE_PROPS: Record<string, string> = {
  ELEMENT_ANEMO: 'FIGHT_PROP_WIND_ADD_HURT',
  ELEMENT_GEO: 'FIGHT_PROP_ROCK_ADD_HURT',
  ELEMENT_ELECTRO: 'FIGHT_PROP_ELEC_ADD_HURT',
  ELEMENT_DENDRO: 'FIGHT_PROP_GRASS_ADD_HURT',
  ELEMENT_HYDRO: 'FIGHT_PROP_WATER_ADD_HURT',
  ELEMENT_PYRO: 'FIGHT_PROP_FIRE_ADD_HURT',
  ELEMENT_CRYO: 'FIGHT_PROP_ICE_ADD_HURT',
};

/** `null` for the elementless, who have no bonus of their own to show. */
export function elementDamageProp(elementType: string): string | null {
  return ELEMENT_DAMAGE_PROPS[elementType] ?? null;
}
