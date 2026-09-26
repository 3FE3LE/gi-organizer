'use client';

import { Search } from 'lucide-react';
import { debounce, useQueryState } from 'nuqs';
import { useTransition } from 'react';

import { rosterParsers } from './filters';

/**
 * The name search, written to the URL as it is typed.
 *
 * The one control on the roster that is an input rather than a link. The box
 * answers at once — nuqs holds the typed value — while the address and the
 * server's answer follow a quarter of a second behind, so a name is one
 * request rather than one per letter. `shallow: false` because the gallery is
 * drawn on the server; the transition dims the box while it answers instead
 * of the list appearing to ignore what was typed.
 */
export function SearchBox({ label, placeholder }: { label: string; placeholder: string }) {
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useQueryState(
    'q',
    rosterParsers.q.withOptions({
      shallow: false,
      scroll: false,
      startTransition,
      limitUrlUpdates: debounce(250),
    }),
  );

  return (
    <label
      data-pending={pending || undefined}
      className="field flex h-9 min-w-0 items-center gap-2 rounded-lg px-2.5 transition-opacity data-pending:opacity-60 sm:w-64"
    >
      <Search size={14} aria-hidden className="shrink-0 text-muted" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={query}
        placeholder={placeholder}
        // An empty box is the default and leaves the address; see the parser.
        onChange={(event) => setQuery(event.target.value || null)}
        // Clearing is immediate: nothing to wait out once the box is empty.
        onKeyDown={(event) => {
          if (event.key === 'Escape') setQuery(null, { limitUrlUpdates: undefined });
        }}
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
      />
    </label>
  );
}
