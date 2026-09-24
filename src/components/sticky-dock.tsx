'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A page's controls, docked under the header once the list is scrolled past
 * them — the artifact filters, the roster's grouping.
 *
 * Refining a search is something done halfway down the results — the first
 * forty pieces say the scaler was wrong, or the slot — and scrolling back to
 * the top to change it lost the place in the list. So the card sticks just
 * below the site header and stays in reach.
 *
 * Docked, it reads as a layer over the list rather than part of it: a glass
 * band and a shadow. It also gives up what is only worth reading once — the
 * chosen set's bonus text, which the card under it already names — and caps
 * its own height with a scroll of its own, so an open disclosure on a phone
 * can never cover the list it is filtering.
 *
 * The offset is the header's measured height rather than a constant: the
 * header wraps at some widths, and a dock that guessed would slide under it
 * or leave a gap.
 */
export function StickyDock({ children }: { children: React.ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [stuck, setStuck] = useState(false);

  // The header's height, kept current as it wraps or the viewport turns.
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    const measure = () => setTop(Math.round(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Stuck once the point where the dock would sit has scrolled under the
  // header.
  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setStuck(!entry.isIntersecting && entry.boundingClientRect.top < top + 1),
      { rootMargin: `-${top + 1}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [top]);

  return (
    <>
      {/* No margin of its own, so the page's spacing still reads as one gap. */}
      <div ref={sentinel} aria-hidden className="mb-0 h-px" />
      <div
        data-stuck={stuck || undefined}
        style={{ top }}
        className={`group/dock sticky z-30 -mx-4 mt-0 px-4 transition-[padding,background-color,box-shadow] duration-200 sm:-mx-6 sm:px-6
          data-[stuck]:max-h-[70svh] data-[stuck]:overflow-y-auto data-[stuck]:border-b data-[stuck]:border-edge data-[stuck]:bg-ink/85 data-[stuck]:py-2 data-[stuck]:shadow-[var(--shadow-raised)] data-[stuck]:backdrop-blur-md`}
      >
        {children}
      </div>
    </>
  );
}
