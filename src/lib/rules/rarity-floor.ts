import type { Catalog } from '@/lib/data/catalog';

/**
 * The floor below which nothing is recommended.
 *
 * A three-star weapon and a four-star artifact are stepping stones for an
 * account that has nothing better yet, not a plan. Ranking them next to the
 * real options pushed a Slingshot or an Instructor's piece into lists where
 * the player was choosing what to farm or equip for good, and a recommendation
 * that is always dismissed is noise.
 *
 * Only recommendations: what a character already wears still shows, and a set
 * the player pinned stays theirs.
 */
export const MIN_WEAPON_RARITY = 4;
export const MIN_ARTIFACT_RARITY = 5;

export function isRecommendableWeapon(catalog: Catalog, weaponId: number) {
  return (catalog.weapons.get(weaponId)?.rarity ?? 0) >= MIN_WEAPON_RARITY;
}

/** A set is judged by the best rarity it drops in. */
export function isRecommendableSet(catalog: Catalog, setId: number) {
  return Math.max(0, ...(catalog.artifacts.get(setId)?.rarityList ?? [])) >= MIN_ARTIFACT_RARITY;
}
