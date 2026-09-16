'use server';

import { randomUUID } from 'node:crypto';

import { refresh } from 'next/cache';

import { getDb } from '@/lib/db/client';
import { transaction } from '@/lib/db/tx';
import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import { deleteCharacter, upsertCharacter } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';

/**
 * Manual entry, for what a scan could not see.
 *
 * Inventory Kamera reads the character screen separately from the inventory, so
 * a real export can carry a character's gear while omitting the character —
 * which is exactly what happens to the Traveler and the Wanderer. Their pieces
 * import fine and their roster row does not exist, so it has to be typed.
 */

export type FormState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

function intField(form: FormData, name: string, min: number, max: number, fallback: number) {
  const raw = form.get(name);
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export async function addCharacterAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const characterId = Number(form.get('characterId'));
  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(characterId);

  if (!character) {
    return { status: 'error', message: 'ese personaje no está en el catálogo' };
  }

  const db = getDb();
  const profileId = getProfileId(db);

  upsertCharacter(db, profileId, {
    characterId,
    travelerElement: null,
    level: intField(form, 'level', 1, 90, 1),
    ascension: intField(form, 'ascension', 0, 6, 0),
    constellation: intField(form, 'constellation', 0, 6, 0),
    talent: {
      auto: intField(form, 'auto', 1, 10, 1),
      skill: intField(form, 'skill', 1, 10, 1),
      burst: intField(form, 'burst', 1, 10, 1),
    },
    // Typed by hand, so the constellation bonus is unknown rather than zero —
    // an Enka import is what can establish it.
    talentBonus: null,
  }, { source: 'manual', observedAt: new Date().toISOString() });

  refresh();
  return { status: 'ok', message: `${character.name} añadido al roster` };
}

export async function removeCharacterAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const characterId = Number(form.get('characterId'));
  const db = getDb();
  const removed = deleteCharacter(db, getProfileId(db), characterId);

  refresh();
  return removed > 0
    ? { status: 'ok', message: 'quitado del roster' }
    : { status: 'error', message: 'no estaba en el roster' };
}

export async function addWeaponAction(
  _previous: FormState,
  form: FormData,
): Promise<FormState> {
  const weaponId = Number(form.get('weaponId'));
  const catalog = await getCatalog(DEFAULT_LOCALE);
  const weapon = catalog.weapons.get(weaponId);

  if (!weapon) return { status: 'error', message: 'esa arma no está en el catálogo' };

  const db = getDb();
  const profileId = getProfileId(db);
  const now = new Date().toISOString();
  const refinement = intField(form, 'refinement', 1, 5, 1);

  transaction(db, () => {
    db.prepare(`INSERT INTO weapon_instance
        (id, profile_id, weapon_id, level, ascension, refinement, locked,
         fingerprint, source, assigned_character_id, seen_at, created_at)
        VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?)`)
      .run(
        randomUUID(), profileId, weaponId,
        intField(form, 'level', 1, 90, 1),
        intField(form, 'ascension', 0, 6, 0),
        refinement,
        null,
        `w1|${weaponId}|R${refinement}`,
        'manual', now, now,
      );
  });

  refresh();
  // Unassigned on purpose: equipping is its own operation, and a copy that
  // arrives already on someone is how a scarcity count starts to drift.
  return { status: 'ok', message: `${weapon.name} R${refinement} añadida, sin asignar` };
}
