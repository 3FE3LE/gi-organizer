/**
 * The GOOD envelope, as Inventory Kamera and Genshin Optimizer write it.
 *
 * Declared from a real Inventory Kamera 1.4.5 export (`format: "GOOD"`,
 * `version: 3`), so the optional markers reflect what the file actually omits
 * rather than what the format permits.
 *
 * Everything here is `unknown`-adjacent by design: this is the shape of a file
 * a user uploaded, and `parse.ts` is what turns it into something trusted.
 */

/** Versions this importer understands. */
export const SUPPORTED_VERSIONS = [1, 2, 3] as const;

/** Caps applied before any per-item work, so a hostile file cannot melt a request. */
export const LIMITS = {
  bytes: 8 * 1024 * 1024,
  artifacts: 5000,
  weapons: 2000,
  characters: 200,
  substats: 8,
} as const;

export const GOOD_SLOTS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const;

export type GoodEnvelope = {
  format?: unknown;
  version?: unknown;
  source?: unknown;
  characters?: unknown;
  weapons?: unknown;
  artifacts?: unknown;
  /**
   * Non-spec keys seen in the wild and deliberately ignored:
   * `kamera_version`, and a `materials` map keyed by item name — whose names
   * collide in the catalog, so materials stay out of scope.
   */
  [key: string]: unknown;
};

/**
 * `location` is not a display name. It is the same PascalCase character key
 * used by `characters[].key`, plus `Traveler` / `TravelerM` / `TravelerF` for
 * the Traveler, and the empty string for an unequipped item.
 */
export const TRAVELER_LOCATIONS = new Set(['Traveler', 'TravelerM', 'TravelerF']);
