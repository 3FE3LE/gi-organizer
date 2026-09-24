'use client';

import { useQueryStates } from 'nuqs';
import { useTransition } from 'react';

import { SetStripView, type SetChoice } from '@/components/set-strip-view';

import { artifactParsers } from './filters';

export type { SetChoice };

/**
 * The box's set strip, filtering through the URL — the drawing is shared with
 * the gear dialog, which filters its own candidates in place; see
 * `components/set-strip-view.tsx`.
 */
export function SetStrip({ sets }: { sets: SetChoice[] }) {
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(artifactParsers, {
    shallow: false,
    startTransition,
  });

  return (
    <SetStripView
      sets={sets}
      selected={filters.set}
      onSelect={(set) => setFilters({ set })}
      pending={pending}
    />
  );
}
