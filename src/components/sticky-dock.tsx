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
 *
 * What the dock gives up when it docks is handed back to the page as a spacer
 * under it. Without that, docking made the page shorter by exactly what was
 * folded away: on a list barely taller than the screen the scroll position
 * no longer fitted, the browser pulled it back up, the dock let go, grew back,
 * and docked again — a loop the eye sees as the bar flickering. Held at one
 * height, the page also stops jumping by that amount under the reader.
 */
export function StickyDock({ children }: { children: React.ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  const [stuck, setStuck] = useState(false);
  // The dock's height as last seen undocked, and what docking has taken off
  // it since.
  const undocked = useRef(0);
  const [shortfall, setShortfall] = useState(0);

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

  // Followed through the docking transition rather than read once, since the
  // padding eases and an open disclosure can grow the dock back.
  useEffect(() => {
    const node = dock.current;
    if (!node) return;
    const measure = () => {
      const height = node.getBoundingClientRect().height;
      if (!stuck) undocked.current = height;
      setShortfall(stuck ? Math.max(0, Math.round(undocked.current - height)) : 0);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [stuck]);

  return (
    <>
      {/* No margin of its own, so the page's spacing still reads as one gap. */}
      <div ref={sentinel} aria-hidden className="mb-0 h-px" />
      <div
        ref={dock}
        data-stuck={stuck || undefined}
        style={{ top }}
        className={`group/dock sticky z-30 -mx-4 mt-0 px-4 transition-[padding,background-color,box-shadow] duration-200 sm:-mx-6 sm:px-6
          data-[stuck]:max-h-[70svh] data-[stuck]:overflow-y-auto data-[stuck]:border-b data-[stuck]:border-edge data-[stuck]:bg-ink/85 data-[stuck]:py-2 data-[stuck]:shadow-[var(--shadow-raised)] data-[stuck]:backdrop-blur-md`}
      >
        {children}
      </div>
      {shortfall > 0 && <div aria-hidden style={{ height: shortfall }} className="mb-0" />}
    </>
  );
}
