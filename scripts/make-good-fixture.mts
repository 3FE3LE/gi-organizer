/**
 * Generates a GOOD fixture from the catalog, for developing the import layer
 * before a real scan exists.
 *
 * It is a stand-in, not anyone's inventory. What makes it useful is that every
 * key it emits is a key the crosswalk actually contains, and that it plants the
 * exact edge cases the importer has to survive:
 *
 *   - a piece and its levelled twin, three substats becoming four
 *   - two byte-identical flowers, which must stay two pieces
 *   - an unknown `setKey`, which must be reported and not guessed at
 *   - `PrizedIsshinBlade`, the one key three weapon ids claim
 *   - an empty `substats[].key`, which is a legitimate unfilled slot
 *   - Inventory Kamera's non-spec extras: `kamera_version`, a per-scan `id`
 *     on each artifact, and a name-keyed `materials` map
 *
 *     pnpm data:fixture
 *
 * Output is deterministic: same catalog in, same bytes out.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA = path.join(import.meta.dirname, '..', 'src', 'generated', 'data');
const OUT = path.join(import.meta.dirname, '..', 'fixtures', 'good', 'sample.json');

/** Mulberry32. Deterministic so the fixture is stable across runs. */
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Slot = 'flower' | 'plume' | 'sands' | 'goblet' | 'circlet';

/** Main stats the game actually rolls per slot, in GOOD's vocabulary. */
const MAIN_STATS: Record<Slot, string[]> = {
  flower: ['hp'],
  plume: ['atk'],
  sands: ['hp_', 'atk_', 'def_', 'eleMas', 'enerRech_'],
  goblet: ['hp_', 'atk_', 'def_', 'eleMas', 'pyro_dmg_', 'hydro_dmg_', 'cryo_dmg_',
    'electro_dmg_', 'anemo_dmg_', 'geo_dmg_', 'dendro_dmg_', 'physical_dmg_'],
  circlet: ['hp_', 'atk_', 'def_', 'eleMas', 'critRate_', 'critDMG_', 'heal_'],
};

/** One roll of each substat at 5 stars, mid-tier. */
const SUBSTAT_ROLL: Record<string, number> = {
  hp: 254, atk: 16, def: 19, hp_: 4.9, atk_: 4.9, def_: 6.2,
  eleMas: 19.8, enerRech_: 5.5, critRate_: 3.3, critDMG_: 6.6,
};

const SUBSTAT_KEYS = Object.keys(SUBSTAT_ROLL);

type GoodSubstat = { key: string; value: number };
type GoodArtifact = {
  setKey: string; slotKey: Slot; level: number; rarity: number;
  mainStatKey: string; substats: GoodSubstat[]; location: string; lock: boolean;
  id?: number;
};

function round(key: string, value: number) {
  // Percentages carry one decimal, flats are integers. Matching the game's own
  // display is what lets the fingerprint quantize without a tolerance.
  return key.endsWith('_') || key === 'eleMas'
    ? Math.round(value * 10) / 10
    : Math.round(value);
}

/** Picks `count` distinct substats that do not duplicate the main stat. */
function pickSubstats(random: () => number, mainStatKey: string, count: number) {
  const pool = SUBSTAT_KEYS.filter((key) => key !== mainStatKey);
  const chosen: string[] = [];
  while (chosen.length < count && pool.length > 0) {
    chosen.push(...pool.splice(Math.floor(random() * pool.length), 1));
  }
  return chosen;
}

function rollSubstats(random: () => number, keys: string[], rollsPerKey: number[]) {
  return keys.map((key, index) => ({
    key,
    value: round(key, SUBSTAT_ROLL[key] * rollsPerKey[index] * (0.8 + random() * 0.4)),
  }));
}

async function readJson<T>(relative: string) {
  return JSON.parse(await readFile(path.join(DATA, relative), 'utf8')) as T;
}

async function main() {
  const good = await readJson<{
    artifactSets: Record<string, number>;
    weapons: Record<string, number>;
    characters: Record<string, number>;
  }>('core/good.json');
  const coreArtifacts = await readJson<Record<string, { id: number; pieces: Record<string, unknown> }>>(
    'core/artifacts.json',
  );
  const coreWeapons = await readJson<Record<string, { id: number; rarity: number; weaponType: string }>>(
    'core/weapons.json',
  );
  const coreCharacters = await readJson<Record<string, { id: number; weaponType: string; rarity: number }>>(
    'core/characters.json',
  );
  const englishCharacters = await readJson<Record<string, { name: string }>>(
    'i18n/en/characters.json',
  );

  const random = rng(20260909);

  // Five-piece sets only: a circlet-only set cannot host a flower.
  const fullSets = Object.entries(good.artifactSets)
    .filter(([, id]) => Object.keys(coreArtifacts[id]?.pieces ?? {}).length === 5)
    .sort(([a], [b]) => a.localeCompare(b));

  // A handful of 5-star characters, each with a weapon of its own type — the
  // importer rejects a bow on a polearm user, so the fixture must be valid.
  const characters = Object.entries(good.characters)
    .filter(([, id]) => coreCharacters[id]?.rarity === 5)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 6);

  const weaponKeyById = new Map(
    Object.entries(good.weapons).map(([key, id]) => [id, key]),
  );

  const artifacts: GoodArtifact[] = [];
  const slots: Slot[] = ['flower', 'plume', 'sands', 'goblet', 'circlet'];

  // Equipped sets, one per character.
  characters.forEach(([characterKey], index) => {
    const [setKey] = fullSets[index % fullSets.length];
    const location = englishCharacters[good.characters[characterKey]].name;

    for (const slot of slots) {
      const mainStatKey = MAIN_STATS[slot][Math.floor(random() * MAIN_STATS[slot].length)];
      const keys = pickSubstats(random, mainStatKey, 4);
      artifacts.push({
        setKey,
        slotKey: slot,
        level: 20,
        rarity: 5,
        mainStatKey,
        substats: rollSubstats(random, keys, [3, 2, 2, 1]),
        location,
        lock: true,
        id: artifacts.length + 1,
      });
    }
  });

  // Loose pieces, unequipped.
  for (let i = 0; i < 24; i += 1) {
    const [setKey] = fullSets[Math.floor(random() * fullSets.length)];
    const slot = slots[Math.floor(random() * slots.length)];
    const mainStatKey = MAIN_STATS[slot][Math.floor(random() * MAIN_STATS[slot].length)];
    const level = [0, 4, 8, 12, 16, 20][Math.floor(random() * 6)];
    const keys = pickSubstats(random, mainStatKey, level >= 4 ? 4 : 3);
    artifacts.push({
      setKey,
      slotKey: slot,
      level,
      rarity: 5,
      mainStatKey,
      substats: rollSubstats(random, keys, [2, 1, 1, 1]),
      location: '',
      lock: false,
      id: artifacts.length + 1,
    });
  }

  /* ------------------------------------------------------- edge cases --- */

  const [twinSet] = fullSets[0];
  const twin: GoodArtifact = {
    setKey: twinSet, slotKey: 'flower', level: 0, rarity: 5, mainStatKey: 'hp',
    substats: [
      { key: 'critRate_', value: 3.5 },
      { key: 'atk_', value: 5.3 },
      { key: 'eleMas', value: 21 },
    ],
    location: '', lock: false, id: artifacts.length + 1,
  };
  // Byte-identical twin. Two pieces, and the importer must keep them two.
  artifacts.push(twin, { ...twin, id: twin.id! + 1 });

  // The same piece at +16, three substats grown to four. Must reconcile as one
  // upgrade, not as a second piece.
  artifacts.push({
    ...twin,
    level: 16,
    substats: [
      { key: 'critRate_', value: 10.1 },
      { key: 'atk_', value: 9.9 },
      { key: 'eleMas', value: 40 },
      { key: 'critDMG_', value: 13.2 },
    ],
    id: twin.id! + 2,
  });

  // Must be reported as unknown, never coerced onto a real set.
  artifacts.push({
    setKey: 'SetThatDoesNotExist', slotKey: 'goblet', level: 20, rarity: 5,
    mainStatKey: 'pyro_dmg_',
    substats: [{ key: 'critRate_', value: 7.0 }, { key: '', value: 0 }],
    location: '', lock: false, id: artifacts.length + 3,
  });

  const weapons = characters.map(([characterKey]) => {
    const character = coreCharacters[good.characters[characterKey]];
    const candidate = Object.values(coreWeapons).find(
      (weapon) => weapon.weaponType === character.weaponType && weapon.rarity === 4,
    );
    return {
      key: weaponKeyById.get(candidate!.id)!,
      level: 90,
      ascension: 6,
      refinement: 1 + Math.floor(random() * 5),
      location: englishCharacters[good.characters[characterKey]].name,
      lock: true,
    };
  });

  // The one key three weapon ids claim. Belongs in `excluded`, so the importer
  // must say "known ambiguous" rather than "unknown".
  weapons.push({
    key: 'PrizedIsshinBlade', level: 1, ascension: 0, refinement: 1,
    location: '', lock: false,
  });

  const fixture = {
    format: 'GOOD',
    version: 2,
    source: 'Inventory Kamera',
    // Non-spec, emitted by Inventory Kamera. Unknown top-level keys are ignored.
    kamera_version: '1.4.5',
    characters: characters.map(([key]) => ({
      key,
      level: 90,
      constellation: Math.floor(random() * 3),
      ascension: 6,
      talent: { auto: 9, skill: 9, burst: 9 },
    })),
    weapons,
    artifacts,
    materials: { HerosWit: 421, MysticEnhancementOre: 1180 },
  };

  await writeFile(OUT, `${JSON.stringify(fixture, null, 2)}\n`);

  console.log(
    `fixture: ${fixture.characters.length} characters, ${weapons.length} weapons, ` +
    `${artifacts.length} artifacts → ${path.relative(process.cwd(), OUT)}`,
  );
}

await main();
