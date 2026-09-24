'use client';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useQueryStates } from 'nuqs';
import { useEffect, useRef, useState, useTransition } from 'react';

import { AssetImage } from '@/components/asset-image';
import { Hint } from '@/components/hint';

import { artifactParsers } from './filters';

export type SetChoice = {
  setId: number;
  name: string;
  /** The flower, resolved on the server: the piece every set has. */
  icon: string | null;
  /** One line per bonus, already formatted. */
  effects: string[];
  /** Pieces of it in the box. Zero still shows, dimmed, after the rest. */
  count: number;
};

/**
 * Every set, as a row of its flowers.
 *
 * A dropdown of names asked the player to recognise a set by what it is
 * called, and nobody does: they know it by its art. So the sets are the art,
 * one row that scrolls sideways, with the name kept for hover and for screen
 * readers. Owned sets come first; the ones the box holds none of stay in the
 * row, dimmed, because "which sets do I have nothing of" is a question too.
 *
 * Picking one filters by it and opens what the set does under the row — a
 * filter on a set is usually a question about whether it is worth farming, and
 * the answer is its bonus. Picking it again clears it.
 */
export function SetStrip({ sets }: { sets: SetChoice[] }) {
  const t = useTranslations('artifacts');
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(artifactParsers, {
    shallow: false,
    startTransition,
  });
  const active = sets.find((set) => set.setId === filters.set) ?? null;
  const activeRef = useRef<HTMLButtonElement>(null);
  const { rowRef, edges, nudge } = useDragScroll();

  // A shared URL can name a set far down the row; bring it into view once.
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, []);

  return (
    <div
      data-pending={pending || undefined}
      className="min-w-0 space-y-1.5 transition-opacity data-pending:opacity-60"
    >
      <p className="font-mono text-2xs uppercase text-muted">{t('setLabel')}</p>

      <div className="relative">
      {/* Arrows for a pointer, which has no swipe: a page at a time, and only
          where there is somewhere to go. A phone has the swipe and never shows
          them. */}
      {edges.start && (
        <StripArrow side="left" label={t('setsScrollBack')} onClick={() => nudge(-1)} />
      )}
      {edges.end && (
        <StripArrow side="right" label={t('setsScrollForward')} onClick={() => nudge(1)} />
      )}
      <ul
        ref={rowRef}
        aria-label={t('setAria')}
        className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1.5 pt-1 [scrollbar-width:thin] md:cursor-grab md:active:cursor-grabbing"
      >
        {sets.map((set) => {
          const selected = set.setId === filters.set;

          return (
            <li key={set.setId} className="shrink-0 snap-start">
              <Hint text={`${set.name} · ${set.count}`}>
                <button
                  ref={selected ? activeRef : undefined}
                  type="button"
                  aria-pressed={selected}
                  aria-label={`${set.name} (${set.count})`}
                  onClick={() => setFilters({ set: selected ? null : set.setId })}
                  className={`relative flex h-11 w-11 items-center justify-center rounded-lg border transition-colors ${
                    selected
                      ? 'border-accent bg-accent/10'
                      : 'border-edge bg-surface hover:border-edge-strong'
                  } ${set.count === 0 && !selected ? 'opacity-40 grayscale' : ''}`}
                >
                  <AssetImage src={set.icon} kind="relic" alt="" className="h-8 w-8" sizes="32px" />
                  {set.count > 0 && (
                    <span className="tabular absolute -bottom-1 -right-1 rounded bg-ink px-1 font-mono text-2xs leading-4 text-muted">
                      {set.count}
                    </span>
                  )}
                </button>
              </Hint>
            </li>
          );
        })}
      </ul>
      </div>

      {/* What the chosen set does, while the list below shows what you have of
          it. Live, so picking a set by keyboard also reads its bonus. */}
      <div aria-live="polite">
        {active && (
          <div className="flex items-start gap-3 card-2 px-3 py-1.5">
            <AssetImage src={active.icon} kind="relic" alt="" className="h-8 w-8 shrink-0" sizes="32px" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm">
                {active.name}{' '}
                <span className="font-mono text-2xs text-muted">
                  {t('setPieceCount', { count: active.count })}
                </span>
              </p>
              {active.effects.map((line) => (
                <p key={line} className="text-xs leading-relaxed text-muted">{line}</p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setFilters({ set: null })}
              aria-label={t('clearSetAria')}
              className="shrink-0 rounded p-1 text-muted hover:text-text"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * A sideways row a mouse can actually move.
 *
 * A touch screen swipes an overflowing row for free; a mouse gets a thin
 * scrollbar and shift-and-wheel, both of which ask for precision nobody has
 * while hunting for one flower among forty. So on a mouse:
 *
 *   - **Drag.** Press and pull the row itself. Past a few pixels it is a drag,
 *     and the click that ends it is swallowed, so letting go over a set does
 *     not also pick it. Snapping is off while the finger — the button — is
 *     down, or the row would fight the pointer for every pixel.
 *   - **Wheel.** A vertical wheel over the row moves it sideways, until the
 *     row runs out; at either end the wheel goes back to scrolling the page,
 *     so the strip is never a place the page gets stuck.
 *   - **Arrows**, drawn by the caller from `edges`, a page at a time.
 *
 * Touch is left to the browser: it already does all of this better.
 */
function useDragScroll() {
  const rowRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;

    const measure = () => setEdges({
      start: row.scrollLeft > 4,
      end: row.scrollLeft + row.clientWidth < row.scrollWidth - 4,
    });
    measure();

    let origin: { x: number; left: number } | null = null;
    let dragged = false;

    const down = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      origin = { x: event.clientX, left: row.scrollLeft };
      dragged = false;
    };
    const move = (event: PointerEvent) => {
      if (!origin) return;
      const dx = event.clientX - origin.x;
      if (!dragged && Math.abs(dx) < 5) return;
      if (!dragged) {
        dragged = true;
        row.style.scrollSnapType = 'none';
        row.setPointerCapture(event.pointerId);
      }
      row.scrollLeft = origin.left - dx;
    };
    const up = (event: PointerEvent) => {
      if (!origin) return;
      origin = null;
      if (row.hasPointerCapture(event.pointerId)) row.releasePointerCapture(event.pointerId);
      row.style.scrollSnapType = '';
    };
    // Capture phase, so the set under the pointer never hears the click that
    // ended a drag.
    const click = (event: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      event.preventDefault();
      event.stopPropagation();
    };
    // The flowers are images, and an image is natively draggable: left alone,
    // the browser starts dragging the picture a few pixels in and cancels the
    // pointer, which ends the scroll almost as soon as it starts.
    const dragstart = (event: DragEvent) => event.preventDefault();
    const wheel = (event: WheelEvent) => {
      if (event.shiftKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = row.scrollWidth - row.clientWidth;
      const next = row.scrollLeft + event.deltaY;
      if ((event.deltaY < 0 && row.scrollLeft <= 0) || (event.deltaY > 0 && row.scrollLeft >= max)) return;
      event.preventDefault();
      row.scrollLeft = Math.max(0, Math.min(max, next));
    };

    row.addEventListener('pointerdown', down);
    row.addEventListener('pointermove', move);
    row.addEventListener('pointerup', up);
    row.addEventListener('pointercancel', up);
    row.addEventListener('click', click, true);
    row.addEventListener('dragstart', dragstart);
    row.addEventListener('wheel', wheel, { passive: false });
    row.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);

    return () => {
      row.removeEventListener('pointerdown', down);
      row.removeEventListener('pointermove', move);
      row.removeEventListener('pointerup', up);
      row.removeEventListener('pointercancel', up);
      row.removeEventListener('click', click, true);
      row.removeEventListener('dragstart', dragstart);
      row.removeEventListener('wheel', wheel);
      row.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  const nudge = (direction: 1 | -1) => {
    const row = rowRef.current;
    if (!row) return;
    row.scrollBy({ left: direction * row.clientWidth * 0.8, behavior: 'smooth' });
  };

  return { rowRef, edges, nudge };
}

function StripArrow({
  side,
  label,
  onClick,
}: {
  side: 'left' | 'right';
  label: string;
  onClick: () => void;
}) {
  const Icon = side === 'left' ? ChevronLeft : ChevronRight;

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`absolute top-1 z-10 hidden h-11 w-8 items-center justify-center text-muted transition-colors hover:text-text md:flex ${
        side === 'left'
          ? '-left-1 bg-gradient-to-r from-surface via-surface/90 to-transparent'
          : '-right-1 bg-gradient-to-l from-surface via-surface/90 to-transparent'
      }`}
    >
      <Icon size={16} aria-hidden />
    </button>
  );
}
