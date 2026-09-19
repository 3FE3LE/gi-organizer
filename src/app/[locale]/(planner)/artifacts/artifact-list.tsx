'use client';

import { useEffect, useRef, useState } from 'react';

/** Cards per batch. Comfortably more than one screen, so the sentinel is
    rarely the last thing painted. */
const BATCH_SIZE = 40;

/**
 * The box's grid, revealed as the player scrolls to it.
 *
 * Filtering and sorting already happened server-side over the whole box —
 * `items` here is that complete, ordered result. What this component owns is
 * strictly how much of it is in the DOM at once: mounting hundreds of cards
 * up front is the actual cost, not the query that found them. Each batch
 * mounts when a sentinel `<li>` crosses into view, so the list grows the way
 * scrolling expects it to.
 */
export function ArtifactList({ items }: { items: React.ReactNode[] }) {
  const [visible, setVisible] = useState(Math.min(BATCH_SIZE, items.length));
  const sentinelRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (visible >= items.length) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible((current) => Math.min(current + BATCH_SIZE, items.length));
        }
      },
      { rootMargin: '800px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [visible, items.length]);

  return (
    <>
      {items.slice(0, visible)}
      {visible < items.length && <li ref={sentinelRef} aria-hidden className="col-span-full h-1" />}
    </>
  );
}
