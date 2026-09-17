'use server';

import { getTranslations } from 'next-intl/server';
import { refresh } from 'next/cache';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import type { Move } from '@/lib/player/move';
import { performMove } from '@/lib/player/mutations';

/**
 * One action for every gear move, because there is one operation. The client
 * sends the same `Move` the pure reducer takes, so its optimistic render and
 * this write cannot disagree about what was asked for.
 */

export type MoveState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  /** The holder changed under the user; the UI re-asks instead of stomping. */
  | { status: 'conflict'; message: string; actualHolderId: number | null }
  | { status: 'error'; message: string };

export async function moveGearAction(
  _previous: MoveState,
  form: FormData,
): Promise<MoveState> {
  const t = await getTranslations('build.actions');
  const raw = String(form.get('move') ?? '');
  const expected = form.get('expectedHolderId');

  let move: Move;
  try {
    move = JSON.parse(raw) as Move;
  } catch {
    return { status: 'error', message: t('unreadableMove') };
  }

  const catalog = await getCatalog(DEFAULT_LOCALE);
  const result = await performMove(move, {
    expectedHolderId:
      expected === null || expected === '' ? undefined : expected === 'null' ? null : Number(expected),
    weaponTypes: {
      ofWeapon: (weaponId) => catalog.weapons.get(weaponId)?.weaponType,
      ofCharacter: (characterId) => catalog.characters.get(characterId)?.weaponType,
    },
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'conflict':
        return {
          status: 'conflict',
          actualHolderId: result.actualHolderId,
          message: result.actualHolderId === null
            ? t('nowHeldByNobody')
            : t('nowHeldBy', {
                name: catalog.characters.get(result.actualHolderId)?.name ?? result.actualHolderId,
              }),
        };
      case 'wrong-weapon-type':
        return { status: 'error', message: t('wrongWeaponType') };
      case 'not-found':
        return { status: 'error', message: t('itemNotFound') };
      default:
        return { status: 'error', message: t('couldNotMove') };
    }
  }

  refresh();

  const displaced = result.displaced
    .map((entry) => catalog.characters.get(entry.fromCharacterId)?.name)
    .filter(Boolean);

  return {
    status: 'ok',
    message: displaced.length > 0
      ? t('movedDisplaced', { names: displaced.join(', ') })
      : t('moved'),
  };
}
