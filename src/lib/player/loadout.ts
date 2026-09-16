import 'server-only';

import type { DatabaseSync } from 'node:sqlite';

import type { Catalog } from '@/lib/data/catalog';
import { statsAtLevel } from '@/lib/data/stats';
import type { ArtifactSlot } from '@/lib/data/types';
import type { NormalizedStat } from '@/lib/inventory/model';
import { getAnnotations } from '@/lib/rules/assemble';
import { rollsOf } from '@/lib/rules/piece-score';
import { computeStats, mainStatValue, type StatTotals } from '@/lib/rules/stats';

import { readRoster } from './characters';
import { getProfileId } from './db';
import { readGear } from './queries';

/**
 * What a character actually has on right now, with its stats worked out.
 *
 * The planner deliberately measures everything at level 90 with the *planned*
 * weapon, because that is where a build is judged. This is the other question —
 * what the game screen would show today — so it reads the roster's level and
 * the equipped weapon instead. The two never share a number, which is why this
 * does not live in `assemble.ts`.
 *
 * Conditional effects stay out, exactly as in `computeStats`: only base stats,
 * the ascension bonus, the weapon, artifact main stats and substats, and flat
 * two-piece set bonuses.
 */

export type LoadoutPiece = {
  instanceId: string;
  slot: ArtifactSlot;
  setId: number;
  rarity: number;
  level: number;
  mainProp: string;
  mainValue: number;
  /** Substats with how many top rolls each is worth, as the game's badges. */
  substats: (NormalizedStat & { rolls: number })[];
};

export type LoadoutWeapon = {
  instanceId: string;
  weaponId: number;
  level: number;
  ascension: number;
  refinement: number;
  baseAttack: number;
  /** The weapon's secondary stat, as a percentage, or `null` for a 1-star. */
  prop: string | null;
  value: number;
};

export type Loadout = {
  level: number;
  ascension: number;
  constellation: number;
  talent: { auto: number; skill: number; burst: number };
  talentBonus: { auto: number; skill: number; burst: number } | null;
  skillDepotId: number | null;
  /** Whether the roster knows this character at all. Gear can exist without it. */
  known: boolean;
  /** Where the player is taking them, which is the character's, not a goal's. */
  target: { level: number | null; ascension: number | null;
    talents: { auto: number; skill: number; burst: number } | null };
  totals: StatTotals;
  /** Pre-multiplier values, so a total can be shown as `base + bonus`. */
  base: { hp: number; attack: number; defense: number };
  weapon: LoadoutWeapon | null;
  pieces: LoadoutPiece[];
  /** Equipped pieces per set, most-worn first. */
  setCounts: [setId: number, count: number][];
};

/** Assumed when the roster has never seen the character: a fresh, unlevelled one. */
const UNKNOWN = { level: 1, ascension: 0, constellation: 0, talent: { auto: 1, skill: 1, burst: 1 } };

export async function readLoadout(
  characterId: number,
  catalog: Catalog,
  db: DatabaseSync,
): Promise<Loadout | null> {
  const character = catalog.characters.get(characterId);
  if (!character) return null;

  const entry = readRoster(db, getProfileId(db))
    .find((row) => row.characterId === characterId) ?? null;
  const level = entry?.level ?? UNKNOWN.level;
  const ascension = entry?.ascension ?? UNKNOWN.ascension;

  const gear = readGear(characterId, db);
  const equipped = [...gear.bySlot.values()];

  const characterStats = statsAtLevel(character.stats, level, ascension);

  const definition = gear.weapon ? catalog.weapons.get(gear.weapon.weaponId) : undefined;
  const weaponStats = definition && gear.weapon
    ? statsAtLevel(definition.stats, gear.weapon.level, gear.weapon.ascension)
    : undefined;

  const weapon: LoadoutWeapon | null = gear.weapon && definition && weaponStats
    ? {
        instanceId: gear.weapon.id,
        weaponId: gear.weapon.weaponId,
        level: gear.weapon.level,
        ascension: gear.weapon.ascension,
        refinement: gear.weapon.refinement,
        baseAttack: weaponStats.attack ?? 0,
        prop: definition.mainStatType || null,
        value: weaponStats.specialized ?? 0,
      }
    : null;

  const setCounts = new Map<number, number>();
  for (const piece of equipped) {
    setCounts.set(piece.setId, (setCounts.get(piece.setId) ?? 0) + 1);
  }

  // Only two-piece bonuses, and only for sets actually completed. Four-piece
  // effects are conditional, so no totals layer can honestly sum them.
  const annotations = await getAnnotations(catalog);
  const setBonuses = [...setCounts]
    .filter(([, count]) => count >= 2)
    .flatMap(([setId]) => annotations.sets.get(setId)?.bonus2pc ?? []);

  const { totals, base } = computeStats({
    character: {
      hp: characterStats.hp ?? 0,
      attack: characterStats.attack ?? 0,
      defense: characterStats.defense ?? 0,
    },
    ascension: { prop: character.substatType, value: characterStats.specialized ?? 0 },
    weapon: weapon && { baseAttack: weapon.baseAttack, prop: weapon.prop, value: weapon.value },
    pieces: equipped,
    setBonuses,
  });

  return {
    level,
    ascension,
    constellation: entry?.constellation ?? UNKNOWN.constellation,
    talent: entry?.talent ?? UNKNOWN.talent,
    talentBonus: entry?.talentBonus ?? null,
    skillDepotId: entry?.skillDepotId ?? null,
    known: entry !== null,
    target: entry?.target ?? { level: null, ascension: null, talents: null },
    totals,
    base,
    weapon,
    pieces: equipped.map((piece) => ({
      instanceId: piece.id,
      slot: piece.slot,
      setId: piece.setId,
      rarity: piece.rarity,
      level: piece.level,
      mainProp: piece.mainProp,
      mainValue: mainStatValue(piece.mainProp, piece.rarity, piece.level),
      substats: piece.substats.map((substat) => ({
        ...substat,
        rolls: rollsOf(substat.prop, substat.value, piece.rarity),
      })),
    })),
    setCounts: [...setCounts].sort((a, b) => b[1] - a[1]),
  };
}
