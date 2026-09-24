'use client';

import { useEffect, useRef, useState } from 'react';

import { OwnedArtifactCardView } from '@/components/owned-artifact-card-view';

import { type ArtifactCardEntry, loadArtifactPage } from './list-actions';

/**
 * The box's grid, filled in as the player scrolls to it.
 *
 * Filtering and sorting happen on the server over the whole box; the page
 * draws the first batch of that ordered result and this asks for the next
 * one when a sentinel `<li>` comes within reach of the viewport. Each batch is
 * worded on the server only when it is needed — see `loadArtifactPage` for
 * why that replaced sending the whole slice up front.
 *
 * Mounted under a key of the query string, so a change of filters starts the
 * list over rather than appending the new slice to the old one.
 */
export function ArtifactList({
  initial,
  total,
  locale,
  search,
}: {
  initial: ArtifactCardEntry[];
  total: number;
  locale: string;
  search: string;
}) {
  const [items, setItems] = useState(initial);
  const [loading, setLoading] = useState(false);
  const sentinelRef = useRef<HTMLLIElement>(null);
  const more = items.length < total;

  useEffect(() => {
    if (!more || loading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        setLoading(true);
        loadArtifactPage({ locale, search, offset: items.length })
          .then((next) => setItems((current) => [...current, ...next]))
          .finally(() => setLoading(false));
      },
      { rootMargin: '800px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [more, loading, items.length, locale, search]);

  return (
    <>
      {items.map((item) => (
        <OwnedArtifactCardView key={item.id} data={item.data} />
      ))}
      {more && (
        <li ref={sentinelRef} aria-hidden className="col-span-full h-10">
          {loading && <span className="block h-1 animate-pulse rounded bg-edge" />}
        </li>
      )}
    </>
  );
}
