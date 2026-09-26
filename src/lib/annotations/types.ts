import type { TeamRole } from '@/lib/rules/types';

/**
 * Facts the game data does not carry.
 *
 * The game data is a pure mirror: no role, tag, mechanic, archetype or rework
 * field exists anywhere in it, and `version` is the debut patch — Zhongli still
 * reports 1.1 despite the 1.3 rework. Anything editorial has to be asserted
 * here, keyed by id and reviewed per entry.
 */

export type Stacking =
  /** Two wearers both benefit. */
  | 'stacks'
  /** The second wearer's contribution is wasted. */
  | 'non-stacking'
  /** Non-stacking only within a partition, as with Viridescent Venerer. */
  | 'partitioned'
  /** Reads party-wide, buffs only the wearer. */
  | 'wearer-only'
  /** Not reviewed. Seeded this way on purpose — a wrong guess looks reviewed. */
  | 'unknown';

export type SetAnnotation = {
  stacking: Stacking;
  /**
   * The two-piece bonus as a stat vector, so the totals layer can add it.
   * Four-piece effects are deliberately absent: almost all are conditional, and
   * summing them would need a damage model and an uptime assumption.
   */
  bonus2pc?: { prop: string; value: number }[];
  /** The `TeamSlot` declaration that partitions the check. */
  partitionField?: string;
  roles?: TeamRole[];
  mechanics?: string[];
  note?: string;
  evidence?: 'wiki' | 'in-game-test' | 'community' | 'guess';
  reviewedInVersion: string;
};

export type CharacterAnnotation = {
  mechanics?: string[];
  roles?: TeamRole[];
  /** The patch that reworked them, which no field in the game data records. */
  reworkedIn?: string;
  note?: string;
  reviewedInVersion: string;
};

export type WeaponAnnotation = {
  roles?: TeamRole[];
  mechanics?: string[];
  note?: string;
  reviewedInVersion: string;
};

export type AnnotationFile = {
  schemaVersion: 1;
  gameVersion: string;
  genshinDbVersion: string;
  reviewedAt: string;
  mechanics: Record<string, { label: string; since: string; note?: string }>;
  sets: Record<string, SetAnnotation>;
  characters: Record<string, CharacterAnnotation>;
  weapons: Record<string, WeaponAnnotation>;
};

/**
 * A user's edits, merged over the seed. `null` tombstones a seed entry rather
 * than deleting it, so a seed refresh stays idempotent.
 */
export type AnnotationOverrides = {
  sets?: Record<string, SetAnnotation | null>;
  characters?: Record<string, CharacterAnnotation | null>;
  weapons?: Record<string, WeaponAnnotation | null>;
};

export type ResolvedAnnotations = {
  gameVersion: string;
  mechanics: AnnotationFile['mechanics'];
  sets: Map<number, SetAnnotation>;
  characters: Map<number, CharacterAnnotation>;
  weapons: Map<number, WeaponAnnotation>;
  /** Entries last reviewed before the catalog's game version. */
  stale: { kind: 'set' | 'character' | 'weapon'; id: number; reviewedInVersion: string }[];
};
