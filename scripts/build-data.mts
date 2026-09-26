/**
 * Build-time data pipeline.
 *
 * Reads Project Amber's responses from `.cache/yatta` (downloaded by
 * `pnpm data:yatta`) and emits two kinds of artifact:
 *
 *   - `core/*.json`   language-neutral records keyed by the game's internal id.
 *                     Stats, costs, rarities and asset filenames live here.
 *   - `i18n/<locale>/*.json`  localized strings for the same ids.
 *
 * Keeping them apart means a locale switch never invalidates an id and the
 * server only reads the strings for the language it renders.
 *
 * Amber is the one source. The catalog used to come from `genshin-db`, which
 * regenerated a character only in the patch that introduced them — 6.7's
 * rework of Beidou, Diona and Wriothesley and 6.2's Hexerei passives never
 * reached it — so everything here reads Amber, and the few things Amber does
 * not carry are the game's own fixed words and dates, written down below
 * rather than borrowed from a second dataset.
 *
 * Run with `pnpm data:build`. It reads only the cache, so it needs no network
 * and gives the same output for the same cache. Output is committed so that
 * `next build` never depends on a third party at all.
 */
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { plainText } from '../src/lib/data/game-text.ts';
import {
  assertNoLenientCollision,
  buildKeyMap,
} from '../src/lib/good/derive.ts';
import { LOCALES, type Locale } from '../src/lib/data/locales.ts';
import { type MechanicIndex, tagsIn } from '../src/lib/data/mechanics.ts';

const ROOT = path.join(import.meta.dirname, '..');
const CACHE = path.join(ROOT, '.cache', 'yatta');
const OUT = path.join(ROOT, 'src', 'generated', 'data');

/* ----------------------------------------------------------- the cache --- */

type AmberList<T> = { data: { items: Record<string, T>; props?: Record<string, string>; types?: Record<string, string> } };
type Amber<T> = { data: T };

async function readJson<T>(relative: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(CACHE, relative), 'utf8')) as T;
  } catch {
    return null;
  }
}

async function detail<T>(amber: string, kind: string, id: string): Promise<T | null> {
  return (await readJson<Amber<T>>(`${amber}/${kind}/${id}.json`))?.data ?? null;
}

async function idsIn(amber: string, kind: string) {
  const files = await readdir(path.join(CACHE, amber, kind)).catch(() => []);
  return files.filter((file) => file.endsWith('.json')).map((file) => file.slice(0, -5));
}

/* ------------------------------------------------------- Amber's shapes --- */

type Prop = { propType: string; initValue: number; type: string };
type Promote = {
  promoteLevel: number;
  costItems?: Record<string, number> | null;
  coinCost?: number;
  unlockMaxLevel?: number;
  addProps?: Record<string, number>;
};

type AmberTalent = {
  type: number;
  name: string;
  description: string;
  icon: string;
  promote?: Record<string, {
    level: number;
    description?: string[];
    params?: number[];
    costItems?: Record<string, number> | null;
    coinCost?: number;
  }>;
};

type AmberAvatar = {
  id: number;
  rank: number;
  name: string;
  element: string | null;
  weaponType: string;
  region: string;
  specialProp: string;
  bodyType: string;
  icon: string;
  birthday: [number, number];
  release: number;
  fetter: { title: string; detail: string; constellation: string; native: string };
  upgrade: { prop: Prop[]; promote: Promote[] };
  talent?: Record<string, AmberTalent> | null;
  constellation?: Record<string, { name: string; description: string; icon: string }> | null;
};

type AmberWeapon = {
  id: number;
  rank: number;
  type: string;
  name: string;
  description: string;
  specialProp: string;
  icon: string;
  affix?: Record<string, { name: string; upgrade: Record<string, string> }> | null;
  upgrade: { prop: Prop[]; promote: Promote[] };
};

type AmberSet = {
  id: number;
  name: string;
  levelList: number[];
  affixList: Record<string, string>;
  suit: Record<string, { name: string; description: string; icon: string }>;
};

type AmberMaterial = {
  name: string;
  description: string;
  type: string;
  rank: number;
  icon: string;
  recipe?: Record<string, Record<string, { count: number; rank: number }>> | null;
  source?: { name: string; type: string; days?: string[] }[] | null;
};

type AmberMaterialItem = { id: number; name: string; type: string; rank: number; icon: string };

type Curves = Record<string, { curveInfos: Record<string, number> }>;
type Changelog = Record<string, { version: string; items: Record<string, (string | number)[]> }>;

/* ------------------------------------------------ what Amber leaves out --- */

/**
 * The seven elements' names. Amber keys an element by the game's internal word
 * (`Electric`) and never prints it; these are the game's own names for them,
 * fixed since 1.0 and the same in every patch.
 */
const ELEMENTS: Record<string, string> = {
  Fire: 'ELEMENT_PYRO',
  Water: 'ELEMENT_HYDRO',
  Wind: 'ELEMENT_ANEMO',
  Electric: 'ELEMENT_ELECTRO',
  Grass: 'ELEMENT_DENDRO',
  Ice: 'ELEMENT_CRYO',
  Rock: 'ELEMENT_GEO',
};

const ELEMENT_NAMES: Record<Locale, Record<string, string>> = {
  es: {
    ELEMENT_PYRO: 'Pyro', ELEMENT_HYDRO: 'Hydro', ELEMENT_ANEMO: 'Anemo', ELEMENT_ELECTRO: 'Electro',
    ELEMENT_DENDRO: 'Dendro', ELEMENT_CRYO: 'Cryo', ELEMENT_GEO: 'Geo', ELEMENT_NONE: 'Ninguno',
  },
  en: {
    ELEMENT_PYRO: 'Pyro', ELEMENT_HYDRO: 'Hydro', ELEMENT_ANEMO: 'Anemo', ELEMENT_ELECTRO: 'Electro',
    ELEMENT_DENDRO: 'Dendro', ELEMENT_CRYO: 'Cryo', ELEMENT_GEO: 'Geo', ELEMENT_NONE: 'None',
  },
  ja: {
    ELEMENT_PYRO: '炎', ELEMENT_HYDRO: '水', ELEMENT_ANEMO: '風', ELEMENT_ELECTRO: '雷',
    ELEMENT_DENDRO: '草', ELEMENT_CRYO: '氷', ELEMENT_GEO: '岩', ELEMENT_NONE: '無',
  },
  'zh-Hans': {
    ELEMENT_PYRO: '火', ELEMENT_HYDRO: '水', ELEMENT_ANEMO: '风', ELEMENT_ELECTRO: '雷',
    ELEMENT_DENDRO: '草', ELEMENT_CRYO: '冰', ELEMENT_GEO: '岩', ELEMENT_NONE: '无',
  },
};

/** The two Travelers' names, which Amber leaves blank on one body and generic on the other. */
const TRAVELER_NAMES: Record<Locale, Record<number, string>> = {
  es: { 10000005: 'Éter', 10000007: 'Lumina' },
  en: { 10000005: 'Aether', 10000007: 'Lumine' },
  ja: { 10000005: '空', 10000007: '蛍' },
  'zh-Hans': { 10000005: '空', 10000007: '荧' },
};

/**
 * When each patch before 3.0 began. Amber's changelog starts at 3.0, and a
 * character's version before it is read off their release date against these
 * — historical, so this table never changes.
 */
const EARLY_PATCHES: [string, string][] = [
  ['1.0', '2020-09-28'], ['1.1', '2020-11-11'], ['1.2', '2020-12-23'], ['1.3', '2021-02-03'],
  ['1.4', '2021-03-17'], ['1.5', '2021-04-28'], ['1.6', '2021-06-09'], ['2.0', '2021-07-21'],
  ['2.1', '2021-09-01'], ['2.2', '2021-10-13'], ['2.3', '2021-11-24'], ['2.4', '2022-01-05'],
  ['2.5', '2022-02-16'], ['2.6', '2022-03-30'], ['2.7', '2022-05-31'], ['2.8', '2022-07-13'],
];

/**
 * Two days' margin: Amber dates a release by the server's clock, up to a day
 * and a half before the patch's calendar date in UTC. No character launches
 * that close before a patch — a second phase is three weeks in.
 */
const MARGIN = 2 * 86_400;

/** When 3.0 began, where Amber's changelog takes over from the table above. */
const CHANGELOG_STARTS = Date.parse('2022-08-24T00:00:00Z') / 1000;

function earlyVersion(release: number) {
  let version = EARLY_PATCHES[0][0];
  for (const [name, date] of EARLY_PATCHES) {
    if (release + MARGIN >= Date.parse(`${date}T00:00:00Z`) / 1000) version = name;
  }
  return version;
}

const SLOTS: Record<string, 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet'> = {
  EQUIP_BRACER: 'flower',
  EQUIP_NECKLACE: 'plume',
  EQUIP_SHOES: 'sands',
  EQUIP_RING: 'goblet',
  EQUIP_DRESS: 'circlet',
};

/**
 * The bag's order for the materials a plan bills, highest first: crown and
 * books, gems, boss drops, weapon materials, mob drops, specialties. Amber
 * carries the type but not the game's sort rank; see `sortRankOf`.
 */
const TYPE_ORDER: Record<string, number> = {
  characterTalentMaterial: 9,
  characterAscensionMaterial: 8,
  characterLevelUpMaterial: 7,
  weaponAscensionMaterial: 6,
  characterandWeaponEnhancementMaterial: 5,
  characterEXPMaterial: 3,
  weaponEnhancementMaterial: 3,
  commonCurrency: 2,
};

/* ------------------------------------------------------------- helpers --- */

/**
 * Levels a builder actually cares about. A `+` suffix means the level after the
 * ascension at that breakpoint; the bare key means before it.
 */
const STAT_LEVELS: Record<string, number> = {
  '1': 0, '20': 0, '20+': 1, '40': 1, '40+': 2, '50': 2, '50+': 3,
  '60': 3, '60+': 4, '70': 4, '70+': 5, '80': 5, '80+': 6, '90': 6,
};

const MORA = 202;

/** Every character's crit before any gear: 5% rate, 50% damage. */
const BASE_CRIT: Record<string, number> = {
  FIGHT_PROP_CRITICAL: 0.05,
  FIGHT_PROP_CRITICAL_HURT: 0.5,
};

/** A stat at a level and ascension: base × the level's curve, plus what ascension adds. */
function statAt(prop: Prop | undefined, level: number, ascension: number, curves: Curves, promote: Promote[]) {
  if (!prop) return 0;
  const grown = prop.initValue * (curves[String(level)]?.curveInfos[prop.type] ?? 1);
  const phase = promote.find((entry) => entry.promoteLevel === ascension);
  return grown + (phase?.addProps?.[prop.propType] ?? 0);
}

/** The stat table rows up to the highest level this rarity reaches. */
function statRows(promote: Promote[]) {
  const cap = Math.max(...promote.map((entry) => entry.unlockMaxLevel ?? 0), 20);
  return Object.entries(STAT_LEVELS).filter(([key, ascension]) =>
    Number.parseInt(key, 10) <= cap && promote.some((entry) => entry.promoteLevel === ascension));
}

function characterStats(avatar: AmberAvatar, curves: Curves) {
  const { prop, promote } = avatar.upgrade;
  const of = (type: string) => prop.find((entry) => entry.propType === type);

  return Object.fromEntries(statRows(promote).map(([key, ascension]) => {
    const level = Number.parseInt(key, 10);
    const phase = promote.find((entry) => entry.promoteLevel === ascension);
    return [key, {
      level,
      ascension,
      hp: statAt(of('FIGHT_PROP_BASE_HP'), level, ascension, curves, promote),
      attack: statAt(of('FIGHT_PROP_BASE_ATTACK'), level, ascension, curves, promote),
      defense: statAt(of('FIGHT_PROP_BASE_DEFENSE'), level, ascension, curves, promote),
      // What the phases add, on top of the crit every character starts with —
      // the ascension stat as the character sheet shows it.
      specialized: (phase?.addProps?.[avatar.specialProp] ?? 0) + (BASE_CRIT[avatar.specialProp] ?? 0),
    }];
  }));
}

function weaponStats(weapon: AmberWeapon, curves: Curves) {
  const { prop, promote } = weapon.upgrade;
  const base = prop.find((entry) => entry.propType === 'FIGHT_PROP_BASE_ATTACK');
  const secondary = prop.find((entry) => entry.propType !== 'FIGHT_PROP_BASE_ATTACK');

  return Object.fromEntries(statRows(promote).map(([key, ascension]) => {
    const level = Number.parseInt(key, 10);
    return [key, {
      level,
      ascension,
      attack: statAt(base, level, ascension, curves, promote),
      specialized: secondary ? statAt(secondary, level, ascension, curves, []) : 0,
    }];
  }));
}

/** `{ id, count }[]` per phase, Mora first, as the game bills it. */
function costOf(costItems: Record<string, number> | null | undefined, coin: number | undefined) {
  return [
    ...(coin ? [{ id: MORA, count: coin }] : []),
    ...Object.entries(costItems ?? {}).map(([id, count]) => ({ id: Number(id), count })),
  ];
}

function ascensionCosts(promote: Promote[]) {
  return Object.fromEntries(promote
    .filter((entry) => entry.promoteLevel > 0)
    .map((entry) => [`ascend${entry.promoteLevel}`, costOf(entry.costItems, entry.coinCost)]));
}

/** Talent levels 2–10, billed the same for every combat talent. */
function talentCosts(avatar: AmberAvatar) {
  const first = Object.values(avatar.talent ?? {}).find((talent) => talent.type !== 2);
  return Object.fromEntries(Object.values(first?.promote ?? {})
    .filter((level) => level.level >= 2 && level.level <= 10)
    .map((level) => [`lvl${level.level}`, costOf(level.costItems, level.coinCost)]));
}

/** Combat talents in the order the game lists them: attack, skill, sprints, then burst. */
function combatOf(avatar: AmberAvatar) {
  return Object.entries(avatar.talent ?? {})
    .filter(([, talent]) => talent.type !== 2)
    .sort(([a, x], [b, y]) => Number(x.type === 1) - Number(y.type === 1) || Number(a) - Number(b))
    .map(([, talent]) => talent);
}

/**
 * The passives, with the ascension phase that unlocks each.
 *
 * The game's order is fixed: the first two are the A1 and A4 passives, and
 * anything after them — the utility perk, a Hexerei rite, an always-on
 * effect such as Kokomi's — is there from level 1. Amber carries no unlock
 * field, so the phase is read off the position.
 */
const PASSIVE_UNLOCK: readonly number[] = [1, 4];

function passivesOf(avatar: AmberAvatar) {
  return Object.entries(avatar.talent ?? {})
    .filter(([, talent]) => talent.type === 2)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, talent], index) => ({ talent, unlockAscension: PASSIVE_UNLOCK[index] ?? 0 }));
}

/** A talent's scaling: the labels, and each parameter across all fifteen levels. */
function attributesOf(talent: AmberTalent) {
  const levels = Object.values(talent.promote ?? {}).sort((a, b) => a.level - b.level);
  if (levels.length === 0) return undefined;

  const labels = (levels[0].description ?? []).filter((label) => label !== '');
  const width = Math.max(...levels.map((level) => level.params?.length ?? 0));
  const parameters = Object.fromEntries(Array.from({ length: width }, (_, index) => [
    `param${index + 1}`,
    levels.map((level) => level.params?.[index] ?? 0),
  ]));
  return { labels, parameters };
}

function text(raw: string) {
  return { descriptionRaw: raw, description: plainText(raw) };
}

/** `UI_AvatarIcon_Beidou` → `Beidou`, the name the other art is filed under. */
const artName = (icon: string) => icon.replace(/^UI_AvatarIcon_/, '');

const days = (list: string[] = []) => list.map((day) => day[0].toUpperCase() + day.slice(1));

/**
 * A material family's shared rank: every tier of one gem, book or drop gets
 * the same number, and families sort as the bag does.
 *
 * A tier is crafted from three of the tier below it, which is the one recipe
 * with a single input; the others convert between families (one gem into
 * another, with dust) and say nothing about which family an item is in. So a
 * family is followed down that recipe to its lowest tier, whose id names it.
 */
function sortRankOf(id: number, materials: Map<number, AmberMaterial>, types: Map<number, string>) {
  let root = id;
  for (let guard = 0; guard < 6; guard += 1) {
    const recipes = Object.values(materials.get(root)?.recipe ?? {});
    const craft = recipes.find((inputs) => Object.keys(inputs).length === 1);
    const below = craft && Number(Object.keys(craft)[0]);
    if (!below || !materials.has(below)) break;
    root = below;
  }
  return (TYPE_ORDER[types.get(id) ?? ''] ?? 1) * 1_000_000 + root;
}

async function writeJson(relative: string, value: unknown) {
  const file = path.join(OUT, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value)}\n`);
}

/**
 * GOOD keys the Traveler by element (`TravelerAnemo`) and this catalog keys the
 * two bodies by name (`Aether`, `Lumine`), so neither derives from the other.
 * GOOD carries no gender at all, which is why the import has to pick a body.
 */
const TRAVELER_ELEMENT_BY_KEY: Record<string, string> = {
  TravelerAnemo: 'ELEMENT_ANEMO',
  TravelerGeo: 'ELEMENT_GEO',
  TravelerElectro: 'ELEMENT_ELECTRO',
  TravelerDendro: 'ELEMENT_DENDRO',
  TravelerHydro: 'ELEMENT_HYDRO',
  TravelerPyro: 'ELEMENT_PYRO',
  TravelerCryo: 'ELEMENT_CRYO',
};

/** `null` omits an id from the derived map entirely. */
const CHARACTER_KEY_OVERRIDES: Record<number, string | null> = {
  10000005: null, // Aether — see TRAVELER_ELEMENT_BY_KEY
  10000007: null, // Lumine
};

/**
 * Four flat stats never appear as anybody's ascension stat or a weapon's main
 * stat, so Amber's label tables lack them; artifacts do use them, and the game
 * labels a flat stat exactly like its percentage twin.
 */
const FLAT_ALIASES: Record<string, string> = {
  FIGHT_PROP_HP: 'FIGHT_PROP_HP_PERCENT',
  FIGHT_PROP_ATTACK: 'FIGHT_PROP_ATTACK_PERCENT',
  FIGHT_PROP_DEFENSE: 'FIGHT_PROP_DEFENSE_PERCENT',
  FIGHT_PROP_BASE_ATTACK: 'FIGHT_PROP_ATTACK_PERCENT',
};

/** A character id Amber lists per element (`10000005-anemo`) is a Traveler's form. */
const isForm = (id: string) => id.includes('-');

/** Amber's weapon list includes event and mode weapons outside the regular game (`3xxxxx`). */
const isRegularWeapon = (id: string) => /^1\d{4}$/.test(id);

/* ---------------------------------------------------------------- main --- */

async function main() {
  const curves = {
    avatar: (await readJson<Amber<Curves>>('static/avatarCurve.json'))?.data,
    weapon: (await readJson<Amber<Curves>>('static/weaponCurve.json'))?.data,
  };
  const changelog = (await readJson<Amber<Changelog>>('static/changelog.json'))?.data;
  if (!curves.avatar || !curves.weapon || !changelog) {
    throw new Error('data: no Amber cache — run `pnpm data:yatta` first');
  }

  // The patch each id first appeared in. Later appearances are updates to
  // it — 6.7 lists Beidou again for her rework — so only the first counts.
  const firstSeen = new Map<string, string>();
  for (const { version, items } of Object.values(changelog).sort((a, b) =>
    Number.parseFloat(a.version) - Number.parseFloat(b.version))) {
    for (const ids of Object.values(items)) {
      for (const id of ids) if (!firstSeen.has(String(id))) firstSeen.set(String(id), version);
    }
  }

  // Only what this script owns. `enka/`, `builds.json` and
  // `assets-missing.json` live in the same tree and come from elsewhere.
  for (const owned of ['core', 'i18n', 'meta.json']) {
    await rm(path.join(OUT, owned), { recursive: true, force: true });
  }

  /* ---------------------------------------------------------------- core --- */

  const avatarIds = (await idsIn('en', 'avatar')).filter((id) => !isForm(id))
    .sort((a, b) => Number(a) - Number(b));
  const weaponIds = (await idsIn('en', 'weapon')).filter(isRegularWeapon)
    .sort((a, b) => Number(a) - Number(b));
  const setIds = (await idsIn('en', 'reliquary')).sort((a, b) => Number(a) - Number(b));
  const materialList = (await readJson<AmberList<AmberMaterialItem>>('en/material.json'))?.data.items ?? {};
  const materialIds = Object.keys(materialList).sort((a, b) => Number(a) - Number(b));

  const avatars = new Map<string, AmberAvatar>();
  for (const id of avatarIds) {
    const avatar = await detail<AmberAvatar>('en', 'avatar', id);
    if (avatar) avatars.set(id, avatar);
  }
  // The list's codes (`WEAPON_POLE`, `NONE`); a detail prints both as words.
  const weaponList = (await readJson<AmberList<{ type: string; specialProp: string }>>('en/weapon.json'))
    ?.data.items ?? {};
  const weapons = new Map<string, AmberWeapon>();
  for (const id of weaponIds) {
    const weapon = await detail<AmberWeapon>('en', 'weapon', id);
    if (weapon?.upgrade) {
      weapons.set(id, { ...weapon, type: weaponList[id].type, specialProp: weaponList[id].specialProp });
    }
  }
  const sets = new Map<string, AmberSet>();
  for (const id of setIds) {
    const set = await detail<AmberSet>('en', 'reliquary', id);
    if (set) sets.set(id, set);
  }
  const materials = new Map<number, AmberMaterial>();
  const materialTypes = new Map<number, string>();
  for (const id of materialIds) {
    const material = await detail<AmberMaterial>('en', 'material', id);
    if (material) materials.set(Number(id), material);
    materialTypes.set(Number(id), materialList[id].type);
  }

  // Before 3.0 the changelog does not exist, and a character from then shows
  // up in it only when reworked — so a release date before it wins.
  const versionOf = (id: string, release?: number) =>
    (release && release + MARGIN < CHANGELOG_STARTS ? earlyVersion(release) : null)
    ?? firstSeen.get(id)
    ?? (release ? earlyVersion(release) : null);

  await writeJson('core/characters.json', Object.fromEntries([...avatars].map(([id, avatar]) => {
    // The Manekins have no element either, but they have art; only the two
    // Traveler bodies are drawn per element.
    const traveler = avatar.id === 10000005 || avatar.id === 10000007;
    const art = artName(avatar.icon);
    return [id, {
      id: avatar.id,
      rarity: avatar.rank,
      weaponType: avatar.weaponType,
      elementType: avatar.element ? ELEMENTS[avatar.element] ?? 'ELEMENT_NONE' : 'ELEMENT_NONE',
      bodyType: `BODY_${avatar.bodyType}`,
      substatType: avatar.specialProp,
      associationType: `ASSOC_${avatar.region}`,
      birthday: avatar.birthday?.[0] ? `${avatar.birthday[0]}/${avatar.birthday[1]}` : null,
      version: versionOf(id, avatar.release) ?? '1.0',
      icon: avatar.icon,
      sideIcon: `UI_AvatarIcon_Side_${art}`,
      gachaSplash: traveler ? null : `UI_Gacha_AvatarImg_${art}`,
      stats: characterStats(avatar, curves.avatar!),
      costs: ascensionCosts(avatar.upgrade.promote),
      talentCosts: talentCosts(avatar),
    }];
  })));

  await writeJson('core/weapons.json', Object.fromEntries([...weapons].map(([id, weapon]) => [id, {
    id: weapon.id,
    rarity: weapon.rank,
    weaponType: weapon.type,
    ...(weapon.specialProp !== 'NONE' ? { mainStatType: weapon.specialProp } : {}),
    baseAtkValue: weapon.upgrade.prop.find((prop) => prop.propType === 'FIGHT_PROP_BASE_ATTACK')?.initValue ?? 0,
    version: versionOf(id),
    icon: weapon.icon,
    awakenIcon: `${weapon.icon}_Awaken`,
    stats: weaponStats(weapon, curves.weapon!),
    costs: ascensionCosts(weapon.upgrade.promote),
  }])));

  await writeJson('core/artifacts.json', Object.fromEntries([...sets].map(([id, set]) => [id, {
    id: set.id,
    rarityList: set.levelList,
    version: versionOf(id),
    pieces: Object.fromEntries(Object.entries(set.suit).flatMap(([equip, piece]) =>
      SLOTS[equip] ? [[SLOTS[equip], { icon: piece.icon }]] : [])),
  }])));

  // Only books and weapon materials are day-gated. Mora and the EXP items
  // also drop in domains that open on set days, but not only there, and a
  // domain for them would put Mora into the week's rotation.
  const GATED = new Set(['characterTalentMaterial', 'weaponAscensionMaterial']);
  const domainOf = (material: AmberMaterial | undefined, id: number) => (GATED.has(materialTypes.get(id) ?? '')
    ? material?.source?.find((source) => source.type === 'domain' && source.days?.length)
    : undefined);

  await writeJson('core/materials.json', Object.fromEntries(materialIds.map((id) => {
    const material = materials.get(Number(id));
    const item = materialList[id];
    const domain = domainOf(material, Number(id));
    return [id, {
      id: Number(id),
      category: item.type,
      sortRank: sortRankOf(Number(id), materials, materialTypes),
      version: versionOf(id),
      icon: item.icon,
      // What the farming planner runs on: only the day-gated ones, talent
      // books and weapon materials, have a domain and days. Everything else is
      // a boss, a specialty or a mob drop, a question of quantity.
      domain: domain?.name ?? null,
      days: days(domain?.days),
    }];
  })));

  // The GOOD crosswalk. It lives in `core/` because it is language-neutral,
  // id-keyed and derived offline from the English names above.
  const named = <T extends { name: string }>(entries: [string, T][]) =>
    entries.map(([id, entry]) => ({ id: Number(id), name: entry.name }));

  const artifactKeys = buildKeyMap(named([...sets]));
  const weaponKeys = buildKeyMap(named([...weapons]));
  const characterKeys = buildKeyMap(named([...avatars]), CHARACTER_KEY_OVERRIDES);
  const materialKeys = buildKeyMap(named(Object.entries(materialList)));

  for (const [label, result] of [
    ['artifactSets', artifactKeys],
    ['weapons', weaponKeys],
    ['characters', characterKeys],
    ['materials', materialKeys],
  ] as const) {
    assertNoLenientCollision(label, result.map);
  }

  await writeJson('core/good.json', {
    version: 1,
    artifactSets: artifactKeys.map,
    weapons: weaponKeys.map,
    characters: characterKeys.map,
    materials: materialKeys.map,
    traveler: {
      /** GOOD's `location` uses these; the element keys live in `elementByKey`. */
      bodies: { male: 10000005, female: 10000007 },
      elementByKey: TRAVELER_ELEMENT_BY_KEY,
    },
    // Ambiguous keys, kept as data so an import can say "known collision"
    // instead of "unknown key".
    excluded: {
      artifactSets: artifactKeys.excluded,
      weapons: weaponKeys.excluded,
      characters: characterKeys.excluded,
      materials: materialKeys.excluded,
    },
  });

  // Mechanic membership, derived from the English text. A tag means the entity
  // names the mechanic, which is a fact; whether it is *good* at it is not, and
  // stays in the curated layer.
  const mechanics: MechanicIndex = { characters: {}, artifactSets: {}, weapons: {} };

  for (const [id, avatar] of avatars) {
    const texts = [
      ...Object.values(avatar.talent ?? {}).map((talent) => talent.description),
      ...Object.values(avatar.constellation ?? {}).map((level) => level.description),
    ];
    const tags = tagsIn(texts.map((raw) => plainText(raw)).join(' '));
    if (tags.length > 0) mechanics.characters[Number(id)] = tags;
  }
  for (const [id, set] of sets) {
    const tags = tagsIn(Object.values(set.affixList).map((raw) => plainText(raw)).join(' '));
    if (tags.length > 0) mechanics.artifactSets[Number(id)] = tags;
  }
  for (const [id, weapon] of weapons) {
    const affix = Object.values(weapon.affix ?? {})[0];
    const tags = tagsIn([affix?.upgrade['0'], affix?.upgrade['4']]
      .filter(Boolean).map((raw) => plainText(raw)).join(' '));
    if (tags.length > 0) mechanics.weapons[Number(id)] = tags;
  }

  await writeJson('core/mechanics.json', mechanics);

  /* ---------------------------------------------------------------- i18n --- */

  const locales = Object.entries(LOCALES) as [Locale, { amber: string }][];

  for (const [locale, { amber }] of locales) {
    const avatarList = (await readJson<AmberList<unknown>>(`${amber}/avatar.json`))?.data;
    const weaponList = (await readJson<AmberList<unknown>>(`${amber}/weapon.json`))?.data;
    const localMaterials = (await readJson<AmberList<AmberMaterialItem>>(`${amber}/material.json`))?.data.items ?? {};
    const weaponText = weaponList?.types ?? {};
    const props: Record<string, string> = { ...weaponList?.props, ...avatarList?.props };
    delete props.NONE;
    for (const [flat, percent] of Object.entries(FLAT_ALIASES)) {
      if (props[percent]) props[flat] = props[percent];
    }

    const localAvatars = new Map<string, AmberAvatar>();
    for (const id of avatars.keys()) {
      const avatar = await detail<AmberAvatar>(amber, 'avatar', id);
      if (avatar) localAvatars.set(id, avatar);
    }

    await writeJson(`i18n/${locale}/characters.json`, Object.fromEntries([...localAvatars].map(([id, avatar]) => {
      const element = avatar.element === null ? 'ELEMENT_NONE' : ELEMENTS[avatar.element] ?? 'ELEMENT_NONE';
      return [id, {
        name: TRAVELER_NAMES[locale][Number(id)] ?? avatar.name,
        title: avatar.fetter?.title ?? '',
        description: avatar.fetter?.detail ?? '',
        weaponText: weaponText[avatar.weaponType] ?? '',
        elementText: ELEMENT_NAMES[locale][element],
        substatText: props[avatar.specialProp] ?? '',
        constellation: avatar.fetter?.constellation ?? '',
        affiliation: avatar.fetter?.native ?? '',
      }];
    })));

    const localWeapons = new Map<string, AmberWeapon>();
    for (const id of weapons.keys()) {
      const weapon = await detail<AmberWeapon>(amber, 'weapon', id);
      if (weapon) localWeapons.set(id, weapon);
    }

    await writeJson(`i18n/${locale}/weapons.json`, Object.fromEntries([...localWeapons].map(([id, weapon]) => {
      const affix = Object.values(weapon.affix ?? {})[0];
      const raw = affix ? Object.keys(affix.upgrade).sort().map((rank) => affix.upgrade[rank]) : [];
      return [id, {
        name: weapon.name,
        description: weapon.description,
        weaponText: weaponText[weapons.get(id)!.type] ?? '',
        mainStatText: props[weapons.get(id)!.specialProp] ?? '',
        effectName: affix?.name ?? '',
        refinements: raw.map((line) => plainText(line)),
        // With the game's markup kept, so the numbers a refinement changes
        // stay marked as the game marks them. See `lib/data/game-text.ts`.
        refinementsRaw: raw,
      }];
    })));

    const localSets = new Map<string, AmberSet>();
    for (const id of sets.keys()) {
      const set = await detail<AmberSet>(amber, 'reliquary', id);
      if (set) localSets.set(id, set);
    }

    await writeJson(`i18n/${locale}/artifacts.json`, Object.fromEntries([...localSets].map(([id, set]) => {
      // Plain: the effects are drawn as plain text in places `GameText` does
      // not reach, and the game marks almost nothing in them.
      const effects = Object.keys(set.affixList).sort().map((key) => plainText(set.affixList[key]));
      // Circlet-only sets carry one effect, at a single piece.
      const single = effects.length === 1;
      return [id, {
        name: set.name,
        effect1Pc: single ? effects[0] : null,
        effect2Pc: single ? null : effects[0] ?? null,
        effect4Pc: single ? null : effects[1] ?? null,
        pieces: Object.fromEntries(Object.entries(set.suit).flatMap(([equip, piece]) =>
          SLOTS[equip] ? [[SLOTS[equip], { name: piece.name, description: piece.description }]] : [])),
      }];
    })));

    const localMaterialDetails = new Map<number, AmberMaterial>();
    for (const id of materialIds) {
      const material = await detail<AmberMaterial>(amber, 'material', id);
      if (material) localMaterialDetails.set(Number(id), material);
    }

    await writeJson(`i18n/${locale}/materials.json`, Object.fromEntries(materialIds.map((id) => {
      const material = localMaterialDetails.get(Number(id));
      return [id, {
        name: material?.name ?? localMaterials[id]?.name ?? '',
        description: material?.description ?? '',
        typeText: material?.type ?? '',
        sources: (material?.source ?? []).map((source) => source.name),
        // The English name in `core/` is the grouping key; this is the label.
        domainName: domainOf(material, Number(id))?.name ?? null,
      }];
    })));

    await writeJson(`i18n/${locale}/props.json`, Object.fromEntries(
      Object.entries(props).sort(([a], [b]) => a.localeCompare(b)),
    ));

    // Talent and constellation text is the bulk of the dataset and is only
    // ever read for one character at a time, so it is sharded per character.
    // The Traveler's bodies have neither, and still get a shard so a missing
    // file always means a bad id.
    for (const [id, avatar] of localAvatars) {
      const name = TRAVELER_NAMES[locale][Number(id)] ?? avatar.name;
      const hasTalents = Object.keys(avatar.talent ?? {}).length > 0;

      await writeJson(`i18n/${locale}/characters/${id}.json`, {
        talents: hasTalents
          ? {
              combat: combatOf(avatar).map((talent) => ({
                name: talent.name,
                ...text(talent.description),
                attributes: attributesOf(talent),
              })),
              passive: passivesOf(avatar).map(({ talent, unlockAscension }) => ({
                name: talent.name,
                ...text(talent.description),
                icon: talent.icon,
                unlockAscension,
              })),
            }
          : null,
        constellation: avatar.constellation && Object.keys(avatar.constellation).length > 0
          ? {
              name,
              levels: Object.keys(avatar.constellation).sort((a, b) => Number(a) - Number(b))
                .map((key) => {
                  const level = avatar.constellation![key];
                  return { name: level.name, ...text(level.description) };
                }),
            }
          : null,
      });
    }
  }

  /* ---------------------------------------------------------------- meta --- */

  const gameVersion = Object.values(changelog)
    .map((entry) => entry.version)
    .sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
    .at(-1);

  await writeJson('meta.json', {
    gameVersion,
    source: 'Project Amber',
    generatedAt: new Date().toISOString(),
    locales: Object.keys(LOCALES),
    counts: {
      characters: avatars.size,
      weapons: weapons.size,
      artifacts: sets.size,
      materials: materialIds.length,
    },
  });

  const excludedCount =
    Object.keys(artifactKeys.excluded).length +
    Object.keys(weaponKeys.excluded).length +
    Object.keys(characterKeys.excluded).length +
    Object.keys(materialKeys.excluded).length;

  console.log(
    `data: game ${gameVersion} · Project Amber · ` +
    `${avatars.size} characters, ${weapons.size} weapons, ` +
    `${sets.size} artifact sets, ${materialIds.length} materials · ` +
    `${locales.length} locales · ` +
    `mecánicas ${Object.keys(mechanics.characters).length}/` +
    `${Object.keys(mechanics.artifactSets).length}/` +
    `${Object.keys(mechanics.weapons).length} · GOOD keys ` +
    `${Object.keys(artifactKeys.map).length}/${Object.keys(weaponKeys.map).length}/` +
    `${Object.keys(characterKeys.map).length}/${Object.keys(materialKeys.map).length}` +
    `${excludedCount ? ` (${excludedCount} ambiguous)` : ''}`,
  );
}

await main();
