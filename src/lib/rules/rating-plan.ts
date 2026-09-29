import 'server-only';

import { akashaBoardUrl, readAkasha } from '@/lib/akasha/fetch';
import type { Catalog } from '@/lib/data/catalog';
import { getRatingConfig } from '@/lib/data/registry';
import type { ArtifactSlot } from '@/lib/data/types';
import { getDb, type Db } from '@/lib/db/client';
import { readBuilds } from '@/lib/player/builds';
import { readRoster } from '@/lib/player/characters';
import { getProfileId, readInventory } from '@/lib/player/db';
import { readEnkaAccount } from '@/lib/player/enka-profile';

import { getBuildPriorities } from './assemble';
import { ASSUMED_TARGET } from './materials';
import { buildStatsFor, scorePiece, type BuildStats } from './piece-score';
import { rateCharacter, type Rating } from './rating';

export type CharacterRating = Rating & {
  /** The leaderboard the Akasha part comes from, to link to. */
  akashaUrl: string | null;
};

/**
 * Every owned character's rating, read in one pass: the roster, what each one
 * wears, the build they are measured against, and Akasha once for the UID.
 */
export async function readRatings(catalog: Catalog, db: Db = getDb()): Promise<Map<number, CharacterRating>> {
  const profileId = await getProfileId(db);
  const [roster, inventory, builds, priorities, config, enka] = await Promise.all([
    readRoster(db, profileId),
    readInventory(db, profileId),
    readBuilds(db),
    getBuildPriorities(),
    getRatingConfig(),
    readEnkaAccount(db),
  ]);
  const akasha = await readAkasha(enka.uid, db).catch(() => null);

  // The build a character is measured against: their own first, the community
  // priority otherwise — the same order the rest of the app falls back in.
  const statsFor = (characterId: number): BuildStats => {
    const own = builds.find((build) => build.characterId === characterId);
    if (own && own.substats.length > 0) {
      return {
        mainStatsBySlot: new Map(Object.entries(own.mainStats) as [ArtifactSlot, string[]][]),
        substats: own.substats,
      };
    }
    return buildStatsFor(priorities.get(characterId));
  };

  const ratings = new Map<number, CharacterRating>();
  for (const entry of roster) {
    const stats = statsFor(entry.characterId);
    const pieces = inventory.artifacts
      .filter((piece) => piece.equippedTo === entry.characterId)
      .map((piece) => {
        const scored = scorePiece({
          slot: piece.slot, rarity: piece.rarity, level: piece.level,
          mainProp: piece.mainProp, substats: piece.substats,
        }, stats);
        return { usefulRolls: scored.score, mainStatWanted: scored.mainStatWanted };
      });

    const held = inventory.weapons.find((weapon) => weapon.equippedTo === entry.characterId);
    const rarity = held ? catalog.weapons.get(held.weaponId)?.rarity ?? 5 : null;
    const standing = akasha?.standings[entry.characterId] ?? null;

    const rating = rateCharacter({
      level: entry.level,
      talents: entry.talent,
      talentTarget: entry.target.talents ?? {
        auto: Math.max(entry.talent.auto, ASSUMED_TARGET.talents.auto),
        skill: Math.max(entry.talent.skill, ASSUMED_TARGET.talents.skill),
        burst: Math.max(entry.talent.burst, ASSUMED_TARGET.talents.burst),
      },
      // One- and two-star weapons stop at seventy.
      weapon: held && rarity !== null ? { level: held.level, maxLevel: rarity <= 2 ? 70 : 90 } : null,
      pieces,
      akasha: standing ? { ranking: standing.ranking, outOf: standing.outOf } : null,
    }, config);

    ratings.set(entry.characterId, { ...rating, akashaUrl: standing ? akashaBoardUrl(standing) : null });
  }
  return ratings;
}
