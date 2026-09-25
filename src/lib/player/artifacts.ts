import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import type { ArtifactSlot } from '@/lib/data/types';
import {
  CRIT_WEIGHTS, critRating, critValue, pieceQuality, type CritRating, type RollQuality,
} from '@/lib/rules/rolls';
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
  /** The locked fourth substat, unlocked at +4. Not scored until it is. */
  unactivated: { prop: string; value: number }[];
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
  /**
   * The same once the locked fourth line unlocks at +4, when the piece has
   * one that changes it; `null` otherwise. Orderings and the crit cut-off
   * read this: the line has rolled already, and reaching +4 only reveals it.
   */
  critValueAtFour: number | null;
  critRating: CritRating;
  /**
   * How well its crit rolls landed, line by line: the average tier of each
   * crit substat, summed. See `critPotential`.
   */
  critPotential: number;
};

type Row = {
  id: string;
  set_id: number;
  slot: string;
  rarity: number;
  level: number;
  main_prop: string;
  substats_json: string;
  unactivated_json: string | null;
  locked: number | null;
  assigned_character_id: number | null;
};

export async function readArtifacts(db: Db = getDb()): Promise<OwnedArtifact[]> {
  const rows = (await db
    .prepare(`SELECT id, set_id, slot, rarity, level, main_prop, substats_json,
                     unactivated_json, locked, assigned_character_id
              FROM artifact_instance WHERE profile_id = ?`)
    .all(await getProfileId(db))) as unknown as Row[];

  return rows.map((row) => {
    const substats = JSON.parse(row.substats_json) as { prop: string; value: number }[];
    const unactivated = row.unactivated_json
      ? (JSON.parse(row.unactivated_json) as { prop: string; value: number }[])
      : [];
    // The locked fourth line is part of how the piece rolled, so the quality
    // and the crit potential read it; only the "now" crit value leaves it out.
    const piece = { rarity: row.rarity, substats: [...substats, ...unactivated] };

    const crit = critValue(substats);
    const critAtFour = unactivated.length > 0 ? critValue(piece.substats) : null;
    const quality = pieceQuality(piece);

    return {
      instanceId: row.id,
      setId: row.set_id,
      slot: row.slot as ArtifactSlot,
      rarity: row.rarity,
      level: row.level,
      mainProp: row.main_prop,
      substats,
      unactivated,
      holderId: row.assigned_character_id,
      locked: row.locked === null ? null : row.locked === 1,
      quality,
      critValue: crit,
      critValueAtFour: critAtFour !== null && critAtFour !== crit ? critAtFour : null,
      critRating: critRating(crit, row.main_prop),
      critPotential: critPotential(quality, row.main_prop),
    };
  });
}

/**
 * A piece's crit potential: how well its crit rolls landed, not how many.
 *
 * Crit value counts what a piece has, so a finished piece always outscores a
 * raw one — and says nothing about which raw piece is worth feeding. This
 * reads the dice instead: each crit substat's average tier, as a fraction of
 * the top roll, summed over the crit lines. A +0 that opened on a 3.9 crit
 * rate is 1.0; a +20 whose 5.4 crit rate took two rolls to get there is 0.69.
 * Both crit lines at the top tier is 2.0, the ceiling.
 *
 * It promises nothing about the rolls to come — those are independent of the
 * ones before — which is the point: it is a reading of what already happened,
 * not a forecast.
 *
 * A crit circlet can hold one crit line, not two, so its sum is out of 1.0.
 * It is doubled to read on the same 2.0 scale as everything else: a crit rate
 * circlet whose crit damage line is at the top tier is as good as that piece
 * can start, and sorts with the other pieces that are.
 */
export function critPotential(quality: { substats: RollQuality[] }, mainProp?: string | null) {
  const sum = quality.substats
    .filter((entry) => entry.prop in CRIT_WEIGHTS)
    .reduce((total, entry) => total + entry.efficiency, 0);
  return mainProp && mainProp in CRIT_WEIGHTS ? sum * 2 : sum;
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
  /** The four-level band the piece sits in: 0 is +0–3, 20 is finished. */
  levelBand?: number | null;
};

export type ArtifactSort = 'value' | 'potential' | 'quality' | 'cv' | 'rolls' | 'level' | 'set';

/**
 * Filtering and ordering, in one place because the page is a list and the list
 * *is* the feature. Sorting by quality first is the default on purpose: the
 * question that brings anyone here is "what did I get that is actually good".
 */
export function filterArtifacts(
  artifacts: OwnedArtifact[],
  filter: ArtifactFilter,
  sort: ArtifactSort = 'value',
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
    if (filter.minCritValue && effectiveCv(piece) < filter.minCritValue) return false;
    if (filter.levelBand !== null && filter.levelBand !== undefined
      && Math.floor(piece.level / 4) * 4 !== filter.levelBand) return false;
    return true;
  });

  // Worth depends on the scaler, so it is not a property of the piece and is
  // not cached on it. Computed once per piece here rather than inside the
  // comparator, which a sort calls a few thousand times for a box this size.
  if (sort === 'value') {
    const value = new Map(kept.map(
      (piece) => [piece.instanceId, pieceWorth(withLocked(piece), scaler).value] as const,
    ));

    return kept.sort((a, b) =>
      (value.get(b.instanceId) ?? 0) - (value.get(a.instanceId) ?? 0)
      || effectiveCv(b) - effectiveCv(a));
  }

  return kept.sort(comparators[sort]);
}

type Comparator = (a: OwnedArtifact, b: OwnedArtifact) => number;

/** Crit value counting the locked fourth line, which has already rolled. */
function effectiveCv(piece: OwnedArtifact) {
  return piece.critValueAtFour ?? piece.critValue;
}

/** The piece with its locked fourth line, for readings of how it rolled. */
function withLocked(piece: OwnedArtifact) {
  return { rarity: piece.rarity, substats: [...piece.substats, ...piece.unactivated] };
}

/** `value` is missing on purpose: it needs the scaler, so it is not a pure pair. */
const comparators: Record<Exclude<ArtifactSort, 'value'>, Comparator> = {
  // Quality first, then how much of it there is: a piece that rolled perfectly
  // once is promising, one that rolled well five times is finished.
  quality: (a, b) =>
    (b.quality.efficiency ?? 0) - (a.quality.efficiency ?? 0)
    || b.quality.rolls - a.quality.rolls,
  // How well the crit rolls landed rather than how many there were, so a raw
  // piece that opened on a top crit roll ranks above a finished one whose crit
  // rolls all landed low. Crit value breaks the tie.
  potential: (a, b) => b.critPotential - a.critPotential || effectiveCv(b) - effectiveCv(a),
  // Crit value is a narrower question than quality — it only speaks for crit
  // builds — so it is an ordering you ask for, never the default.
  cv: (a, b) => effectiveCv(b) - effectiveCv(a) || b.quality.rolls - a.quality.rolls,
  rolls: (a, b) => b.quality.rolls - a.quality.rolls
    || (b.quality.efficiency ?? 0) - (a.quality.efficiency ?? 0),
  level: (a, b) => b.level - a.level || b.quality.rolls - a.quality.rolls,
  set: (a, b) => a.setId - b.setId || a.slot.localeCompare(b.slot) || b.level - a.level,
};
