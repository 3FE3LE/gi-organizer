'use server';

import { refresh } from 'next/cache';

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

  try {
    const result = await applyStaged(token, { onAbsent });
    refresh();

    const { artifacts, weapons } = result.persisted;
    const repaired = result.repairs.length
      ? `; ${result.repairs.length} imposible assignment(s) dropped`
      : '';

    return {
      status: 'ok',
      message:
        `artefactos +${artifacts.inserted} ~${artifacts.updated} -${artifacts.deleted} · ` +
        `armas +${weapons.inserted} ~${weapons.updated} -${weapons.deleted} · ` +
        `${result.charactersUpserted} personajes${repaired}`,
    };
  } catch (error) {
    if (error instanceof AssignmentViolation) {
      return {
        status: 'error',
        message:
          `${error.conflicts.length} conflicto(s) de exclusividad; no se escribió nada`,
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

  try {
    const result = await applyShowcase(uid);
    refresh();

    const { artifacts, weapons } = result.persisted;
    return {
      status: 'ok',
      message:
        `semilla de ${uid}: artefactos +${artifacts.inserted} ~${artifacts.updated} · ` +
        `armas +${weapons.inserted} ~${weapons.updated} · ` +
        `${result.charactersUpserted} personajes`,
    };
  } catch (error) {
    return { status: 'error', message: (error as Error).message };
  }
}
