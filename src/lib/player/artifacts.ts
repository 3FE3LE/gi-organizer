import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import type { ArtifactSlot } from '@/lib/data/types';
import { critRating, critValue, pieceQuality, type CritRating, type RollQuality } from '@/lib/rules/rolls';
import { pieceWorth, type Scaler } from '@/lib/rules/worth';

import { getProfileId } from './db';

/**
 * The whole box, as a fact about the account rather than about a character.
 *
 * Every other view of the inventory asks "is this good for *them*", which is
 * the right question when a character is on screen and the wrong one when
 * nobody is: there are a thousand pieces and most of them are on somebody, and
 * finding the one that rolled four times into crit means looking at all of them
 * at once. So this reads the box, judges each piece on how its rolls landed —
 * the game's own table, not any build's priorities — and says who is wearing it.
 */

export type OwnedArtifact = {
  instanceId: string;
  setId: number;
  slot: ArtifactSlot;
  rarity: number;
  level: number;
  mainProp: string;
  substats: { prop: string; value: number }[];
  /** Null when nobody is wearing it. */
  holderId: number | null;
  locked: boolean | null;
  /** How the dice treated it: rolls, count and average tier per substat. */
  quality: {
    substats: RollQuality[];
    rolls: number;
    count: number;
    efficiency: number | null;
    hasPerfect: boolean;
  };
  /** `2 × Prob. CRIT + Daño CRIT`, over substats. Zero for a non-crit piece. */
  critValue: number;
  critRating: CritRating;
};

type Row = {
  id: string;
  set_id: number;
  slot: string;
  rarity: number;
  level: number;
  main_prop: string;
  substats_json: string;
  locked: number | null;
  assigned_character_id: number | null;
};

export async function readArtifacts(db: Db = getDb()): Promise<OwnedArtifact[]> {
  const rows = (await db
    .prepare(`SELECT id, set_id, slot, rarity, level, main_prop, substats_json,
                     locked, assigned_character_id
              FROM artifact_instance WHERE profile_id = ?`)
    .all(await getProfileId(db))) as unknown as Row[];

  return rows.map((row) => {
    const substats = JSON.parse(row.substats_json) as { prop: string; value: number }[];
    const piece = { rarity: row.rarity, substats };

    const crit = critValue(substats);

    return {
      instanceId: row.id,
      setId: row.set_id,
      slot: row.slot as ArtifactSlot,
      rarity: row.rarity,
      level: row.level,
      mainProp: row.main_prop,
      substats,
      holderId: row.assigned_character_id,
      locked: row.locked === null ? null : row.locked === 1,
      quality: pieceQuality(piece),
      critValue: crit,
      critRating: critRating(crit),
    };
  });
}

export type ArtifactFilter = {
  slot?: ArtifactSlot | null;
  setId?: number | null;
  /** A substat the piece must carry. */
  substat?: string | null;
  /** The piece's main stat, which is a search axis rather than a score. */
  mainProp?: string | null;
  /** `free` is nobody's, `worn` is on somebody. */
  held?: 'free' | 'worn' | null;
  /** Only pieces with a substat where every roll landed maximum. */
  perfectOnly?: boolean;
  /** Minimum average tier, as a fraction. `0.9` means "alto or better". */
  minEfficiency?: number | null;
  /** Minimum crit value. Narrows the box to what a crit build would want. */
  minCritValue?: number | null;
};

export type ArtifactSort = 'valor' | 'calidad' | 'cv' | 'rolls' | 'nivel' | 'set';

/**
 * Filtering and ordering, in one place because the page is a list and the list
 * *is* the feature. Sorting by quality first is the default on purpose: the
 * question that brings anyone here is "what did I get that is actually good".
 */
export function filterArtifacts(
  artifacts: OwnedArtifact[],
  filter: ArtifactFilter,
  sort: ArtifactSort = 'valor',
  scaler: Scaler | null = null,
): OwnedArtifact[] {
  const kept = artifacts.filter((piece) => {
    if (filter.slot && piece.slot !== filter.slot) return false;
    if (filter.setId && piece.setId !== filter.setId) return false;
    if (filter.mainProp && piece.mainProp !== filter.mainProp) return false;
    if (filter.held === 'free' && piece.holderId !== null) return false;
    if (filter.held === 'worn' && piece.holderId === null) return false;
    if (filter.perfectOnly && !piece.quality.hasPerfect) return false;
    if (filter.substat && !piece.substats.some((entry) => entry.prop === filter.substat)) {
      return false;
    }
    if (filter.minEfficiency && (piece.quality.efficiency ?? 0) < filter.minEfficiency) {
      return false;
    }
    if (filter.minCritValue && piece.critValue < filter.minCritValue) return false;
    return true;
  });

  // Worth depends on the scaler, so it is not a property of the piece and is
  // not cached on it. Computed once per piece here rather than inside the
  // comparator, which a sort calls a few thousand times for a box this size.
  if (sort === 'valor') {
    const value = new Map(kept.map(
      (piece) => [piece.instanceId, pieceWorth(piece, scaler).value] as const,
    ));

    return kept.sort((a, b) =>
      (value.get(b.instanceId) ?? 0) - (value.get(a.instanceId) ?? 0)
      || b.critValue - a.critValue);
  }

  return kept.sort(comparators[sort]);
}

type Comparator = (a: OwnedArtifact, b: OwnedArtifact) => number;

/** `valor` is missing on purpose: it needs the scaler, so it is not a pure pair. */
const comparators: Record<Exclude<ArtifactSort, 'valor'>, Comparator> = {
  // Quality first, then how much of it there is: a piece that rolled perfectly
  // once is promising, one that rolled well five times is finished.
  calidad: (a, b) =>
    (b.quality.efficiency ?? 0) - (a.quality.efficiency ?? 0)
    || b.quality.rolls - a.quality.rolls,
  // Crit value is a narrower question than quality — it only speaks for crit
  // builds — so it is an ordering you ask for, never the default.
  cv: (a, b) => b.critValue - a.critValue || b.quality.rolls - a.quality.rolls,
  rolls: (a, b) => b.quality.rolls - a.quality.rolls
    || (b.quality.efficiency ?? 0) - (a.quality.efficiency ?? 0),
  nivel: (a, b) => b.level - a.level || b.quality.rolls - a.quality.rolls,
  set: (a, b) => a.setId - b.setId || a.slot.localeCompare(b.slot) || b.level - a.level,
};
