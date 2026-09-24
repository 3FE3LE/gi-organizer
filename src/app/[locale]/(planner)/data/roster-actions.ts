'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import { ascensionForLevel } from '@/lib/data/stats';
import { getDb } from '@/lib/db/client';
import { transaction } from '@/lib/db/tx';
import { upsertCharacter } from '@/lib/player/characters';
import { getProfileId } from '@/lib/player/db';
import {
  TRAVELER_BODIES, isTravelerId, setTravelerBody, travelerDepot,
} from '@/lib/player/traveler';

import type { ActionState } from './import-actions';

const talent = z.coerce.number().int().min(1).max(10);

const schema = z.object({
  /** Who is wearing the gear now — for the Traveler, the body the import guessed. */
  characterId: z.coerce.number().int().positive(),
  level: z.coerce.number().int().min(1).max(90),
  ascended: z.enum(['on']).optional(),
  constellation: z.coerce.number().int().min(0).max(6),
  auto: talent,
  skill: talent,
  burst: talent,
  body: z.enum(['male', 'female']).optional(),
  element: z.string().optional(),
});

/**
 * Puts a character the scan saw only through their gear on the roster.
 *
 * Inventory Kamera reads the inventory and the character screen separately,
 * so an export can assign a character's gear while never listing the
 * character — and without a roster row they cannot join a team or be
 * planned. This writes that row by hand, from the few numbers the character
 * screen shows.
 *
 * The Traveler takes two more answers the file could not give: which body,
 * and which element. The body is remembered for every later import, and the
 * gear the import assigned to the other body moves with the answer, since an
 * import can only ever guess Aether.
 */
export async function addToRosterAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const t = await getTranslations('data.inventoryPage.addRoster');
  const parsed = schema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: 'error', message: t('invalid') };

  const input = parsed.data;
  const catalog = await getCatalog(DEFAULT_LOCALE);
  const traveler = isTravelerId(input.characterId);
  const characterId = traveler && input.body ? TRAVELER_BODIES[input.body] : input.characterId;
  const character = catalog.characters.get(characterId);
  if (!character) return { status: 'error', message: t('invalid') };

  const depot = traveler && input.element ? travelerDepot(catalog, characterId, input.element) : null;
  if (traveler && depot === null) return { status: 'error', message: t('chooseElement') };

  const db = getDb();
  const profileId = await getProfileId(db);

  await transaction(db, async () => {
    if (traveler && input.body) {
      await setTravelerBody(db, profileId, input.body);
      if (characterId !== input.characterId) {
        for (const table of ['artifact_instance', 'weapon_instance']) {
          await db.prepare(`UPDATE ${table} SET assigned_character_id = ?
                            WHERE profile_id = ? AND assigned_character_id = ?`)
            .run(characterId, profileId, input.characterId);
        }
      }
    }

    await upsertCharacter(db, profileId, {
      characterId,
      travelerElement: null,
      skillDepotId: depot,
      level: input.level,
      ascension: ascensionForLevel(input.level, input.ascended === 'on'),
      constellation: input.constellation,
      talent: { auto: input.auto, skill: input.skill, burst: input.burst },
      talentBonus: null,
    }, { source: 'manual', observedAt: new Date().toISOString() });
  });

  refresh();
  return { status: 'ok', message: t('added', { name: character.name }) };
}
