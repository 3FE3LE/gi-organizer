'use client';

import { Search } from 'lucide-react';
import { debounce, parseAsString, useQueryState } from 'nuqs';
import { useTransition } from 'react';
import { GROUP_LABEL } from '@/components/segmented-links';

/**
 * The name search, written to the URL as it is typed.
 *
 * The one control on the roster and the weapons tab that is an input rather
 * than a link — both read it as `q`, an empty string by default. The box
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
    parseAsString.withDefault('').withOptions({
      shallow: false,
      scroll: false,
      startTransition,
      limitUrlUpdates: debounce(250),
    }),
  );

  return (
    // Named like its neighbours wherever it sits in a row with them — from
    // `sm` up, where the grouping and the elements beside it each carry a
    // heading and a bare box read as the odd one out. On a phone it has the
    // row to itself, and the icon and the placeholder say what it is.
    <div className="space-y-0.5">
      <p aria-hidden className={`${GROUP_LABEL} max-sm:hidden`}>{label}</p>
    <label
      data-pending={pending || undefined}
      className="field flex h-9 min-w-0 items-center gap-2 rounded-lg px-2.5 transition-opacity data-pending:opacity-60"
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
    </div>
  );
}
