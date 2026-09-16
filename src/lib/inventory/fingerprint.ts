import { isPercentProp } from '@/lib/data/props';

import type { NormalizedArtifact, NormalizedStat, NormalizedWeapon } from './model';

/**
 * Identity for owned items.
 *
 * Nothing here is hashed. A fingerprint is a readable string so a conflict
 * report can print it verbatim, and hashing would cost debuggability for no
 * collision resistance anyone needs at this scale.
 *
 * The fingerprint is a derived index, never a primary key. An owned piece keeps
 * its row id across levelling; what changes is which bucket it lands in.
 */

/**
 * Rounding to what the game displays, not a tolerance. Both sources report the
 * same shown value, and comparing raw floats would make `11.1` and
 * `11.100000000000001` different pieces.
 */
export function quantize(prop: string, value: number) {
  return isPercentProp(prop) ? Math.round(value * 10) : Math.round(value);
}

function statList(stats: NormalizedStat[]) {
  return stats
    .map((stat) => `${stat.prop}:${quantize(stat.prop, stat.value)}`)
    .sort()
    .join(',');
}

function propList(stats: NormalizedStat[]) {
  return stats.map((stat) => stat.prop).sort().join(',');
}

/**
 * The part of a piece that can never change. Not unique on its own — it is the
 * bucket a match is searched in.
 */
export function artifactIdentity(artifact: {
  setId: number; slot: string; rarity: number; mainProp: string;
}) {
  return `${artifact.setId}|${artifact.slot}|${artifact.rarity}|${artifact.mainProp}`;
}

/**
 * The whole observable state. Two pieces with the same fingerprint are
 * interchangeable, which is exactly when treating them as the same piece is
 * harmless.
 *
 * Deliberately excluded: the main stat *value* (GOOD does not carry it, and it
 * is a function of rarity and level anyway), the source's `itemId` (Enka's is
 * the piece definition, not the piece, and Inventory Kamera's is a per-scan
 * counter that repeats), and substat *order* (display order differs between
 * scanners, so sorting is what makes the two sources comparable).
 */
export function artifactFingerprint(artifact: NormalizedArtifact) {
  return `a1|${artifactIdentity(artifact)}|${artifact.level}|${statList(artifact.substats)}`;
}

/**
 * What survives levelling: the same piece keeps its substat *props* even as
 * their values grow.
 *
 * Inventory Kamera reports the not-yet-activated fourth substat, so including
 * it here removes the one real discontinuity — a three-substat piece becoming
 * a four-substat piece at +4 keeps the same lineage when the source saw the
 * fourth coming. When it did not, the subset rule in `dominates` covers it.
 */
export function artifactLineage(artifact: NormalizedArtifact) {
  const props = propList([...artifact.substats, ...artifact.unactivatedSubstats]);
  return `l1|${artifactIdentity(artifact)}|${props}`;
}

/**
 * How many rolls it would take for `owned` to have become `incoming`, or `null`
 * if no amount of levelling could.
 *
 * Every clause is a property of how the game upgrades an artifact: the level
 * only rises, a substat never disappears, a value never falls, and each
 * multiple of four grants exactly one roll.
 *
 * The count matters as much as the verdict. Over a wide level gap the roll
 * budget is generous enough that an unrelated low-level piece also satisfies
 * every clause, so "does it fit" cannot pick a winner on its own — but the
 * piece that truly is `incoming` needs the fewest unexplained rolls, usually
 * zero. `planImport` matches on that minimum and calls a tie ambiguous.
 */
export function upgradeCost(incoming: NormalizedArtifact, owned: NormalizedArtifact) {
  if (incoming.level < owned.level) return null;
  if (incoming.substats.length < owned.substats.length) return null;

  const incomingByProp = new Map(incoming.substats.map((stat) => [stat.prop, stat.value]));

  let grown = 0;
  for (const stat of owned.substats) {
    const value = incomingByProp.get(stat.prop);
    if (value === undefined) return null;
    if (quantize(stat.prop, value) < quantize(stat.prop, stat.value)) return null;
    if (quantize(stat.prop, value) > quantize(stat.prop, stat.value)) grown += 1;
  }

  const added = incoming.substats.length - owned.substats.length;
  const grantedRolls = Math.floor(incoming.level / 4) - Math.floor(owned.level / 4);
  const cost = added + grown;

  return cost <= grantedRolls ? cost : null;
}

/** Could `incoming` be `owned` after some levelling? */
export function dominates(incoming: NormalizedArtifact, owned: NormalizedArtifact) {
  return upgradeCost(incoming, owned) !== null;
}

/**
 * A weapon has no per-instance state: no rolls, no history, nothing to tell two
 * copies apart. Refinement splits the bucket because an R1 and an R5 are not
 * interchangeable; level does not, because levelling is a plan, not an
 * identity.
 */
export function weaponFingerprint(weapon: NormalizedWeapon) {
  return `w1|${weapon.weaponId}|R${weapon.refinement}`;
}
