/**
 * The five weapon types by a short key — the game's enum lowercased and
 * stripped, because `WEAPON_POLE` in an address bar reads as noise. The roster
 * and the weapons tab filter by these.
 */
export const WEAPONS = ['sword', 'claymore', 'polearm', 'catalyst', 'bow'] as const;
export type WeaponKey = (typeof WEAPONS)[number];

const WEAPON_KEYS: Record<string, WeaponKey> = {
  WEAPON_SWORD_ONE_HAND: 'sword',
  WEAPON_CLAYMORE: 'claymore',
  WEAPON_POLE: 'polearm',
  WEAPON_CATALYST: 'catalyst',
  WEAPON_BOW: 'bow',
};

/** `WEAPON_POLE` → `polearm`. */
export function weaponKey(weaponType: string): WeaponKey | undefined {
  return WEAPON_KEYS[weaponType];
}

/** The game's own glyph for each weapon type, by the roster's short key. */
export const WEAPON_TYPE_ICONS: Record<string, string> = {
  sword: 'UI_GachaTypeIcon_Sword',
  claymore: 'UI_GachaTypeIcon_Claymore',
  polearm: 'UI_GachaTypeIcon_Pole',
  catalyst: 'UI_GachaTypeIcon_Catalyst',
  bow: 'UI_GachaTypeIcon_Bow',
};
