import type { ArtifactSlot } from '@/lib/data/types';
import {
  IssueLog,
  asArray,
  asEnum,
  asInt,
  asNumber,
  asObject,
  asOptionalBoolean,
  asString,
  nearestKey,
} from '@/lib/inventory/guards';
import type {
  NormalizedArtifact,
  NormalizedCharacter,
  NormalizedImport,
  NormalizedMaterial,
  NormalizedStat,
  NormalizedWeapon,
} from '@/lib/inventory/model';

import type { KeyResolver, Resolution, TravelerResolution } from './keys';
import { GOOD_SLOTS, LIMITS, SUPPORTED_VERSIONS } from './schema';
import { PROP_BY_GOOD_STAT, type GoodStatKey, isRollableSubstat } from './stats';

/**
 * Turns an uploaded GOOD file into the normalized shape.
 *
 * Two rules govern the whole file:
 *
 *   1. **The envelope aborts, an item does not.** A wrong `format` means this
 *      is not a GOOD file at all. A bad artifact means one artifact is skipped
 *      and reported, while the other 1275 import.
 *   2. **An unrecognized key is never coerced.** It is reported with the raw
 *      value and a nearest-match suggestion, because silently mapping an
 *      unknown set onto a real one corrupts the inventory it is supposed to
 *      describe.
 */

export type ParseResult =
  | { ok: true; value: NormalizedImport }
  /** The envelope failed. There is nothing to salvage. */
  | { ok: false; value: NormalizedImport };

/**
 * `travelerBody` picks which Traveler the file's `Traveler` entries belong to.
 * GOOD carries no gender, so it cannot be inferred — the caller decides, and
 * the default matches the more common export.
 */
export type ParseOptions = {
  resolver: KeyResolver;
  observedAt?: string;
  travelerBody?: 'male' | 'female';
};

export function parseGood(input: unknown, options: ParseOptions): ParseResult {
  const log = new IssueLog();
  const observedAt = options.observedAt ?? new Date().toISOString();
  const { resolver } = options;
  const travelerBody = options.travelerBody ?? 'male';

  const empty = (): NormalizedImport => ({
    source: 'good',
    coverage: 'full',
    observedAt,
    origin: 'unknown',
    characters: [],
    weapons: [],
    artifacts: [],
    materials: [],
    issues: log.issues,
  });

  const root = asObject(input, '', log);
  if (!root) return { ok: false, value: empty() };

  if (root.format !== 'GOOD') {
    log.add('envelope', 'format', 'not a GOOD file', { raw: root.format });
    return { ok: false, value: empty() };
  }

  const version = asInt(root.version, 'version', log, 1, 99);
  if (version === undefined) return { ok: false, value: empty() };
  if (!SUPPORTED_VERSIONS.includes(version as (typeof SUPPORTED_VERSIONS)[number])) {
    log.add('envelope', 'version', `unsupported GOOD version ${version}`, { raw: version });
    return { ok: false, value: empty() };
  }

  const origin = typeof root.source === 'string' ? root.source : 'unknown';

  const artifacts = parseArtifacts(root.artifacts, log, resolver, travelerBody);
  const weapons = parseWeapons(root.weapons, log, resolver, travelerBody);
  const characters = parseCharacters(root.characters, log, resolver, travelerBody);
  const materials = parseMaterials(root.materials, log, resolver);

  return {
    ok: true,
    value: {
      source: 'good',
      // A GOOD export is a snapshot of the whole inventory, which is the only
      // thing that makes "this piece is gone" a claim anyone can make.
      coverage: 'full',
      observedAt,
      origin,
      characters,
      weapons,
      artifacts,
      materials,
      issues: log.issues,
    },
  };
}

/**
 * Counts by material name.
 *
 * Not part of the GOOD spec — Inventory Kamera adds it — and keyed by name
 * rather than id, so five names shared by several quest items cannot resolve.
 * None of those appears in any ascension or talent cost, so the planner is
 * unaffected and the ambiguity is reported rather than guessed at.
 */
function parseMaterials(
  raw: unknown,
  log: IssueLog,
  resolver: KeyResolver,
): NormalizedMaterial[] {
  if (raw === undefined || raw === null) return [];

  const object = asObject(raw, 'materials', log);
  if (!object) return [];

  const materials: NormalizedMaterial[] = [];

  for (const [key, value] of Object.entries(object)) {
    const path = `materials.${key}`;
    const count = asInt(value, path, log, 0, 100_000_000);
    if (count === undefined) continue;

    const resolution = resolver.material(key);
    switch (resolution.kind) {
      case 'exact':
        materials.push({ materialId: resolution.id, count });
        break;
      case 'lenient':
        log.add('lenient-key', path, `resolved "${key}" as "${resolution.canonical}"`, {
          raw: key, suggestion: resolution.canonical, severity: 'warning',
        });
        materials.push({ materialId: resolution.id, count });
        break;
      case 'ambiguous':
        log.add('ambiguous-key', path, `"${key}" is shared by ${resolution.ids.length} items`, {
          raw: key, severity: 'warning',
        });
        break;
      default:
        log.add('unknown-set-key', path, `no material matches "${key}"`, {
          raw: key,
          suggestion: nearestKey(key, resolver.knownKeys('materials')),
          severity: 'warning',
        });
    }
  }

  return materials;
}

/* ------------------------------------------------------------- helpers --- */

/**
 * Resolves a `location` to a character id. Returns `undefined` when the holder
 * cannot be identified — the item is still imported, just unassigned, because
 * losing a piece is worse than losing the knowledge of who wore it.
 */
function resolveHolder(
  raw: unknown,
  path: string,
  log: IssueLog,
  resolver: KeyResolver,
  travelerBody: 'male' | 'female',
) {
  if (raw === undefined || raw === null || raw === '') return null;

  const key = asString(raw, path, log);
  if (key === undefined) return null;
  if (key === '') return null;

  const resolution = resolver.location(key);
  if (!resolution) return null;

  if (resolution.kind === 'traveler') {
    return resolution.bodies[travelerBody];
  }

  switch (resolution.kind) {
    case 'exact':
      return resolution.id;
    case 'lenient':
      log.add('lenient-key', path, `resolved "${key}" as "${resolution.canonical}"`, {
        raw: key,
        suggestion: resolution.canonical,
        severity: 'warning',
      });
      return resolution.id;
    case 'ambiguous':
      log.add('ambiguous-key', path, `"${key}" is claimed by ${resolution.ids.length} ids`, {
        raw: key,
      });
      return null;
    default:
      log.add('unknown-location', path, `no character matches "${key}"`, {
        raw: key,
        suggestion: nearestKey(key, resolver.knownKeys('characters')),
        severity: 'warning',
      });
      return null;
  }
}

function statProp(raw: unknown, path: string, log: IssueLog) {
  const key = asString(raw, path, log);
  if (key === undefined) return undefined;

  const prop = PROP_BY_GOOD_STAT[key as GoodStatKey];
  if (!prop) {
    return log.add('unknown-stat-key', path, `unknown stat "${key}"`, {
      raw: key,
      suggestion: nearestKey(key, Object.keys(PROP_BY_GOOD_STAT)),
    });
  }
  return prop;
}

function parseStats(
  raw: unknown,
  path: string,
  log: IssueLog,
): NormalizedStat[] | undefined {
  const entries = asArray(raw ?? [], path, log, LIMITS.substats);
  if (!entries) return undefined;

  const stats: NormalizedStat[] = [];

  entries.forEach((entry, index) => {
    const itemPath = `${path}[${index}]`;
    const object = asObject(entry, itemPath, log);
    if (!object) return;

    // An empty key is an unfilled slot, which is a legitimate state rather
    // than a defect. Genshin Optimizer pads substats out to four this way.
    if (object.key === '' || object.key === undefined || object.key === null) return;

    const prop = statProp(object.key, `${itemPath}.key`, log);
    const value = asNumber(object.value, `${itemPath}.value`, log);
    if (prop === undefined || value === undefined) return;

    if (!isRollableSubstat(prop)) {
      // Elemental damage, healing and flat base ATK are main stats only, so
      // this is a misread rather than a rare roll.
      log.add('inconsistent', `${itemPath}.key`, `${prop} cannot roll as a substat`, {
        raw: object.key,
        severity: 'warning',
      });
      return;
    }

    stats.push({ prop, value });
  });

  return stats;
}

function parseArtifacts(
  raw: unknown,
  log: IssueLog,
  resolver: KeyResolver,
  travelerBody: 'male' | 'female',
): NormalizedArtifact[] {
  if (raw === undefined) return [];

  const entries = asArray(raw, 'artifacts', log, LIMITS.artifacts);
  if (!entries) return [];

  const artifacts: NormalizedArtifact[] = [];

  entries.forEach((entry, index) => {
    const path = `artifacts[${index}]`;
    const object = asObject(entry, path, log);
    if (!object) return;

    const setKey = asString(object.setKey, `${path}.setKey`, log);
    if (setKey === undefined) return;

    const setId = resolveSet(setKey, `${path}.setKey`, log, resolver);
    if (setId === undefined) return;

    const slot = asEnum<ArtifactSlot>(
      object.slotKey, `${path}.slotKey`, log, GOOD_SLOTS, 'unknown-slot',
    );
    const rarity = asInt(object.rarity, `${path}.rarity`, log, 1, 5);
    const level = asInt(object.level, `${path}.level`, log, 0, 20);
    const mainProp = statProp(object.mainStatKey, `${path}.mainStatKey`, log);
    const substats = parseStats(object.substats, `${path}.substats`, log);
    const unactivated = parseStats(
      object.unactivatedSubstats, `${path}.unactivatedSubstats`, log,
    );

    if (
      slot === undefined || rarity === undefined || level === undefined ||
      mainProp === undefined || substats === undefined || unactivated === undefined
    ) {
      return;
    }

    artifacts.push({
      setId,
      slot,
      rarity,
      level,
      mainProp,
      substats,
      unactivatedSubstats: unactivated,
      lock: asOptionalBoolean(object.lock, `${path}.lock`, log),
      // GOOD has no roll history. Only Enka observes it.
      rollHistory: null,
      equippedTo: resolveHolder(object.location, `${path}.location`, log, resolver, travelerBody),
    });
  });

  return artifacts;
}

function resolveSet(
  key: string,
  path: string,
  log: IssueLog,
  resolver: KeyResolver,
) {
  const resolution = resolver.artifactSet(key);

  switch (resolution.kind) {
    case 'exact':
      return resolution.id;
    case 'lenient':
      log.add('lenient-key', path, `resolved "${key}" as "${resolution.canonical}"`, {
        raw: key, suggestion: resolution.canonical, severity: 'warning',
      });
      return resolution.id;
    case 'ambiguous':
      log.add('ambiguous-key', path, `"${key}" is claimed by ${resolution.ids.length} ids`, {
        raw: key,
      });
      return undefined;
    default:
      log.add('unknown-set-key', path, `no artifact set matches "${key}"`, {
        raw: key,
        suggestion: nearestKey(key, resolver.knownKeys('artifactSets')),
      });
      return undefined;
  }
}

function parseWeapons(
  raw: unknown,
  log: IssueLog,
  resolver: KeyResolver,
  travelerBody: 'male' | 'female',
): NormalizedWeapon[] {
  if (raw === undefined) return [];

  const entries = asArray(raw, 'weapons', log, LIMITS.weapons);
  if (!entries) return [];

  const weapons: NormalizedWeapon[] = [];

  entries.forEach((entry, index) => {
    const path = `weapons[${index}]`;
    const object = asObject(entry, path, log);
    if (!object) return;

    const key = asString(object.key, `${path}.key`, log);
    if (key === undefined) return;

    const resolution = resolver.weapon(key);
    const weaponId = idOf(resolution, key, `${path}.key`, log, resolver, 'weapons');
    if (weaponId === undefined) return;

    const level = asInt(object.level, `${path}.level`, log, 1, 90);
    const ascension = asInt(object.ascension, `${path}.ascension`, log, 0, 6);
    const refinement = asInt(object.refinement, `${path}.refinement`, log, 1, 5);
    if (level === undefined || ascension === undefined || refinement === undefined) return;

    weapons.push({
      weaponId,
      level,
      ascension,
      refinement,
      lock: asOptionalBoolean(object.lock, `${path}.lock`, log),
      equippedTo: resolveHolder(object.location, `${path}.location`, log, resolver, travelerBody),
    });
  });

  return weapons;
}

function idOf(
  resolution: Resolution,
  key: string,
  path: string,
  log: IssueLog,
  resolver: KeyResolver,
  of: 'weapons' | 'characters',
) {
  switch (resolution.kind) {
    case 'exact':
      return resolution.id;
    case 'lenient':
      log.add('lenient-key', path, `resolved "${key}" as "${resolution.canonical}"`, {
        raw: key, suggestion: resolution.canonical, severity: 'warning',
      });
      return resolution.id;
    case 'ambiguous':
      log.add('ambiguous-key', path, `"${key}" is claimed by ${resolution.ids.length} ids`, {
        raw: key, severity: 'warning',
      });
      return undefined;
    default:
      log.add(
        of === 'weapons' ? 'unknown-weapon-key' : 'unknown-character-key',
        path, `nothing matches "${key}"`,
        { raw: key, suggestion: nearestKey(key, resolver.knownKeys(of)) },
      );
      return undefined;
  }
}

function parseCharacters(
  raw: unknown,
  log: IssueLog,
  resolver: KeyResolver,
  travelerBody: 'male' | 'female',
): NormalizedCharacter[] {
  if (raw === undefined) return [];

  const entries = asArray(raw, 'characters', log, LIMITS.characters);
  if (!entries) return [];

  const characters: NormalizedCharacter[] = [];

  entries.forEach((entry, index) => {
    const path = `characters[${index}]`;
    const object = asObject(entry, path, log);
    if (!object) return;

    const key = asString(object.key, `${path}.key`, log);
    if (key === undefined) return;

    const resolution = resolver.character(key);
    let characterId: number | undefined;
    let travelerElement: string | null = null;

    if (isTraveler(resolution)) {
      characterId = resolution.bodies[travelerBody];
      travelerElement = resolution.element;
    } else {
      characterId = idOf(resolution, key, `${path}.key`, log, resolver, 'characters');
    }
    if (characterId === undefined) return;

    const level = asInt(object.level, `${path}.level`, log, 1, 100);
    const ascension = asInt(object.ascension, `${path}.ascension`, log, 0, 6);
    const constellation = asInt(object.constellation, `${path}.constellation`, log, 0, 6);
    const talent = asObject(object.talent, `${path}.talent`, log);
    if (
      level === undefined || ascension === undefined ||
      constellation === undefined || !talent
    ) {
      return;
    }

    const auto = asInt(talent.auto, `${path}.talent.auto`, log, 1, 10);
    const skill = asInt(talent.skill, `${path}.talent.skill`, log, 1, 10);
    const burst = asInt(talent.burst, `${path}.talent.burst`, log, 1, 10);
    if (auto === undefined || skill === undefined || burst === undefined) return;

    characters.push({
      characterId,
      travelerElement,
      level,
      ascension,
      constellation,
      talent: { auto, skill, burst },
      // GOOD cannot express the constellation bonus, so it stays unknown and a
      // later Enka import is what fills it in.
      talentBonus: null,
    });
  });

  return characters;
}

function isTraveler(
  resolution: Resolution | TravelerResolution,
): resolution is TravelerResolution {
  return resolution.kind === 'traveler';
}
