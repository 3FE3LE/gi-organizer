'use client';

import { useEffect, useState } from 'react';

import { AnimatedNumber } from '@/components/animated-number';
import { ElementIcon } from '@/components/element-icon';
import { Slider } from '@/components/ui/slider';

/**
 * Where the slider last rested, across characters. The page remounts on each
 * step along the roster, so the thumb opens where the last character's did and
 * then glides to this one's level instead of appearing there.
 */
let lastIndex: number | null = null;

export type AttributeRow = {
  prop: string;
  label: string;
  percent: boolean;
  /** The element colour, for the character's own damage bonus. */
  accent?: string;
  /** The stat the character ascends into: it steps at the phase, not the level. */
  ascension: boolean;
  /** For an elemental damage bonus, the element whose emblem leads the row. */
  element?: string | null;
};

export type AttributeLevel = {
  /** The stat table's row: `1`, `40`, `40+`, `90`. */
  key: string;
  /** Per prop: what the character brings, and the total with the gear on. */
  values: Record<string, { base: number; total: number }>;
};

/**
 * The attribute panel, at any level: every stat as base, bonus and total.
 *
 * There used to be two of these. The attributes read the game's way — a split
 * for HP, ATK and DEF, a bare total for everything else — and under them a
 * "base stats" row with its own level slider, repeating HP, ATK and DEF and
 * adding the ascension stat. Two readings of the same numbers, one of which
 * moved and one of which did not.
 *
 * Now there is one. Every row splits its total — the character's own number,
 * then what the gear adds — so crit and recharge say where they come from as
 * HP always did. The slider sits on top and moves all of it: the character at
 * another level, wearing exactly what they wear now. It previews and writes
 * nothing; the target lives on the objective form. It opens on the level the
 * character is on.
 */
export function Attributes({
  rows,
  levels,
  startAt,
  sliderLabel,
  levelPrefix,
  ascensionLabel,
  previewLabel,
  locale,
}: {
  rows: AttributeRow[];
  levels: AttributeLevel[];
  /** Index into `levels`, from the level and phase the character is at. */
  startAt: number;
  sliderLabel: string;
  levelPrefix: string;
  /** Marks the row that steps at the ascension phase. */
  ascensionLabel: string;
  /** Said beside the level when the slider is off the character's own. */
  previewLabel: string;
  locale: string;
}) {
  const start = Math.min(Math.max(startAt, 0), levels.length - 1);
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

  const level = levels[index];
  if (!level) return null;
  const previewing = index !== start;

  return (
    <div>
      <label className="mb-2 flex items-center gap-2">
        <span className="sr-only">{sliderLabel}</span>
        <Slider
          min={0}
          max={levels.length - 1}
          step={1}
          value={index}
          onValueChange={(next) => setIndex(Number(next))}
          // Glides when set, follows the finger when dragged: the transition
          // is off while Base UI marks a drag in progress.
          className={`min-w-0 flex-1 ${glide
            ? '[&_[data-slot=slider-range]]:transition-[width] [&_[data-slot=slider-thumb]]:transition-[inset-inline-start,left,color,box-shadow] [&_[data-slot=slider-thumb]]:duration-300 [&_[data-slot=slider-range]]:duration-300 [&[data-dragging]_*]:transition-none'
            : ''}`}
        />
        {/* A fixed width, so the track under the finger never resizes. The
            key runs from `1` to `90+`, and the preview mark used to come and
            go: back on the character's own level the label shrank, the track
            widened, and the thumb jumped out from under the drag. The mark is
            always laid out now, and only hidden. */}
        <span className={`tabular shrink-0 text-right font-mono text-2xs ${previewing ? 'text-accent' : ''}`}>
          {levelPrefix} <span className="inline-block min-w-[3ch] text-left">{level.key}</span>
          <span className={`ml-1 uppercase ${previewing ? '' : 'invisible'}`} aria-hidden={!previewing}>
            · {previewLabel}
          </span>
        </span>
      </label>

      <dl className="grid gap-x-6 sm:grid-cols-2">
        {rows.map((row) => {
          const value = level.values[row.prop] ?? { base: 0, total: 0 };
          const bonus = value.total - value.base;

          return (
            <div
              key={row.prop}
              className="flex items-center justify-between gap-3 border-b border-edge/50 py-1.5"
            >
              <dt className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted">
                {row.element && <ElementIcon element={row.element} className="h-3.5 w-3.5" />}
                {row.label}
                {row.ascension && (
                  <span className="ml-1 text-2xs uppercase text-accent">
                    {ascensionLabel}
                  </span>
                )}
              </dt>
              <dd className="tabular flex items-baseline gap-2 font-mono">
                {/* The split only where there is one: a stat the gear adds
                    nothing to is its own base, and printing `+0` under it on
                    every row would be noise. */}
                {Math.abs(bonus) > 0.05 && (
                  <span className="flex flex-col items-end text-2xs leading-tight">
                    <span className="text-muted">
                      <AnimatedNumber
                        id={`base:${row.prop}`}
                        value={value.base}
                        percent={row.percent}
                        locale={locale}
                      />
                    </span>
                    <span className="text-good">
                      <AnimatedNumber
                        id={`bonus:${row.prop}`}
                        value={bonus}
                        percent={row.percent}
                        signed
                        locale={locale}
                      />
                    </span>
                  </span>
                )}
                <span
                  className="text-sm element-tint"
                  style={row.accent ? ({ '--element': row.accent } as React.CSSProperties) : undefined}
                >
                  <AnimatedNumber
                    id={`total:${row.prop}`}
                    value={value.total}
                    percent={row.percent}
                    locale={locale}
                  />
                </span>
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
