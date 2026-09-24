import { normalizeGoodKey } from './derive';

/**
 * Resolves GOOD's name keys to catalog ids.
 *
 * Pure, and built from the generated crosswalk rather than reading it, so the
 * import layer is testable without a filesystem and the same resolver serves a
 * server action and a unit test.
 */

export type GoodCrosswalk = {
  version: number;
  artifactSets: Record<string, number>;
  weapons: Record<string, number>;
  characters: Record<string, number>;
  materials: Record<string, number>;
  traveler: {
    bodies: { male: number; female: number };
    elementByKey: Record<string, string>;
  };
  excluded: {
    artifactSets: Record<string, number[]>;
    weapons: Record<string, number[]>;
    characters: Record<string, number[]>;
    materials: Record<string, number[]>;
  };
};

export type Resolution =
  | { kind: 'exact'; id: number }
  /** Matched only after case and punctuation folding. Usable, but reported. */
  | { kind: 'lenient'; id: number; canonical: string }
  /** A key the catalog knows to be claimed by several ids. */
  | { kind: 'ambiguous'; ids: number[] }
  | { kind: 'unknown' };

export type TravelerResolution = {
  kind: 'traveler';
  /** GOOD carries no gender, so the body is a choice the caller makes. */
  bodies: { male: number; female: number };
  element: string | null;
};

type Table = {
  exact: Record<string, number>;
  lenient: Map<string, { id: number; canonical: string }>;
  excluded: Record<string, number[]>;
};

function buildTable(exact: Record<string, number>, excluded: Record<string, number[]>): Table {
  const lenient = new Map<string, { id: number; canonical: string }>();
  for (const [key, id] of Object.entries(exact)) {
    lenient.set(normalizeGoodKey(key), { id, canonical: key });
  }
  return { exact, lenient, excluded };
}

function resolve(table: Table, key: string): Resolution {
  const exact = table.exact[key];
  if (exact !== undefined) return { kind: 'exact', id: exact };

  const ambiguous = table.excluded[key];
  if (ambiguous) return { kind: 'ambiguous', ids: ambiguous };

  // Absorbs a pure casing or punctuation divergence. The build asserts this
  // space is collision-free, so it can never land on the wrong entity.
  const lenient = table.lenient.get(normalizeGoodKey(key));
  if (lenient) return { kind: 'lenient', ...lenient };

  return { kind: 'unknown' };
}

export type KeyResolver = {
  artifactSet: (key: string) => Resolution;
  weapon: (key: string) => Resolution;
  /** The Traveler resolves separately: it has no single id. */
  character: (key: string) => Resolution | TravelerResolution;
  /** GOOD's `location` uses the same vocabulary as `characters[].key`. */
  location: (key: string) => Resolution | TravelerResolution | null;
  material: (key: string) => Resolution;
  knownKeys: (of: 'artifactSets' | 'weapons' | 'characters' | 'materials') => string[];
};

/**
 * Names a scanner writes that the GOOD key list does not.
 *
 * Inventory Kamera writes the two Manekins as `Manequin1` and `Manequin2`
 * where the key list has `Manekin` and `Manekina`, so a weapon one of them
 * holds arrived unassigned, with a warning on every import.
 */
const ALIASES: Record<string, string> = {
  Manequin1: 'Manekin',
  Manequin2: 'Manekina',
};

export function createKeyResolver(crosswalk: GoodCrosswalk): KeyResolver {
  const sets = buildTable(crosswalk.artifactSets, crosswalk.excluded.artifactSets);
  const weapons = buildTable(crosswalk.weapons, crosswalk.excluded.weapons);
  const characters = buildTable(crosswalk.characters, crosswalk.excluded.characters);
  const materials = buildTable(crosswalk.materials, crosswalk.excluded.materials);

  const travelerKeys = new Set<string>([
    'Traveler', 'TravelerM', 'TravelerF',
    ...Object.keys(crosswalk.traveler.elementByKey),
  ]);

  function character(raw: string): Resolution | TravelerResolution {
    const key = ALIASES[raw] ?? raw;
    if (travelerKeys.has(key)) {
      return {
        kind: 'traveler',
        bodies: crosswalk.traveler.bodies,
        element: crosswalk.traveler.elementByKey[key] ?? null,
      };
    }
    return resolve(characters, key);
  }

  return {
    artifactSet: (key) => resolve(sets, key),
    weapon: (key) => resolve(weapons, key),
    character,
    material: (key) => resolve(materials, key),
    location: (key) => (key === '' ? null : character(key)),
    knownKeys: (of) => Object.keys(crosswalk[of]),
  };
}
