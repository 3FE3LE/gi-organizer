'use client';

import { RotateCcw, Users, X } from 'lucide-react';

import { Hint } from '@/components/hint';
import { buttonVariants } from '@/components/ui/button';

import { dismissRoster, restoreRoster } from './roster-actions';
import { usePlannedCount, useRosterOptimism } from './roster-optimism';

/**
 * One face in the roster: in the plan at full colour, out of it greyed, and a
 * click moves it from one to the other.
 *
 * It used to be a chip with a name and two verbs — the name narrowed the view,
 * a × beside it dismissed — which made sixty names a wall of text in which the
 * state that mattered, in or out, was a strike-through. The faces are the
 * ones a piece's holder is drawn with, so the roster reads like the rest of
 * the app, and the one verb left is the one the list is for.
 *
 * Drawn from the optimistic state, so a click changes it at once — see
 * `roster-optimism.tsx`.
 */
export function RosterFace({
  characterId,
  name,
  icon,
  hasTarget,
  booksToday,
  dismissed: fromServer,
  labels,
}: {
  characterId: number;
  name: string;
  /** The face, drawn by the server: the image component resolves assets there. */
  icon: React.ReactNode;
  hasTarget: boolean;
  /** A talent book they still need drops from a domain open today. */
  booksToday: boolean;
  dismissed: boolean;
  labels: { restore: string; dismiss: string; target: string; today: string };
}) {
  const { isDismissed, apply } = useRosterOptimism();
  const dismissed = isDismissed(characterId, fromServer);
  // Out of the plan is headed nowhere, so today's domain is not theirs to farm.
  const today = booksToday && !dismissed;
  // Everything the face shows in colour is also said in words, for the tooltip
  // and for a screen reader alike.
  const label = [
    name,
    today && labels.today,
    hasTarget && labels.target,
    dismissed ? labels.restore : labels.dismiss,
  ].filter(Boolean).join(' · ');

  return (
    <li>
      <form
        action={async () => {
          apply({ ids: [characterId], dismissed: !dismissed });
          await (dismissed ? restoreRoster([characterId]) : dismissRoster([characterId]));
        }}
      >
        <Hint text={label}>
          <button
            type="submit"
            aria-label={label}
            aria-pressed={!dismissed}
            className={`relative block rounded-full transition-[filter,opacity] duration-(--duration-enter) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              dismissed ? 'opacity-40 grayscale hover:opacity-70' : 'hover:brightness-110'
            } ${today ? 'ring-2 ring-info ring-offset-2 ring-offset-surface' : ''}`}
          >
            {icon}
            {/* A character with a target of their own was planned for on
                purpose, so the assumption is not what is driving them. */}
            {hasTarget && (
              <span
                aria-hidden
                className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent"
              />
            )}
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
        className={buttonVariants({ variant: dismiss ? 'destructive' : 'outline', size: 'xs', className: 'font-mono text-2xs uppercase' })}
      >
        {dismiss ? <X size={11} /> : <RotateCcw size={11} />} {children}
      </button>
    </form>
  );
}

/**
 * A whole team in or out of the plan, as one toggle.
 *
 * While any member is out, a press brings the missing ones back and nobody
 * else moves. Once all of them are in, it is pressed — drawn filled — and the
 * next press takes the team out again, the way a filter chip switches off.
 */
export function RosterTeam({
  name,
  members,
  labels,
}: {
  name: string;
  /** The team's owned members, as the server last said. */
  members: readonly { characterId: number; dismissed: boolean }[];
  labels: { include: string; remove: string };
}) {
  const { apply } = useRosterOptimism();
  const planned = usePlannedCount(members);
  const ids = members.map((member) => member.characterId);
  const allIn = planned === members.length;
  const title = `${name} · ${allIn ? labels.remove : labels.include}`;

  return (
    <form
      action={async () => {
        apply({ ids, dismissed: allIn });
        await (allIn ? dismissRoster(ids) : restoreRoster(ids));
      }}
    >
      <button
        type="submit"
        aria-pressed={allIn}
        aria-label={title}
        title={title}
        className={buttonVariants({ variant: allIn ? 'default' : 'outline', size: 'xs', className: 'gap-1.5 text-2xs' })}
      >
        <Users size={11} aria-hidden />
        {name}
        <span className={`tabular font-mono ${allIn ? '' : 'text-muted'}`}>{planned}/{members.length}</span>
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
