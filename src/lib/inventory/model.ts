import type { ArtifactSlot } from '@/lib/data/types';

/**
 * The one shape both importers produce.
 *
 * Downstream code never branches on where an item came from. What it does
 * branch on is `coverage`: only a source that saw the whole inventory may claim
 * that a missing item is gone.
 */

export type ImportSource = 'enka' | 'good' | 'manual';

/**
 * Always Enka's scale — `22.1` means 22.1 percent, and a flat stat is a flat
 * number. GOOD uses the same convention, so nothing is rescaled on the way in.
 * Render with `formatPropValue(prop, value, 'percent')`.
 */
export type NormalizedStat = { prop: string; value: number };

export type NormalizedArtifact = {
  setId: number;
  slot: ArtifactSlot;
  rarity: number;
  /** 0-20, as the game displays it. Enka's `reliquary.level` is 1-based. */
  level: number;
  mainProp: string;
  substats: NormalizedStat[];
  /**
   * A fourth substat the piece will gain but has not activated yet. Inventory
   * Kamera reports it; Enka does not. Never counted as an active substat — it
   * only sharpens the match between a piece and its own levelled self.
   */
  unactivatedSubstats: NormalizedStat[];
  /** `null` means the source cannot see locks, not that the piece is unlocked. */
  lock: boolean | null;
  /** Enka only: append-only roll order, which identifies a piece exactly. */
  rollHistory: number[] | null;
  /** Character id of the holder, or null. */
  equippedTo: number | null;
};

export type NormalizedWeapon = {
  weaponId: number;
  level: number;
  ascension: number;
  refinement: number;
  lock: boolean | null;
  equippedTo: number | null;
};

export type NormalizedCharacter = {
  characterId: number;
  /** Only ever set for the Traveler, whose skills change with the element. */
  travelerElement: string | null;
  /**
   * The Traveler's skill depot for that element, resolved against the catalog
   * by the import before it writes. Absent everywhere else.
   */
  skillDepotId?: number | null;
  level: number;
  ascension: number;
  constellation: number;
  /** Base levels, 1-10, excluding the constellation bonus. */
  talent: { auto: number; skill: number; burst: number };
  /** Enka only: the +3 from C3/C5. GOOD cannot express it. */
  talentBonus: { auto: number; skill: number; burst: number } | null;
};

export type NormalizedMaterial = { materialId: number; count: number };

export type NormalizedImport = {
  source: ImportSource;
  /**
   * `full` saw the whole inventory, `partial` saw a slice. An Enka showcase
   * lists at most eight characters, so its silence about the rest is not
   * evidence — this is the field that stops a seed from deleting a collection.
   */
  coverage: 'full' | 'partial';
  observedAt: string;
  /** The GOOD file's `source`, or `enka:<uid>`. */
  origin: string;
  characters: NormalizedCharacter[];
  weapons: NormalizedWeapon[];
  artifacts: NormalizedArtifact[];
  /** Counts, when the source reports them. Enka never does. */
  materials: NormalizedMaterial[];
  issues: ImportIssue[];
};

export type ImportIssueCode =
  | 'envelope'
  | 'unknown-set-key'
  | 'unknown-weapon-key'
  | 'unknown-character-key'
  | 'unknown-stat-key'
  | 'unknown-slot'
  | 'unknown-location'
  | 'ambiguous-key'
  | 'lenient-key'
  | 'wrong-type'
  | 'out-of-range'
  | 'missing-field'
  | 'inconsistent';

export type ImportIssue = {
  code: ImportIssueCode;
  severity: 'error' | 'warning';
  /** `artifacts[413].substats[2].key` — enough to find it in the source file. */
  path: string;
  message: string;
  /** The value that could not be used, for a "did you mean" in the report. */
  raw?: unknown;
  suggestion?: string;
};

/** Groups issues for a report that never collapses to "some items failed". */
export function summarizeIssues(issues: ImportIssue[]) {
  const groups = new Map<ImportIssueCode, { count: number; examples: ImportIssue[] }>();

  for (const issue of issues) {
    const group = groups.get(issue.code) ?? { count: 0, examples: [] };
    group.count += 1;
    if (group.examples.length < 5) group.examples.push(issue);
    groups.set(issue.code, group);
  }

  return [...groups]
    .map(([code, group]) => ({ code, ...group }))
    .sort((a, b) => b.count - a.count);
}
