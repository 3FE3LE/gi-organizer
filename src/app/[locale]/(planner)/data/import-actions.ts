'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { AssignmentViolation, applyShowcase, applyStaged } from '@/lib/player/import';

/**
 * Applying is a mutation, so it is a Server Action — unlike the upload, which
 * is a Route Handler because of the 1 MB action body cap.
 *
 * `refresh()` rather than `revalidatePath`: player data is never cached, so
 * there is nothing to invalidate, and `revalidateTag`'s stale-while-revalidate
 * would show the user the state from before their own write.
 */

export type ActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

export async function applyStagedAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const token = String(form.get('token') ?? '');
  const onAbsent = form.get('onAbsent') === 'remove' ? 'remove' : 'keep';
  const t = await getTranslations('data.import.actions');

  try {
    const result = await applyStaged(token, { onAbsent });
    refresh();

    const { artifacts, weapons } = result.persisted;
    const repaired = result.repairs.length
      ? t('repairsSuffix', { count: result.repairs.length })
      : '';

    return {
      status: 'ok',
      message: t('appliedMessage', {
        artifactsInserted: artifacts.inserted,
        artifactsUpdated: artifacts.updated,
        artifactsDeleted: artifacts.deleted,
        weaponsInserted: weapons.inserted,
        weaponsUpdated: weapons.updated,
        weaponsDeleted: weapons.deleted,
        characters: result.charactersUpserted,
        repaired,
      }),
    };
  } catch (error) {
    if (error instanceof AssignmentViolation) {
      return {
        status: 'error',
        message: t('exclusivityConflicts', { count: error.conflicts.length }),
      };
    }
    return { status: 'error', message: (error as Error).message };
  }
}

export async function applyShowcaseAction(
  _previous: ActionState,
  form: FormData,
): Promise<ActionState> {
  const uid = String(form.get('uid') ?? '').trim();
  const t = await getTranslations('data.import.actions');

  try {
    const result = await applyShowcase(uid);
    refresh();

    const { artifacts, weapons } = result.persisted;
    return {
      status: 'ok',
      message: t('showcaseAppliedMessage', {
        uid,
        artifactsInserted: artifacts.inserted,
        artifactsUpdated: artifacts.updated,
        weaponsInserted: weapons.inserted,
        weaponsUpdated: weapons.updated,
        characters: result.charactersUpserted,
      }),
    };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}
