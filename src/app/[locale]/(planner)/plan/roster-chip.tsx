'use client';

import { RotateCcw, X } from 'lucide-react';
import Link from 'next/link';

import { Hint } from '@/components/hint';

import { dismissRoster, restoreRoster } from './roster-actions';
import { usePlannedCount, useRosterOptimism } from './roster-optimism';

/**
 * One face in the roster list: the name that filters, the button that
 * dismisses or restores. Drawn from the optimistic state, so a click changes
 * it at once — see `roster-optimism.tsx`.
 *
 * A link and a form button cannot nest, so the two verbs sit side by side
 * inside one chip rather than one inside the other.
 */
export function RosterChip({
  characterId,
  name,
  icon,
  hasTarget,
  dismissed: fromServer,
  picked,
  dimmed,
  assume,
  filterHref,
  labels,
}: {
  characterId: number;
  name: string;
  /** The face, drawn by the server: the image component resolves assets there. */
  icon: React.ReactNode;
  hasTarget: boolean;
  dismissed: boolean;
  picked: boolean;
  /** Another face is picked, so this one steps back. */
  dimmed: boolean;
  /** Whether characters with no target count, which decides who can be filtered to. */
  assume: boolean;
  filterHref: string;
  labels: { restore: string; dismiss: string; filter: string; stopFilter: string };
}) {
  const { isDismissed, apply } = useRosterOptimism();
  const dismissed = isDismissed(characterId, fromServer);
  // Somebody the plan is not counting has no demand to filter down to, so
  // their name is a label rather than a control.
  const filterable = !dismissed && (hasTarget || assume);

  const content = (
    <>
      {icon}
      <span className={dismissed ? 'line-through' : ''}>{name}</span>
      {/* A character with a target of their own was planned for on purpose, so
          the assumption is not what is driving them. */}
      {hasTarget && !dismissed && <span className="text-2xs">●</span>}
    </>
  );
  const faceClass = 'flex items-center gap-1.5 py-0.5 pl-1 pr-2';

  return (
    <li
      className={`flex items-center overflow-hidden rounded border text-2xs transition-opacity ${
        picked ? 'border-accent ring-1 ring-accent' : 'border-edge'
      } ${dismissed ? 'opacity-60' : ''} ${dimmed && !picked ? 'opacity-50' : ''}`}
    >
      {filterable ? (
        <Hint text={picked ? labels.stopFilter : labels.filter}>
          <Link
            href={filterHref}
            aria-current={picked ? 'true' : undefined}
            className={`${faceClass} ${picked ? 'text-accent' : 'hover:text-accent'}`}
          >
            {content}
          </Link>
        </Hint>
      ) : (
        <span className={`${faceClass} text-muted`}>{content}</span>
      )}

      <form
        action={async () => {
          apply({ ids: [characterId], dismissed: !dismissed });
          await (dismissed ? restoreRoster(characterId) : dismissRoster(characterId));
        }}
      >
        <Hint text={dismissed ? labels.restore : labels.dismiss}>
          <button
            type="submit"
            aria-label={dismissed ? labels.restore : labels.dismiss}
            className={`flex h-7 w-6 items-center justify-center border-l text-muted ${
              picked ? 'border-accent' : 'border-edge'
            } ${dismissed ? 'hover:text-accent' : 'hover:text-bad'}`}
          >
            {dismissed ? <RotateCcw size={11} /> : <X size={11} />}
          </button>
        </Hint>
      </form>
    </li>
  );
}

/** Dismissing or restoring everybody at once, applied as one patch. */
export function RosterBulk({
  dismiss,
  entries,
  children,
}: {
  /** True for "dismiss all", false for "restore all". */
  dismiss: boolean;
  entries: readonly { characterId: number; dismissed: boolean }[];
  children: React.ReactNode;
}) {
  const { apply } = useRosterOptimism();
  const planned = usePlannedCount(entries);
  const disabled = dismiss ? planned === 0 : planned === entries.length;

  return (
    <form
      action={async () => {
        apply({ ids: 'all', dismissed: dismiss });
        await (dismiss ? dismissRoster(null) : restoreRoster(null));
      }}
    >
      <button
        type="submit"
        disabled={disabled}
        className="flex items-center gap-1.5 rounded border border-edge px-2.5 py-1 font-mono text-2xs uppercase text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-40"
      >
        {children}
      </button>
    </form>
  );
}

/** The panel's "N of M in the plan", following the same clicks. */
export function PlannedCount({
  entries,
  suffix,
}: {
  entries: readonly { characterId: number; dismissed: boolean }[];
  suffix: string;
}) {
  const planned = usePlannedCount(entries);

  return (
    <span>
      <span className="text-accent">{planned}</span>
      <span className="text-muted"> {suffix}</span>
    </span>
  );
}
