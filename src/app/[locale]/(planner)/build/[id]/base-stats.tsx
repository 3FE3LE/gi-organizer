'use client';

import { useEffect, useState } from 'react';

import { AnimatedNumber } from '@/components/animated-number';
import { Slider } from '@/components/ui/slider';

/**
 * Where the slider last rested, across characters. The page remounts on each
 * step along the roster, so the thumb opens where the last character's did and
 * then glides to this one's level instead of appearing there.
 */
let lastIndex: number | null = null;

export type BaseStatRow = {
  /** The game's own row label: `1`, `40`, `40+`, `90`. */
  key: string;
  /** `key` is the stat's column in the table; two cells can share a `label`. */
  cells: {
    key: string; label: string; value: string; raw: number; percent: boolean; ascension?: boolean;
  }[];
};

/**
 * What the character is worth naked, at any level: one row and a slider.
 *
 * This was a fourteen-row table on a page of its own — every ascension
 * breakpoint, all four stats, printed at once. Nobody reads fourteen rows; they
 * read one, the one they are at or the one they are going to. So the fourteen
 * rows became fourteen positions of a slider, and the table became the line it
 * was always being narrowed down to.
 *
 * Opens on the level the character is on, like the talent dialog, and writes
 * nothing: the target lives on the objective form.
 */
export function BaseStats({
  rows,
  startAt,
  heading,
  sliderLabel,
  levelPrefix,
  ascensionLabel,
  locale,
}: {
  rows: BaseStatRow[];
  /** Index into `rows`, from the level and phase the character is at. */
  startAt: number;
  heading: string;
  sliderLabel: string;
  levelPrefix: string;
  /** Marks the cell that steps at the ascension phase, not at the level. */
  ascensionLabel: string;
  locale: string;
}) {
  const start = Math.min(Math.max(startAt, 0), rows.length - 1);
  const [index, setIndex] = useState(() => lastIndex ?? start);
  // Off for the first frames: Base UI places the thumb at 0 and then measures
  // it into place, and a transition on from the start drew that as a sweep
  // across the track on every load.
  const [glide, setGlide] = useState(false);

  // Opens at the last position, measured, then glides to this character's.
  useEffect(() => {
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        setGlide(true);
        setIndex(start);
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [start]);
  useEffect(() => { lastIndex = index; }, [index]);

  const row = rows[index];
  if (!row) return null;

  return (
    <div className="mt-5">
      <div className="mb-2 flex items-center gap-3">
        <h2 className="shrink-0 text-xs font-medium uppercase tracking-wide text-muted">
          {heading}
        </h2>
        <label className="flex flex-1 items-center gap-2">
          <span className="sr-only">{sliderLabel}</span>
          <Slider
            min={0}
            max={rows.length - 1}
            step={1}
            value={index}
            onValueChange={(next) => setIndex(Number(next))}
            // Glides when set, follows the finger when dragged: the
            // transition is off while Base UI marks a drag in progress.
            className={`min-w-0 flex-1 ${glide
              ? '[&_[data-slot=slider-range]]:transition-[width] [&_[data-slot=slider-thumb]]:transition-[inset-inline-start,left,color,box-shadow] [&_[data-slot=slider-thumb]]:duration-300 [&_[data-slot=slider-range]]:duration-300 [&[data-dragging]_*]:transition-none'
              : ''}`}
          />
          <span className="tabular w-16 shrink-0 text-right font-mono text-2xs">
            {levelPrefix} {row.key}
          </span>
        </label>
      </div>

      <dl className="tabular flex flex-wrap gap-x-6 gap-y-1 card-2 px-3 py-2 font-mono text-xs">
        {row.cells.map((cell) => (
          <div key={cell.key} className="flex items-baseline gap-2">
            <dt className="text-muted">
              {cell.label}
              {cell.ascension && (
                <span className="ml-1 text-2xs uppercase text-accent" title={ascensionLabel}>
                  {ascensionLabel}
                </span>
              )}
            </dt>
            <dd>
              <AnimatedNumber
                id={`base-stat:${cell.key}`}
                value={cell.raw}
                percent={cell.percent}
                locale={locale}
              />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
