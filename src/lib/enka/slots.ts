import type { ArtifactSlot } from '@/lib/data/types';

import type { EnkaEquipType } from './schema';

/**
 * Enka reports the slot as the game's equip type. The same mapping is visible in
 * the catalog, where each artifact piece carries a `relicType` — flower is
 * `EQUIP_BRACER`, plume `EQUIP_NECKLACE`, and so on.
 */
export const SLOT_BY_EQUIP_TYPE: Record<EnkaEquipType, ArtifactSlot> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
};

export const EQUIP_TYPE_BY_SLOT: Record<ArtifactSlot, EnkaEquipType> = {
  flower: 'EQUIP_BRACER',
  plume: 'EQUIP_NECKLACE',
  sands: 'EQUIP_SHOES',
  goblet: 'EQUIP_RING',
  circlet: 'EQUIP_DRESS',
};

/** Render and validation order, matching the in-game equipment screen. */
export const ARTIFACT_SLOTS: ArtifactSlot[] = [
  'flower', 'plume', 'sands', 'goblet', 'circlet',
];
