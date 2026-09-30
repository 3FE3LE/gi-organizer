import 'server-only';

import type { Catalog } from '@/lib/data/catalog';
import { getArtifactDomains, getArtifactFarmConfig } from '@/lib/data/registry';
import { getDb, type Db } from '@/lib/db/client';
import { readBuilds } from '@/lib/player/builds';
import { readRoster } from '@/lib/player/characters';
import { getProfileId, readInventory } from '@/lib/player/db';
import { readLoadout } from '@/lib/player/loadout';

import { adviseArtifactFarm, type ArtifactFarmAdvice } from './artifact-farm';
import { getBuildPriorities } from './assemble';
import { readRatings } from './rating-plan';
import { evaluateGoals, type GoalVerdict } from './stats';

export type FarmCharacterView = {
  characterId: number;
  /** The artifact part of the rating, 0–1. */
  artifacts: number;
  /** Each set the build is after, the pieces it asks for and how many are worn. */
  sets: { setId: number; pieces: number; worn: number }[];
  /** Stat goals the character has not reached yet. */
  goals: GoalVerdict[];
  /** The domain that serves them best, or null when theirs drops from none. */
  entranceId: number | null;
};

export type ArtifactFarmPlan = ArtifactFarmAdvice & {
  characters: FarmCharacterView[];
  /** The newest version the strongbox offers sets from. */
  strongboxThrough: string;
};

/**
 * The artifact advice for everyone in the plan, read in one pass: who is in
 * it, how far their artifacts are, which sets their build is after — their
 * own goal first, the community's otherwise, the order the rest of the app
 * falls back in — and their stat goals where they wrote any.
 */
export async function artifactFarmPlan(catalog: Catalog, db: Db = getDb()): Promise<ArtifactFarmPlan> {
  const profileId = await getProfileId(db);
  const [roster, inventory, builds, priorities, ratings, domains, config] = await Promise.all([
    readRoster(db, profileId),
    readInventory(db, profileId),
    readBuilds(db),
    getBuildPriorities(),
    readRatings(catalog, db),
    getArtifactDomains(),
    getArtifactFarmConfig(),
  ]);

  const planned = roster.filter((entry) => entry.dismissedAt === null);

  const characters = await Promise.all(planned.map(async (entry) => {
    const own = builds.find((build) => build.characterId === entry.characterId && build.setPlan.length > 0)
      ?? builds.find((build) => build.characterId === entry.characterId);
    const plan = own && own.setPlan.length > 0
      ? own.setPlan
      : priorities.get(entry.characterId)?.artifacts.slice(0, 1) ?? [];

    const worn = new Map<number, number>();
    for (const piece of inventory.artifacts) {
      if (piece.equippedTo === entry.characterId) worn.set(piece.setId, (worn.get(piece.setId) ?? 0) + 1);
    }
    // Worn is capped at what the plan asks for: a fifth piece of a four-piece
    // set is not progress, and "wears 5 of 4" read as a count gone wrong.
    const sets = plan.flatMap((choice) => choice.setIds.map((setId) => {
      const pieces = choice.setIds.length > 1 ? 2 : choice.pieces;
      return { setId, pieces, worn: Math.min(pieces, worn.get(setId) ?? 0) };
    }));

    // Only where goals were written: the loadout sums every stat, and doing
    // that for a character with nothing to compare it against is wasted work.
    const goals = own && own.goals.length > 0
      ? evaluateGoals((await readLoadout(entry.characterId, catalog, db))?.totals ?? {}, own.goals)
        .filter((goal) => goal.status !== 'met')
      : [];

    return {
      characterId: entry.characterId,
      artifacts: ratings.get(entry.characterId)?.parts.artifacts ?? 0,
      sets,
      goals,
    };
  }));

  const advice = adviseArtifactFarm(
    characters.map((character) => ({
      characterId: character.characterId,
      artifacts: character.artifacts,
      setIds: character.sets.map((set) => set.setId),
    })),
    domains,
    config,
    (setId) => catalog.artifacts.get(setId)?.version ?? null,
  );

  // Each character's best domain: the highest-ranked one that drops a set of
  // theirs, which is also the one their need helped put there.
  const entranceFor = (setIds: number[]) => advice.domains
    .find((entry) => entry.domain.setIds.some((id) => setIds.includes(id)))?.domain.entranceId ?? null;

  return {
    ...advice,
    strongboxThrough: config.strongboxThrough,
    characters: characters
      .filter((character) => character.artifacts < 1 || character.goals.length > 0)
      .map((character) => ({ ...character, entranceId: entranceFor(character.sets.map((set) => set.setId)) }))
      .sort((a, b) => a.artifacts - b.artifacts),
  };
}
