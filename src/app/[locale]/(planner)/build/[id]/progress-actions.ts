'use server';

import { getTranslations } from 'next-intl/server';
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
import { NotInRoster, TargetBelowCurrent, applyProgress } from '@/lib/player/progress';

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
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, await getTranslations('forms')) };
  }

  const t = await getTranslations('build.actions');
  const input = parsed.data;
  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(input.characterId);
  if (!character) return { status: 'error', message: t('characterNotFound') };

  const weaponId = input.weaponId;
  if (weaponId !== null && !catalog.weapons.get(weaponId)) {
    return { status: 'error', message: t('weaponNotFound') };
  }

  const setIds = statedSetIds(input.setIds);
  const unknownSet = setIds.find((setId) => !catalog.artifacts.get(setId));
  if (unknownSet !== undefined) {
    return { status: 'error', message: t('setNotFound', { id: unknownSet }) };
  }

  try {
    await applyProgress({
      characterId: input.characterId,
      buildId: input.buildId || null,
      role: (input.role || null) as TeamRole | null,
      substats: statedSubstats(input.substats),
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
    // The roster is the import's, so a goal for somebody the account does not
    // have is a plan that cannot be carried out — and the fix is a re-import,
    // not a retry.
    if (error instanceof NotInRoster) {
      return {
        status: 'error',
        message: t('notInRoster', { name: character.name }),
      };
    }
    // The client already floors the steppers at today's level and talents, so
    // this only fires when that got bypassed — a stale tab, a second device.
    if (error instanceof TargetBelowCurrent) {
      return {
        status: 'error',
        message: t('targetBelowCurrent', { name: character.name }),
      };
    }
    // A character has one goal per role, as a unique index rather than as a
    // rule anybody has to remember. Renaming a goal onto a role that is already
    // taken is the one way to hit it, and it deserves a sentence.
    if (String(error).includes('ux_build_role')) {
      return {
        status: 'error',
        message: t('goalRoleTaken', { name: character.name }),
      };
    }
    throw error;
  }

  refresh();
  return { status: 'ok', message: t('objectiveSaved', { name: character.name }) };
}
