'use server';

import { notFound } from 'next/navigation';

import { getCatalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';

import { loadBuildContext } from './context';
import type { SlotView } from './gear-slot';
import { gearSlotFor } from './gear-view';

/**
 * One slot's candidates, fetched when the player asks for them.
 *
 * This used to be a whole tab, built for all six slots on every render. The
 * work is real — every owned piece of that shape scored against the build, and
 * an icon resolved for each — and it is work for exactly one slot at a time.
 * So it is an action now, and the character panel calls it when a card is
 * opened rather than the page paying for it up front.
 */
export async function loadSlotAction(input: {
  characterId: number;
  locale: string;
  /** Which of the character's goals to score against. */
  buildId: string | null;
  slot: string;
}): Promise<SlotView | null> {
  if (!isLocale(input.locale)) notFound();

  const catalog = await getCatalog(input.locale);
  const character = catalog.characters.get(input.characterId);
  if (!character) return null;

  const context = await loadBuildContext({
    locale: input.locale,
    catalog,
    characterId: input.characterId,
    character,
    requestedBuild: input.buildId,
  });

  return gearSlotFor(context, input.slot);
}
