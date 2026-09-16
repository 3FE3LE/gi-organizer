'use server';

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
  const raw = String(form.get('move') ?? '');
  const expected = form.get('expectedHolderId');

  let move: Move;
  try {
    move = JSON.parse(raw) as Move;
  } catch {
    return { status: 'error', message: 'movimiento ilegible' };
  }

  const catalog = await getCatalog(DEFAULT_LOCALE);
  const result = performMove(move, {
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
            ? 'ya no lo lleva nadie; vuelve a intentarlo'
            : `ahora lo lleva ${catalog.characters.get(result.actualHolderId)?.name ?? result.actualHolderId}`,
        };
      case 'wrong-weapon-type':
        return { status: 'error', message: 'ese personaje no puede llevar ese tipo de arma' };
      case 'not-found':
        return { status: 'error', message: 'ese objeto ya no existe' };
      default:
        return { status: 'error', message: 'no se pudo mover' };
    }
  }

  refresh();

  const displaced = result.displaced
    .map((entry) => catalog.characters.get(entry.fromCharacterId)?.name)
    .filter(Boolean);

  return {
    status: 'ok',
    message: displaced.length > 0 ? `movido; se lo quitaste a ${displaced.join(', ')}` : 'movido',
  };
}
