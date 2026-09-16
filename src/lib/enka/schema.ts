/**
 * The Enka showcase payload, as returned by
 * `GET https://enka.network/api/uid/<uid>` (no trailing slash, and a descriptive
 * `user-agent` is required).
 *
 * Only the fields this app consumes are declared. Everything here was read off a
 * live response rather than transcribed from docs, so the optional markers
 * reflect what the endpoint actually omits: `avatarInfoList` is absent when the
 * player hides their showcase, and `equipList` entries carry either `weapon` or
 * `reliquary`, never both.
 */

export type EnkaResponse = {
  uid: string;
  ttl?: number;
  region?: string;
  playerInfo: EnkaPlayerInfo;
  /** Absent when the showcase is hidden or empty. */
  avatarInfoList?: EnkaAvatarInfo[];
};

export type EnkaPlayerInfo = {
  nickname?: string;
  level?: number;
  signature?: string;
  worldLevel?: number;
  nameCardId?: number;
  finishAchievementNum?: number;
  towerFloorIndex?: number;
  towerLevelIndex?: number;
  profilePicture?: { id?: number; avatarId?: number; costumeId?: number };
};

export type EnkaAvatarInfo = {
  /** Matches the catalog's character id. */
  avatarId: number;
  /**
   * Which skill set the character uses. Only meaningful for the Traveler, whose
   * store key is `${avatarId}-${skillDepotId}`.
   */
  skillDepotId?: number;
  /** Level (`4001`) and ascension (`1002`) among others, as strings. */
  propMap: Record<string, { type: number; ival?: string; val?: string }>;
  /** Computed stats at the shown build, keyed by numeric fight-prop id. */
  fightPropMap: Record<string, number>;
  /** One entry per unlocked constellation, so its length is the C level. */
  talentIdList?: number[];
  /** Talent level by internal skill id — order comes from the Enka store. */
  skillLevelMap: Record<string, number>;
  /** The +3 constellation bonus, keyed by proud-skill group id. */
  proudSkillExtraLevelMap?: Record<string, number>;
  equipList?: EnkaEquip[];
  fetterInfo?: { expLevel?: number };
};

export type EnkaEquip = EnkaWeaponEquip | EnkaReliquaryEquip;

export type EnkaWeaponEquip = {
  /** Matches the catalog's weapon id. */
  itemId: number;
  weapon: {
    level: number;
    /** Ascension phase, 0-6. */
    promoteLevel?: number;
    /** `{ [affixId]: 0-4 }`, so refinement is the value plus one. */
    affixMap?: Record<string, number>;
  };
  reliquary?: undefined;
  flat: EnkaWeaponFlat;
};

export type EnkaReliquaryEquip = {
  /** The relic *definition* id — rarity and slot variant, not a unique piece. */
  itemId: number;
  reliquary: {
    /** 1-based: 21 is a +20 artifact. */
    level: number;
    mainPropId: number;
    /** One entry per substat roll, in roll order. Repeats mean upgrades. */
    appendPropIdList?: number[];
  };
  weapon?: undefined;
  flat: EnkaReliquaryFlat;
};

export type EnkaStat = { appendPropId: string; statValue: number };

export type EnkaWeaponFlat = {
  nameTextMapHash: string;
  rankLevel: number;
  itemType: 'ITEM_WEAPON';
  icon: string;
  /** Base ATK plus the secondary stat. Percentages come pre-scaled (22.1 = 22.1%). */
  weaponStats: EnkaStat[];
};

export type EnkaReliquaryFlat = {
  nameTextMapHash: string;
  rankLevel: number;
  itemType: 'ITEM_RELIQUARY';
  icon: string;
  equipType: EnkaEquipType;
  /** Matches the catalog's artifact set id. */
  setId: number;
  setNameTextMapHash: string;
  reliquarySubstats?: EnkaStat[];
  reliquaryMainstat: { mainPropId: string; statValue: number };
};

export type EnkaEquipType =
  | 'EQUIP_BRACER'
  | 'EQUIP_NECKLACE'
  | 'EQUIP_SHOES'
  | 'EQUIP_RING'
  | 'EQUIP_DRESS';

export function isReliquary(equip: EnkaEquip): equip is EnkaReliquaryEquip {
  return equip.flat.itemType === 'ITEM_RELIQUARY';
}

export function isWeapon(equip: EnkaEquip): equip is EnkaWeaponEquip {
  return equip.flat.itemType === 'ITEM_WEAPON';
}

/** `propMap` keys worth naming. */
export const ENKA_PROP = {
  ascension: '1002',
  level: '4001',
} as const;

export function propNumber(
  propMap: EnkaAvatarInfo['propMap'],
  key: keyof typeof ENKA_PROP,
) {
  const entry = propMap[ENKA_PROP[key]];
  const raw = entry?.val ?? entry?.ival;
  return raw ? Number(raw) : 0;
}
