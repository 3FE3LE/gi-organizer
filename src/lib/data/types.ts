/** Shapes emitted by `scripts/build-data.mts`. Keep in sync with that script. */

export type MaterialCost = { id: number; count: number };
export type CostsByPhase = Record<string, MaterialCost[]>;

/** `"80+"` means level 80 after the ascension, `"80"` before it. */
export type StatTable = Record<string, Record<string, number>>;

export type CoreCharacter = {
  id: number;
  rarity: number;
  weaponType: string;
  elementType: string;
  bodyType: string;
  substatType: string;
  associationType: string;
  birthday: string | null;
  version: string;
  icon: string | null;
  sideIcon: string | null;
  gachaSplash: string | null;
  stats: StatTable;
  costs: CostsByPhase;
  talentCosts: CostsByPhase;
};

export type CoreWeapon = {
  id: number;
  rarity: number;
  weaponType: string;
  mainStatType: string;
  baseAtkValue: number;
  version: string;
  icon: string | null;
  awakenIcon: string | null;
  stats: StatTable;
  costs: CostsByPhase;
};

export type ArtifactSlot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';

export type CoreArtifact = {
  id: number;
  rarityList: number[];
  version: string;
  pieces: Partial<Record<ArtifactSlot, { icon: string | null }>>;
};

export type CoreMaterial = {
  id: number;
  category: string;
  sortRank: number;
  /** Empty for most materials, so null rather than a string. */
  version: string | null;
  icon: string | null;
  /** Only the day-gated ones carry these: talent books, weapon materials. */
  domain: string | null;
  days: string[];
};

export type LocalizedCharacter = {
  name: string;
  title: string;
  description: string;
  weaponText: string;
  elementText: string;
  substatText: string;
  constellation: string;
  affiliation: string;
  region: string;
};

export type LocalizedWeapon = {
  name: string;
  description: string;
  weaponText: string;
  mainStatText: string;
  baseStatText: string;
  effectName: string;
  effectTemplateRaw: string;
  refinements: string[];
};

export type LocalizedArtifact = {
  name: string;
  /** Circlet-only sets carry a 1-piece effect instead of 2pc/4pc. */
  effect1Pc: string | null;
  effect2Pc: string | null;
  effect4Pc: string | null;
  pieces: Partial<
    Record<ArtifactSlot, { name: string; relicText: string; description: string }>
  >;
};

export type LocalizedMaterial = {
  name: string;
  description: string;
  typeText: string;
  sources: string[];
  /**
   * The drop domain in this locale. `CoreMaterial.domain` stays English and is
   * the grouping key — a plan grouped by a translated name would regroup when
   * the language changes — so the two are separate fields on purpose.
   */
  domainName: string | null;
};

export type TalentEntry = {
  name: string;
  /** Plain text. `descriptionRaw` keeps the game's `<color=...>` markup. */
  description: string;
  descriptionRaw: string;
  /** Present on combat talents: per-level scaling parameters. */
  attributes?: { labels: string[]; parameters: Record<string, number[]> };
  /** Present on passives: the talent's own art. */
  icon?: string | null;
  /** Present on passives: the ascension phase that unlocks it, 0 for always. */
  unlockAscension?: number;
};

export type CharacterDetailStrings = {
  talents: { combat: TalentEntry[]; passive: TalentEntry[] } | null;
  constellation: { name: string; levels: TalentEntry[] } | null;
};

/** One entry of Enka's skill-ordering table, pruned by `pnpm data:enka`. */
export type EnkaStoreEntry = {
  element: string | null;
  weaponType: string | null;
  sideIcon: string | null;
  /** Ordered skill ids: normal attack, elemental skill, elemental burst. */
  skillOrder: number[];
  /** Skill id to asset name. */
  skills: Record<string, string>;
  /** Skill id to proud-skill group id, which `proudSkillExtraLevelMap` uses. */
  proudMap: Record<string, number>;
  constellationIcons: string[];
};

/** Keyed by `avatarId`, or `avatarId-skillDepotId` for the Traveler. */
export type EnkaStore = Record<string, EnkaStoreEntry>;

export type Meta = {
  gameVersion: string;
  genshinDbVersion: string;
  generatedAt: string;
  locales: string[];
  counts: Record<string, number>;
};

export type ById<T> = Record<string, T>;

/* -------------------------------------------------------------- views --- */

/**
 * A catalog entry is its language-neutral record merged with the strings for one
 * locale. The id stays the identity; only the strings change with the locale.
 */
export type CharacterView = CoreCharacter & LocalizedCharacter;
export type WeaponView = CoreWeapon & LocalizedWeapon;
export type ArtifactView = CoreArtifact & LocalizedArtifact;
export type MaterialView = CoreMaterial & LocalizedMaterial;

/**
 * Reverse indexes precomputed when the catalog is built. Every one of these
 * answers a planning question that would otherwise be a full scan on each call.
 */
export type CatalogIndexes = {
  charactersByElement: Map<string, CharacterView[]>;
  charactersByWeaponType: Map<string, CharacterView[]>;
  /** Candidate weapons for a character, since a character's type is fixed. */
  weaponsByType: Map<string, WeaponView[]>;
  materialsByCategory: Map<string, MaterialView[]>;
  charactersSorted: CharacterView[];
  /** Newest first: the order the roster gallery reads as a timeline. */
  charactersByRelease: CharacterView[];
  weaponsSorted: WeaponView[];
  artifactsSorted: ArtifactView[];
};
