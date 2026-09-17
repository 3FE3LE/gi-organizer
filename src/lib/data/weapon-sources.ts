/**
 * How a weapon can be obtained, for the weapons where that is knowable.
 *
 * `genshin-db` does not carry it — a weapon record is id, rarity, type, stats,
 * costs and version — so this is curated by hand in
 * `src/data/curated/weapon-sources.json` and deliberately incomplete.
 *
 * The incompleteness is safe in one direction only, which is why the default
 * matters: an unlisted weapon counts as unobtainable, so the planner suggests
 * it only when the player already owns a spare copy. Listing a weapon can add
 * a candidate; forgetting one can never invent an impossible plan.
 *
 * The distinction the player asked for: an artifact piece is farmable, so a
 * plan may name a set they do not have yet. A weapon from an inactive banner
 * is not, so a plan that names one is a plan they cannot execute.
 */

export type WeaponSource = 'forge' | 'battlepass' | 'starglitter' | 'event';

export type WeaponSourceEntry = { source: WeaponSource; name: string };

/**
 * Whether a weapon can still be worked towards without a banner.
 *
 * Forging and the battle pass are always open. Starglitter is a shop the player
 * may or may not want to spend on, and an event weapon is only obtainable while
 * its event runs — both are listed so the reason can be shown, and both count
 * as reachable only when a copy is already owned.
 */
export function isAlwaysReachable(source: WeaponSource | undefined) {
  return source === 'forge' || source === 'battlepass';
}
