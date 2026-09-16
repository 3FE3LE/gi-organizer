'use server';

import { refresh } from 'next/cache';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import type { ArtifactSlot } from '@/lib/data/types';
import {
  firstIssue,
  progressSchema,
  statedGoals,
  statedMainStats,
  statedSetIds,
  statedSubstats,
  type ProgressFormValues,
} from '@/lib/forms/build';
import type { TeamRole } from '@/lib/rules/types';
import { applyProgress } from '@/lib/player/progress';

/**
 * The form behind "progress and target". Validation only: the write is one
 * call, because saving a third of this form would be worse than not saving it.
 *
 * The payload arrives as a typed object rather than `FormData`, and is parsed
 * with the same schema the client resolved against. What is left here is the
 * half a schema cannot check: whether the ids name things the catalog has.
 */

export type ProgressState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function saveProgressAction(values: ProgressFormValues): Promise<ProgressState> {
  const parsed = progressSchema.safeParse(values);
  if (!parsed.success) return { status: 'error', message: firstIssue(parsed.error) };

  const input = parsed.data;
  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(input.characterId);
  if (!character) return { status: 'error', message: 'ese personaje no existe' };

  const weaponId = input.weaponId;
  if (weaponId !== null && !catalog.weapons.get(weaponId)) {
    return { status: 'error', message: 'esa arma no existe' };
  }

  const setIds = statedSetIds(input.setIds);
  const unknownSet = setIds.find((setId) => !catalog.artifacts.get(setId));
  if (unknownSet !== undefined) {
    return { status: 'error', message: `el set #${unknownSet} no existe` };
  }

  try {
    await applyProgress({
      characterId: input.characterId,
      buildId: input.buildId || null,
      role: (input.role || null) as TeamRole | null,
      substats: statedSubstats(input.substats),
      current: {
        level: input.currentLevel,
        ascended: input.currentAscended,
        constellation: input.constellation,
        talents: input.currentTalents,
      },
      target: {
        level: input.targetLevel,
        ascended: input.targetAscended,
        talents: input.targetTalents,
      },
      weaponId,
      weaponRefinement: input.weaponRefinement,
      setIds,
      mainStats: statedMainStats(input.mainStats) as Partial<Record<ArtifactSlot, string>>,
      goals: statedGoals(input.goals),
    });
  } catch (error) {
    // A character has one goal per role, as a unique index rather than as a
    // rule anybody has to remember. Renaming a goal onto a role that is already
    // taken is the one way to hit it, and it deserves a sentence.
    if (String(error).includes('ux_build_role')) {
      return {
        status: 'error',
        message: `${character.name} ya tiene un objetivo con ese rol`,
      };
    }
    throw error;
  }

  refresh();
  return { status: 'ok', message: `objetivo de ${character.name} guardado` };
}
