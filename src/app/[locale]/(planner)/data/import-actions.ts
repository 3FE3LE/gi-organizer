'use server';

import { refresh } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE, isLocale } from '@/lib/data/locales';
import type { AssignmentConflict } from '@/lib/inventory/assignment';
import type { Repair } from '@/lib/inventory/apply';
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
    const repaired = repairSuffix(result.repairs, t);

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
        message: `${t('exclusivityConflicts', { count: error.conflicts.length })}: ${
          await describeConflicts(error.conflicts, t)}`,
      };
    }
    return { status: 'error', message: (error as Error).message };
  }
}

type ActionMessages = Awaited<ReturnType<typeof getTranslations<'data.import.actions'>>>;

/** The two kinds of repair say different things, so they are counted apart. */
function repairSuffix(repairs: Repair[], t: ActionMessages) {
  const impossible = repairs.filter((repair) => repair.kind === 'weapon-type-mismatch').length;
  const unequipped = repairs.filter((repair) => repair.kind === 'artifact-unequipped').length;

  return [
    impossible > 0 ? t('repairsSuffix', { count: impossible }) : '',
    unequipped > 0 ? t('unequippedSuffix', { count: unequipped }) : '',
  ].join('');
}

/**
 * Who and where, so a refused import can be acted on. A count alone said
 * something was wrong and nothing about what.
 */
async function describeConflicts(conflicts: AssignmentConflict[], t: ActionMessages) {
  const requested = await getLocale();
  const catalog = await getCatalog(isLocale(requested) ? requested : DEFAULT_LOCALE);
  const slot = await getTranslations('common.slot');
  const name = (id: number) => catalog.characters.get(id)?.name ?? `#${id}`;

  return conflicts
    .map((conflict) =>
      conflict.kind === 'slot-occupied'
        ? `${name(conflict.characterId)} · ${slot.has(conflict.slot) ? slot(conflict.slot) : conflict.slot}`
        : `${name(conflict.characterId)} · ${t('weaponSlot')}`)
    .join(', ');
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
