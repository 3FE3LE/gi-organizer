'use client';

import { useState } from 'react';

import { Slider } from '@/components/ui/slider';

export type BaseStatRow = {
  /** The game's own row label: `1`, `40`, `40+`, `90`. */
  key: string;
  /** `key` is the stat's column in the table; two cells can share a `label`. */
  cells: { key: string; label: string; value: string; ascension?: boolean }[];
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
}: {
  rows: BaseStatRow[];
  /** Index into `rows`, from the level and phase the character is at. */
  startAt: number;
  heading: string;
  sliderLabel: string;
  levelPrefix: string;
  /** Marks the cell that steps at the ascension phase, not at the level. */
  ascensionLabel: string;
}) {
  const [index, setIndex] = useState(Math.min(Math.max(startAt, 0), rows.length - 1));
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
            className="min-w-0 flex-1"
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
            <dd>{cell.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
