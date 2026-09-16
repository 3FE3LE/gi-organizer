import 'server-only';

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { GoodCrosswalk } from '@/lib/good/keys';

import type { Locale } from './locales';
import type { WeaponSourceEntry } from './weapon-sources';
import type {
  ById,
  CharacterDetailStrings,
  CoreArtifact,
  CoreCharacter,
  CoreMaterial,
  CoreWeapon,
  EnkaStore,
  Meta,
} from './types';

/**
 * Low-level reader for the generated dataset. Files are read from disk rather
 * than imported so a 12 MB tree never enters the bundle graph, and each one is
 * parsed at most once per server process.
 *
 * Feature code should go through `catalog.ts`; this module exists so the catalog
 * has something to assemble from, and for the per-character shards that are
 * deliberately not part of it.
 */
const DATA_DIR = path.join(process.cwd(), 'src', 'generated', 'data');

const cache = new Map<string, Promise<unknown>>();

function load<T>(relative: string): Promise<T> {
  let pending = cache.get(relative) as Promise<T> | undefined;
  if (!pending) {
    pending = readFile(path.join(DATA_DIR, relative), 'utf8').then(
      (raw) => JSON.parse(raw) as T,
    );
    cache.set(relative, pending);
  }
  return pending;
}

export const getMeta = () => load<Meta>('meta.json');

export const getCoreCharacters = () => load<ById<CoreCharacter>>('core/characters.json');
export const getCoreWeapons = () => load<ById<CoreWeapon>>('core/weapons.json');
export const getCoreArtifacts = () => load<ById<CoreArtifact>>('core/artifacts.json');
export const getCoreMaterials = () => load<ById<CoreMaterial>>('core/materials.json');

/** GOOD name-key to catalog id. Emitted by `pnpm data:build`. */
export const getGoodCrosswalk = () => load<GoodCrosswalk>('core/good.json');

/** Enka's skill-ordering table. Refreshed by `pnpm data:enka`. */
export const getEnkaStore = () => load<EnkaStore>('enka/characters.json');

/**
 * Asset names that the host routed for their kind does not serve, recorded by
 * `pnpm data:check-assets --all`. All 38 are obscure quest and TCG items; none
 * is an ascension, talent or weapon material, so no cost list is affected.
 */
export const getMissingAssets = async () =>
  new Set(await load<string[]>('assets-missing.json'));

type StringFile = 'characters' | 'weapons' | 'artifacts' | 'materials' | 'props';

export function loadStrings<T>(file: StringFile, locale: Locale) {
  return load<ById<T>>(`i18n/${locale}/${file}.json`);
}

/**
 * How a weapon is obtained, curated by hand — see `weapon-sources.ts` for why
 * it cannot be generated. Outside `src/generated`, so `pnpm data:build` cannot
 * delete it.
 */
export async function getWeaponSources() {
  const file = path.join(process.cwd(), 'src', 'data', 'curated', 'weapon-sources.json');

  try {
    const raw = await readFile(file, 'utf8');
    const parsed = JSON.parse(raw) as { sources: Record<string, WeaponSourceEntry> };
    return new Map(Object.entries(parsed.sources).map(([id, entry]) => [Number(id), entry]));
  } catch {
    return new Map<number, WeaponSourceEntry>();
  }
}

const EMPTY_DETAIL: CharacterDetailStrings = { talents: null, constellation: null };

/**
 * Talents and constellations, sharded per character. Kept out of the catalog on
 * purpose: it is over 1 MB per locale and only ever read for one character at a
 * time, so loading it eagerly would pay for 121 characters nobody asked for.
 */
export async function getCharacterDetailStrings(locale: Locale, id: number) {
  const file = `i18n/${locale}/characters/${id}.json`;
  try {
    return await load<CharacterDetailStrings>(file);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      cache.delete(file);
      return EMPTY_DETAIL;
    }
    throw error;
  }
}
