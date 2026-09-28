'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** The padding a docked bar has around its controls, in pixels (`py-2`). */
const PAD = 8;

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
 * Docking changes nothing about the dock's geometry. The padding it docks with
 * is always there — above the controls cancelled by an equal negative margin,
 * below them left as a little air, since a negative margin there would cancel
 * the gap the page's own spacing puts under the dock — and the glass, the edge
 * and the shadow are one layer behind the
 * controls that fades in. The padding used to animate in from nothing and the
 * edge to appear as a new pixel of border, both on the frame the dock stuck —
 * so a slow scroll saw the controls jump down and the bar jolt as it took
 * hold. What folds away on docking folds, see `dock-fold.tsx`.
 *
 * What the dock gives up when it docks is handed back to the page as a spacer
 * at the very end of it. Without that, docking made the page shorter by
 * exactly what was folded away: on a list barely taller than the screen the
 * scroll position no longer fitted, the browser pulled it back up, the dock
 * let go, grew back, and docked again — a loop the eye sees as the bar
 * flickering. At the end, not under the dock: there it held the list where
 * it was, and the list sat a folded filter's height below the bar — a blank
 * band that only closed once it had scrolled away.
 *
 * An open disclosure holds the dock in the page until the whole of it has
 * scrolled past. Docking the moment its top reached the header folded the
 * open "more filters" away — or capped it at part of the screen — right while
 * somebody was scrolling down to its last control, the main stat under a
 * picked slot: on a phone the control they were reaching for vanished under
 * their thumb. So while one is open the dock scrolls with the page like any
 * card, and docks only once its bottom has gone under the header, closing the
 * disclosure as it does so the bar that comes back is the compact one. A
 * disclosure opened on a bar that is already docked keeps it docked, since
 * that one is being used where it is.
 */
export function StickyDock({ children }: { children: React.ReactNode }) {
  const sentinel = useRef<HTMLDivElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(0);
  // The line the dock's top docks at has been scrolled past, and so has the
  // line its bottom sits on.
  const [passed, setPassed] = useState(false);
  const [passedEnd, setPassedEnd] = useState(false);
  // A disclosure inside the dock is open.
  const [open, setOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  // The dock's height as last seen undocked, and what docking has taken off
  // it since.
  const undocked = useRef(0);
  const [shortfall, setShortfall] = useState(0);

  // The header's height, kept current as it wraps or the viewport turns.
  useEffect(() => {
    const header = document.querySelector('header');
    if (!header) return;
    // Down, never to the nearest: a header 56.6 px tall rounded up left a
    // hairline of page showing between the two. Rounded down, the dock tucks
    // a fraction of a pixel under the header, which is drawn above it.
    const measure = () => setTop(Math.floor(header.getBoundingClientRect().height));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => observer.disconnect();
  }, []);

  // Stuck once the point where the dock would sit has scrolled under the
  // header. The dock's box starts `PAD` above its controls, and the sentinel
  // marks where the controls start, so the line it crosses is that far lower.
  useEffect(() => {
    const line = top + PAD + 1;
    const watch = (node: HTMLElement | null, set: (value: boolean) => void) => {
      if (!node) return null;
      const observer = new IntersectionObserver(
        ([entry]) => set(!entry.isIntersecting && entry.boundingClientRect.top < line),
        { rootMargin: `-${line}px 0px 0px 0px` },
      );
      observer.observe(node);
      return observer;
    };
    const observers = [watch(sentinel.current, setPassed), watch(end.current, setPassedEnd)];
    return () => observers.forEach((observer) => observer?.disconnect());
  }, [top]);

  // `toggle` does not bubble, so it is caught on the way down.
  useEffect(() => {
    const node = dock.current;
    if (!node) return;
    const read = () => setOpen(node.querySelector('details[open]') !== null);
    read();
    node.addEventListener('toggle', read, true);
    return () => node.removeEventListener('toggle', read, true);
  }, []);

  // Docked once the top has passed — unless a disclosure is open, which waits
  // for the bottom. Already docked, it stays docked whatever opens. Adjusted
  // while rendering, since it depends on its own last value.
  const docks = passed && (stuck || !open || passedEnd);
  if (docks !== stuck) setStuck(docks);

  // Docking past an open disclosure closes it, so the bar that comes back is
  // the compact one rather than the whole panel over the list.
  useEffect(() => {
    if (!stuck || !passedEnd) return;
    dock.current?.querySelectorAll('details[open]').forEach((details) => {
      (details as HTMLDetailsElement).open = false;
    });
  }, [stuck, passedEnd]);

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
      {/* Held in the page — not sticky — while an open disclosure waits for
          its bottom to pass, or the browser would pin it at its top anyway. */}
      <div
        ref={dock}
        data-stuck={stuck || undefined}
        style={{ top }}
        className={`group/dock ${passed && !stuck ? 'relative' : 'sticky'} z-30 -mx-4 -mt-2 px-4 py-2 sm:-mx-6 sm:px-6
          before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:border-b before:border-edge before:bg-ink/85 before:opacity-0 before:shadow-[var(--shadow-raised)] before:backdrop-blur-md before:transition-opacity before:duration-200
          data-[stuck]:max-h-[70svh] data-[stuck]:overflow-y-auto data-[stuck]:overscroll-contain data-[stuck]:before:opacity-100`}
      >
        {children}
        {/* The dock's bottom, inside it so it adds nothing to the page's
            spacing; only read while the dock is held in the page. */}
        <div ref={end} aria-hidden className="pointer-events-none absolute bottom-0 left-0 h-px w-px" />
      </div>
      {shortfall > 0 && createPortal(<div aria-hidden style={{ height: shortfall }} />, document.body)}
    </>
  );
}
