'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * A stat that counts from the last character's value to this one's.
 *
 * Stepping to the next character swapped every number at once, so the one
 * thing worth seeing — how much tankier, how much more crit — was gone before
 * it could be compared. Each number now remembers what it last showed, by the
 * stat it is rather than by the character, and runs from there.
 *
 * The memory is module state, not component state: the page remounts on every
 * step along the roster, and component state would start from nothing each
 * time. On a first load there is nothing remembered, so the server's number is
 * the first frame and hydration matches. The formatting is the one
 * `formatPropValue` uses — a percent to one decimal, anything else a rounded
 * integer — so the last frame is exactly the text the server would print.
 */
const shown = new Map<string, number>();
const DURATION = 450;

export function AnimatedNumber({
  id,
  value,
  percent = false,
  signed = false,
  locale,
}: {
  /** What this number is, across characters: `total:FIGHT_PROP_HP`. */
  id: string;
  value: number;
  percent?: boolean;
  /** A bonus: printed with its `+`. */
  signed?: boolean;
  locale: string;
}) {
  const [current, setCurrent] = useState(() => shown.get(id) ?? value);
  // What is on screen right now, which is where a run starts. Read from here
  // rather than from `shown`: an effect that runs twice — as React's strict
  // mode does in development — would otherwise find the new value already
  // recorded and start from the end.
  const onScreen = useRef(current);
  const frame = useRef(0);

  useEffect(() => {
    shown.set(id, value);
    const from = onScreen.current;
    const show = (next: number) => {
      onScreen.current = next;
      setCurrent(next);
    };

    if (from === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      frame.current = requestAnimationFrame(() => show(value));
      return () => cancelAnimationFrame(frame.current);
    }

    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      show(from + (value - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame.current);
  }, [id, value]);

  const text = percent ? `${current.toFixed(1)}%` : Math.round(current).toLocaleString(locale);
  return <>{signed ? `+${text}` : text}</>;
}
