/**
 * Icon filenames in the catalog are the game's internal asset names
 * (`UI_AvatarIcon_Ambor`, `UI_RelicIcon_15001_4`), and no single fan host serves
 * all of them. Measured coverage, per host:
 *
 *   - **Enka** (`enka.network/ui/<name>.png`) — flat, one path for every kind.
 *     Has avatar icons, side icons, gacha art, weapons (including `_Awaken`) and
 *     relics. Missing a large share of material icons.
 *   - **Project Amber** (`gi.yatta.moe/assets/UI/<name>.png`) — has the material
 *     icons Enka lacks, plus avatars, splashes and weapons. No side icons, no
 *     `_Awaken` weapons, and relics live under a `reliquary/` subpath.
 *
 * So the host is chosen per asset kind rather than globally. Both hosts are
 * needed either way: side icons exist only on Enka, most materials only on
 * Amber. `pnpm data:check-assets` re-measures this and fails on a regression.
 */
const HOSTS = {
  enka: 'https://enka.network/ui',
  amber: 'https://gi.yatta.moe/assets/UI',
} as const;

/**
 * Intrinsic source size and host per asset kind. `next/image` needs real
 * dimensions to reserve layout, and passing the render size instead of the
 * source size makes the optimizer fetch a variant larger than needed.
 */
const ASSETS = {
  /** Square portrait icon, used in grids. */
  avatar: { host: 'enka', width: 256, height: 256 },
  /** Wide bust used in rosters and team slots. Enka only. */
  avatarSide: { host: 'enka', width: 132, height: 132 },
  /** Full gacha art. Large — never render it in a list. */
  splash: { host: 'enka', width: 2048, height: 1024 },
  weapon: { host: 'enka', width: 256, height: 256 },
  /** Refined weapon art. Enka only. */
  weaponAwaken: { host: 'enka', width: 256, height: 256 },
  relic: { host: 'enka', width: 256, height: 256 },
  /** Amber, which has the names Enka is missing. */
  material: { host: 'amber', width: 256, height: 256 },
  /**
   * Talent icons (`Skill_S_Lisa_01`). Character skills are served at 100px and
   * the shared normal-attack icons at 128px, so the larger of the two is
   * declared: a source smaller than the declared size is never upscaled by the
   * optimizer, an undersized declaration would cap the sharp ones.
   */
  talent: { host: 'enka', width: 128, height: 128 },
  /** Constellation icons (`UI_Talent_S_Lisa_01`). Enka only. */
  constellation: { host: 'enka', width: 100, height: 100 },
} as const satisfies Record<
  string,
  { host: keyof typeof HOSTS; width: number; height: number }
>;

export type AssetKind = keyof typeof ASSETS;

export function assetSize(kind: AssetKind) {
  const { width, height } = ASSETS[kind];
  return { width, height };
}

/**
 * Asset names are immutable: a patch adds names, it never repoints an existing
 * one. That is what makes the year-long image cache TTL in `next.config.ts`
 * safe.
 */
export function iconUrl(filename: string | null | undefined, kind: AssetKind) {
  if (!filename) return null;
  return `${HOSTS[ASSETS[kind].host]}/${filename}.png`;
}

/** Hosts to allowlist in `next.config.ts`. */
export const ASSET_HOSTS = HOSTS;
