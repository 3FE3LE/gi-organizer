'use server';

import { notFound } from 'next/navigation';

import type { OwnedArtifactCardData } from '@/components/owned-artifact-card-view';
import { getCatalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';

import { ownedArtifactCardData } from './artifact-card';
import { loadArtifactFilters } from './filters';
import { PAGE_SIZE, queryArtifacts } from './query';

export type ArtifactCardEntry = { id: string; data: OwnedArtifactCardData };

/**
 * The next batch of the box, for the list as it scrolls.
 *
 * The page used to render every card of the slice on the server and hand the
 * list all of them at once, mounting forty at a time: the box is nine hundred
 * pieces, and the HTML for the unfiltered view was seven megabytes of cards
 * nobody had scrolled to. Now the page draws the first batch and this answers
 * for the rest, from the same query string, so each batch is only worded when
 * the player reaches it.
 */
export async function loadArtifactPage(input: {
  locale: string;
  /** The page's own query string, which is the whole of the filter state. */
  search: string;
  offset: number;
}): Promise<ArtifactCardEntry[]> {
  if (!isLocale(input.locale)) notFound();

  const params = Object.fromEntries(new URLSearchParams(input.search));
  const filters = await loadArtifactFilters(Promise.resolve(params));
  const catalog = await getCatalog(input.locale);
  const { shown } = await queryArtifacts(filters, getDb());

  return Promise.all(
    shown.slice(input.offset, input.offset + PAGE_SIZE).map(async (piece) => ({
      id: piece.instanceId,
      data: await ownedArtifactCardData(piece, filters.scaler, catalog, input.locale),
    })),
  );
}
