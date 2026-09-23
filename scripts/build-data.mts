/**
 * Build-time data pipeline.
 *
 * Reads the `genshin-db` package and emits two kinds of artifact:
 *
 *   - `core/*.json`   language-neutral records keyed by the game's internal id.
 *                     Stats, costs, rarities and asset filenames live here.
 *   - `i18n/<locale>/*.json`  localized strings for the same ids.
 *
 * Keeping them apart means a locale switch never invalidates an id and the
 * server only reads the strings for the language it renders.
 *
 * Run with `pnpm data:build`. Output is committed so that `next build` never
 * depends on the shape of a third-party package.
 */
import genshindb, {
  type Artifact,
  type ArtifactDetail,
  type Character,
  type CombatTalentDetail,
  type Constellation,
  type Items,
  type Language,
  type Material,
  type StatFunction,
  type Talent,
  type Weapon,
} from 'genshin-db';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  assertNoLenientCollision,
  buildKeyMap,
} from '../src/lib/good/derive.ts';
import { LOCALES, type Locale } from '../src/lib/data/locales.ts';
import { type MechanicIndex, tagsIn } from '../src/lib/data/mechanics.ts';

const OUT = path.join(import.meta.dirname, '..', 'src', 'generated', 'data');

/**
 * Levels a builder actually cares about. A `+` suffix means the level after the
 * ascension at that breakpoint; the bare key means before it.
 */
const STAT_LEVELS: Record<string, number> = {
  '1': 0, '20': 0, '20+': 1, '40': 1, '40+': 2, '50': 2, '50+': 3,
  '60': 3, '60+': 4, '70': 4, '70+': 5, '80': 5, '80+': 6, '90': 6,
};

/**
 * `StatFunction` takes the ascension phase as a positional argument. Passing an
 * options object silently falls back to the default phase, which makes every
 * post-ascension row a duplicate of the pre-ascension one.
 */
function statTable(stats: StatFunction) {
  return Object.fromEntries(
    Object.entries(STAT_LEVELS).map(([key, ascension]) => [
      key,
      stats(Number.parseInt(key, 10), ascension),
    ]),
  );
}

/** `{ id, count }[]` per phase. Material names resolve through i18n. */
function costRefs(costs: Record<string, Items[]> | undefined) {
  if (!costs) return {};
  return Object.fromEntries(
    Object.entries(costs).map(([phase, items]) => [
      phase,
      items.map(({ id, count }) => ({ id, count })),
    ]),
  );
}

const ARTIFACT_SLOTS = ['flower', 'plume', 'sands', 'goblet', 'circlet'] as const;
type ArtifactSlot = (typeof ARTIFACT_SLOTS)[number];

/** Slots an artifact set actually ships. Circlet-only sets exist. */
function slotsOf(artifact: Artifact) {
  return ARTIFACT_SLOTS.filter((slot): slot is ArtifactSlot => Boolean(artifact[slot]));
}

/**
 * `genshin-db` 5.2.13 ships a stale declaration for materials: the runtime
 * object exposes `sources` rather than `source`, plus a `version` the type
 * omits (empty for most materials).
 */
type MaterialRecord = Omit<Material, 'source'> & {
  sources?: string[];
  version?: string;
  /** Present on the day-gated ones: talent books and weapon materials. */
  dropDomainName?: string;
  daysOfWeek?: string[];
};

type FolderType = {
  characters: Character;
  weapons: Weapon;
  artifacts: Artifact;
  materials: MaterialRecord;
};

const listOpts = { matchCategories: true, verboseCategories: true };

/**
 * The folder functions are overloaded: querying `'names'` with
 * `verboseCategories` returns the whole folder as an array.
 */
function all<F extends keyof FolderType>(folder: F, language: Language): FolderType[F][] {
  const result = genshindb[folder]('names', { ...listOpts, resultLanguage: language });
  return result as unknown as FolderType[F][];
}

/** Talents and constellations are queried by the character's name, not listed. */
function detailOf(name: string, language: Language) {
  const opts = { queryLanguages: [genshindb.Language.English], resultLanguage: language };
  return {
    talent: genshindb.talents(name, opts) as Talent | undefined,
    constellation: genshindb.constellations(name, opts) as Constellation | undefined,
  };
}

function combatTalents(talent: Talent) {
  // `combatsp` (Mona, Ayaka) and `combatju` (Ororon) are alternate sprints.
  return [talent.combat1, talent.combat2, talent.combatsp, talent.combatju, talent.combat3]
    .filter((entry): entry is CombatTalentDetail => Boolean(entry));
}

/**
 * The passives, with the ascension phase that unlocks each.
 *
 * The game's order is fixed: the first two are the A1 and A4 passives, and
 * anything after them — the utility perk, or an always-on effect such as
 * Kokomi's or a Nod-Krai moonsign talent — is there from level 1. `genshin-db`
 * carries no unlock field, so the phase is read off the position.
 */
const PASSIVE_UNLOCK: readonly number[] = [1, 4, 0, 0];

function passiveTalents(talent: Talent) {
  const images = (talent.images ?? {}) as Record<string, string | undefined>;
  return [talent.passive1, talent.passive2, talent.passive3, talent.passive4]
    .flatMap((entry, index) => entry ? [{
      ...entry,
      icon: images[`filename_passive${index + 1}`] ?? null,
      unlockAscension: PASSIVE_UNLOCK[index],
    }] : []);
}

function constellationLevels(constellation: Constellation) {
  return [
    constellation.c1, constellation.c2, constellation.c3,
    constellation.c4, constellation.c5, constellation.c6,
  ].filter(Boolean);
}

/**
 * `genshin-db` has no folder for stat labels, but every character carries its
 * ascension substat and every weapon its main stat, both localized. Harvesting
 * those two fields yields all 16 stat types the game shows.
 *
 * The four flat variants never appear there because no character or weapon
 * ascends into them; artifacts do use them (flower HP, plume ATK), and the game
 * labels a flat stat exactly like its percentage twin — only the formatting
 * differs. So they alias.
 */
const FLAT_ALIASES: Record<string, string> = {
  FIGHT_PROP_HP: 'FIGHT_PROP_HP_PERCENT',
  FIGHT_PROP_ATTACK: 'FIGHT_PROP_ATTACK_PERCENT',
  FIGHT_PROP_DEFENSE: 'FIGHT_PROP_DEFENSE_PERCENT',
  FIGHT_PROP_BASE_ATTACK: 'FIGHT_PROP_ATTACK_PERCENT',
};

function propLabels(language: Language) {
  const labels = new Map<string, string>();

  for (const character of all('characters', language)) {
    // The Traveler has no ascension substat before a element is chosen.
    if (character.substatType && character.substatText) {
      labels.set(character.substatType, character.substatText);
    }
  }
  for (const weapon of all('weapons', language)) {
    if (weapon.mainStatType && weapon.mainStatText) {
      labels.set(weapon.mainStatType, weapon.mainStatText);
    }
  }

  for (const [flat, percent] of Object.entries(FLAT_ALIASES)) {
    const label = labels.get(percent);
    if (label) labels.set(flat, label);
  }

  return Object.fromEntries([...labels].sort(([a], [b]) => a.localeCompare(b)));
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

async function writeJson(relative: string, value: unknown) {
  const file = path.join(OUT, relative);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(value)}\n`);
}

const EN = genshindb.Language.English;

async function main() {
  // Only what this script owns. `enka/characters.json` (pnpm data:enka) and
  // `assets-missing.json` (pnpm data:check-assets --all) live in the same tree
  // and come from the network, so wiping the whole directory would delete them
  // on every build.
  for (const owned of ['core', 'i18n', 'meta.json']) {
    await rm(path.join(OUT, owned), { recursive: true, force: true });
  }

  /* ---------------------------------------------------------------- core --- */

  const characters = all('characters', EN);
  const weapons = all('weapons', EN);
  const artifacts = all('artifacts', EN);
  const materials = all('materials', EN);

  await writeJson('core/characters.json', Object.fromEntries(characters.map((character) => {
    const { talent } = detailOf(character.name, EN);
    return [character.id, {
      id: character.id,
      rarity: character.rarity,
      weaponType: character.weaponType,
      elementType: character.elementType,
      bodyType: character.bodyType,
      substatType: character.substatType,
      associationType: character.associationType,
      birthday: character.birthdaymmdd || null,
      version: character.version,
      icon: character.images?.filename_icon ?? null,
      sideIcon: character.images?.filename_sideIcon ?? null,
      gachaSplash: character.images?.filename_gachaSplash ?? null,
      stats: statTable(character.stats),
      costs: costRefs(character.costs),
      talentCosts: costRefs(talent?.costs),
    }];
  })));

  await writeJson('core/weapons.json', Object.fromEntries(weapons.map((weapon) => [weapon.id, {
    id: weapon.id,
    rarity: weapon.rarity,
    weaponType: weapon.weaponType,
    mainStatType: weapon.mainStatType,
    baseAtkValue: weapon.baseAtkValue,
    version: weapon.version,
    icon: weapon.images?.filename_icon ?? null,
    awakenIcon: weapon.images?.filename_awakenIcon ?? null,
    stats: statTable(weapon.stats),
    costs: costRefs(weapon.costs),
  }])));

  await writeJson('core/artifacts.json', Object.fromEntries(artifacts.map((artifact) => [artifact.id, {
    id: artifact.id,
    rarityList: artifact.rarityList,
    version: artifact.version,
    // Piece icons live on the set's `images`, keyed by slot — not on the piece.
    pieces: Object.fromEntries(slotsOf(artifact).map((slot) => [slot, {
      icon: artifact.images[`filename_${slot}`] ?? null,
    }])),
  }])));

  await writeJson('core/materials.json', Object.fromEntries(materials.map((material) => [material.id, {
    id: material.id,
    category: material.category,
    sortRank: material.sortRank,
    version: material.version || null,
    icon: material.images?.filename_icon ?? null,
    // What the farming planner runs on. Only 168 materials are day-gated;
    // everything else is a boss, a local specialty or a mob drop, available
    // whenever and so a question of quantity rather than of schedule.
    domain: material.dropDomainName ?? null,
    days: material.daysOfWeek ?? [],
  }])));

  // The GOOD crosswalk. It lives in `core/` because it is language-neutral,
  // id-keyed and derived offline from the same English strings above — so it
  // inherits this directory's single owner rather than adding a third one.
  const artifactKeys = buildKeyMap(artifacts);
  const weaponKeys = buildKeyMap(weapons);
  const characterKeys = buildKeyMap(characters, CHARACTER_KEY_OVERRIDES);
  const materialKeys = buildKeyMap(materials);

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
      // Five names are shared by several ids — quest keys and event cakes.
      // None appears in any ascension or talent cost, so the planner is
      // unaffected and the ambiguity is recorded rather than resolved.
      materials: materialKeys.excluded,
    },
  });

  // Mechanic membership, derived from the English text. A tag means the entity
  // names the mechanic, which is a fact; whether it is *good* at it is not, and
  // stays in the curated layer.
  const mechanics: MechanicIndex = { characters: {}, artifactSets: {}, weapons: {} };

  for (const character of characters) {
    const detail = detailOf(character.name, EN);
    const text = [
      ...(detail.talent ? [...combatTalents(detail.talent), ...passiveTalents(detail.talent)] : []),
      ...(detail.constellation ? constellationLevels(detail.constellation) : []),
    ].map((entry) => entry.description ?? '').join(' ');

    const tags = tagsIn(text);
    if (tags.length > 0) mechanics.characters[character.id] = tags;
  }

  for (const artifact of artifacts) {
    const tags = tagsIn(
      [artifact.effect1Pc, artifact.effect2Pc, artifact.effect4Pc].filter(Boolean).join(' '),
    );
    if (tags.length > 0) mechanics.artifactSets[artifact.id] = tags;
  }

  for (const weapon of weapons) {
    const tags = tagsIn(
      [weapon.effectTemplateRaw, weapon.r1?.description, weapon.r5?.description]
        .filter(Boolean).join(' '),
    );
    if (tags.length > 0) mechanics.weapons[weapon.id] = tags;
  }

  await writeJson('core/mechanics.json', mechanics);

  /* ---------------------------------------------------------------- i18n --- */

  const locales = Object.entries(LOCALES) as [
    Locale,
    { genshinDb: keyof typeof genshindb.Language },
  ][];

  for (const [locale, config] of locales) {
    // `LOCALES[*].genshinDb` is a key of the package's Language enum by contract.
    const language = genshindb.Language[config.genshinDb];

    await writeJson(`i18n/${locale}/characters.json`, Object.fromEntries(
      all('characters', language).map((character) => [character.id, {
        name: character.name,
        title: character.title,
        description: character.description,
        weaponText: character.weaponText,
        elementText: character.elementText,
        substatText: character.substatText,
        constellation: character.constellation,
        affiliation: character.affiliation,
        region: character.region,
      }]),
    ));

    await writeJson(`i18n/${locale}/weapons.json`, Object.fromEntries(
      all('weapons', language).map((weapon) => [weapon.id, {
        name: weapon.name,
        description: weapon.description,
        weaponText: weapon.weaponText,
        mainStatText: weapon.mainStatText,
        baseStatText: weapon.baseStatText,
        effectName: weapon.effectName,
        effectTemplateRaw: weapon.effectTemplateRaw,
        // Each rN carries `values` alongside its resolved `description`; only
        // the description is a string, which is the whole of what `LocalizedWeapon`
        // declares this field to be.
        refinements: [weapon.r1, weapon.r2, weapon.r3, weapon.r4, weapon.r5]
          .map((refinement) => refinement?.description ?? ''),
      }]),
    ));

    await writeJson(`i18n/${locale}/artifacts.json`, Object.fromEntries(
      all('artifacts', language).map((artifact) => [artifact.id, {
        name: artifact.name,
        // Circlet-only sets carry a 1-piece effect instead of 2pc/4pc.
        effect1Pc: artifact.effect1Pc ?? null,
        effect2Pc: artifact.effect2Pc ?? null,
        effect4Pc: artifact.effect4Pc ?? null,
        pieces: Object.fromEntries(slotsOf(artifact).map((slot) => {
          const piece = artifact[slot] as ArtifactDetail;
          return [slot, {
            name: piece.name,
            relicText: piece.relicText,
            description: piece.description,
          }];
        })),
      }]),
    ));

    await writeJson(`i18n/${locale}/materials.json`, Object.fromEntries(
      all('materials', language).map((material) => [material.id, {
        name: material.name,
        description: material.description,
        typeText: material.typeText,
        sources: material.sources ?? [],
        // The English name in `core/` is the grouping key; this is the label.
        domainName: material.dropDomainName ?? null,
      }]),
    ));

    await writeJson(`i18n/${locale}/props.json`, propLabels(language));

    // Talent and constellation text is the bulk of the dataset (>1 MB per
    // locale) and is only ever read for one character at a time, so it is
    // sharded per character id. The Traveler's base forms have neither, and
    // still get a shard so a missing file always means a bad id.
    for (const character of characters) {
      const { talent, constellation } = detailOf(character.name, language);

      await writeJson(`i18n/${locale}/characters/${character.id}.json`, {
        talents: talent
          ? { combat: combatTalents(talent), passive: passiveTalents(talent) }
          : null,
        constellation: constellation
          ? { name: constellation.name, levels: constellationLevels(constellation) }
          : null,
      });
    }
  }

  /* ---------------------------------------------------------------- meta --- */

  const gameVersion = [...characters, ...weapons]
    .map((entry) => entry.version)
    .filter(Boolean)
    .sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b))
    .at(-1);

  const { version: genshinDbVersion } = await import('genshin-db/package.json', {
    with: { type: 'json' },
  }).then((module) => module.default as { version: string });

  await writeJson('meta.json', {
    gameVersion,
    genshinDbVersion,
    generatedAt: new Date().toISOString(),
    locales: Object.keys(LOCALES),
    counts: {
      characters: characters.length,
      weapons: weapons.length,
      artifacts: artifacts.length,
      materials: materials.length,
    },
  });

  const excludedCount =
    Object.keys(artifactKeys.excluded).length +
    Object.keys(weaponKeys.excluded).length +
    Object.keys(characterKeys.excluded).length +
    Object.keys(materialKeys.excluded).length;

  console.log(
    `data: game ${gameVersion} · genshin-db ${genshinDbVersion} · ` +
    `${characters.length} characters, ${weapons.length} weapons, ` +
    `${artifacts.length} artifact sets, ${materials.length} materials · ` +
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
