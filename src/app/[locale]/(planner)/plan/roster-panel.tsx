import Link from 'next/link';
import { RotateCcw, X } from 'lucide-react';

import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';

import { type Filters, href, toggle } from './filters';
import { dismissRoster, restoreRoster } from './roster-actions';

/**
 * How many of the roster are in the plan, narrowed to the active team.
 *
 * The same scoping `RosterPanel` does internally to decide who counts, pulled
 * out so the roster sheet's trigger can show the count without rendering the
 * panel itself — the panel needs the catalog to sort and label each face, the
 * trigger only needs how many.
 */
export function summarizeRoster(
  roster: { characterId: number; dismissed: boolean }[],
  teams: Team[],
  filters: Pick<Filters, 'team'>,
) {
  const team = teams.find((entry) => entry.id === filters.team) ?? null;
  const inTeam = new Set(team?.slots.map((slot) => slot.characterId) ?? []);
  const scoped = roster.filter((entry) => !team || inTeam.has(entry.characterId));

  return {
    teamName: team?.name ?? null,
    total: scoped.length,
    planned: scoped.filter((entry) => !entry.dismissed).length,
  };
}

/**
 * Who the plan is for — the whole question, in one list.
 *
 * There used to be two. A row of faces in the filter bar narrowed the view to
 * one character, and a separate panel of names decided who counted at all, so
 * the same roster appeared twice on one screen and a face meant something
 * different depending on which copy it was in. They are two verbs on one noun,
 * so they are one list with two controls per entry: the name filters, the ×
 * removes.
 *
 * The removal is the half that matters. With nothing written down the planner
 * assumes every owned character is headed for the cap, because sixty
 * characters with no stated target still have sixty characters' worth of
 * demand. That is the honest reading and it is also every material in the game
 * on the first screen, which nobody can act on. Everything is in by default and
 * the player says no — the opposite way round from asking them to opt sixty
 * characters in one at a time, which is the version nobody finishes.
 */
export function RosterPanel({
  base,
  catalog,
  filters,
  roster,
  teams,
}: {
  base: string;
  catalog: Catalog;
  filters: Filters;
  roster: { characterId: number; hasTarget: boolean; dismissed: boolean }[];
  teams: Team[];
}) {
  const team = teams.find((entry) => entry.id === filters.team) ?? null;
  const inTeam = new Set(team?.slots.map((slot) => slot.characterId) ?? []);

  const named = roster
    .filter((entry) => !team || inTeam.has(entry.characterId))
    .map((entry) => ({
      ...entry,
      name: catalog.characters.get(entry.characterId)?.name ?? `#${entry.characterId}`,
      icon: catalog.characters.get(entry.characterId)?.icon,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (named.length === 0) return null;

  const planned = named.filter((entry) => !entry.dismissed);
  const dismissed = named.filter((entry) => entry.dismissed);
  // Dismissed last: the list is read top-down as "who is being planned for",
  // and the refusals are the footnote to it.
  const shown = [...planned, ...dismissed];

  return (
    <section className="rounded-lg border border-edge bg-surface">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge px-3 py-2 text-xs">
        <span className="font-mono text-[0.65rem] uppercase text-muted">personajes</span>
        <span>
          <span className="text-accent">{planned.length}</span>
          <span className="text-muted"> de {named.length} en el plan</span>
        </span>
        {team && <span className="text-muted">· solo {team.name}</span>}
        {filters.chars.length > 0 && (
          <Link
            href={href(base, filters, { chars: [] })}
            className="text-muted underline hover:text-accent"
          >
            quitar el filtro ({filters.chars.length})
          </Link>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          <Bulk action={dismissRoster} disabled={planned.length === 0}>
            <X size={11} /> descartar todos
          </Bulk>
          <Bulk action={restoreRoster} disabled={dismissed.length === 0}>
            <RotateCcw size={11} /> restaurar todos
          </Bulk>
        </span>
      </header>

      <div className="space-y-3 px-3 py-3">
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          Sin un objetivo escrito, el plan asume que cada personaje va a nivel 90 con los
          talentos a 9. Toca un nombre para mirar solo su demanda; usa la × para descartarlo,
          y su demanda desaparece del total, no solo de la vista.
        </p>

        <ul className="flex flex-wrap gap-1.5">
          {shown.map((entry) => {
            const picked = filters.chars.includes(entry.characterId);
            // Somebody the plan is not counting has no demand to filter down
            // to, so their name is a label rather than a control.
            const filterable = !entry.dismissed && (entry.hasTarget || filters.assume);

            return (
              <li
                key={entry.characterId}
                className={`flex items-center overflow-hidden rounded border text-[0.7rem] ${
                  picked ? 'border-accent bg-surface-2' : 'border-edge'
                } ${entry.dismissed ? 'opacity-60' : ''} ${
                  filters.chars.length > 0 && !picked ? 'opacity-50' : ''
                }`}
              >
                <Face
                  entry={entry}
                  picked={picked}
                  to={filterable
                    ? href(base, filters, { chars: toggle(filters.chars, entry.characterId) })
                    : null}
                />

                <form
                  action={entry.dismissed
                    ? restoreRoster.bind(null, entry.characterId)
                    : dismissRoster.bind(null, entry.characterId)}
                >
                  <button
                    type="submit"
                    title={entry.dismissed ? 'Volver a incluirlo' : 'Descartarlo del plan'}
                    className={`flex h-7 w-6 items-center justify-center border-l text-muted ${
                      picked ? 'border-accent' : 'border-edge'
                    } ${entry.dismissed ? 'hover:text-accent' : 'hover:text-bad'}`}
                  >
                    {entry.dismissed ? <RotateCcw size={11} /> : <X size={11} />}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

type Entry = {
  characterId: number;
  name: string;
  icon: string | null | undefined;
  hasTarget: boolean;
  dismissed: boolean;
};

/**
 * The face and the name, which filter when there is something to filter.
 *
 * A link and a form button cannot nest, so the two verbs sit side by side
 * inside one chip rather than one inside the other.
 */
function Face({ entry, picked, to }: { entry: Entry; picked: boolean; to: string | null }) {
  const content = (
    <>
      <GameIcon
        filename={entry.icon}
        kind="avatar"
        alt=""
        className="h-6 w-6 rounded"
        sizes="24px"
      />
      <span className={entry.dismissed ? 'line-through' : ''}>{entry.name}</span>
      {/* A character with a target of their own was planned for on purpose, so
          the assumption is not what is driving them. */}
      {entry.hasTarget && !entry.dismissed && <span className="text-[0.55rem]">●</span>}
    </>
  );

  const className = 'flex items-center gap-1.5 py-0.5 pl-1 pr-2';

  if (!to) return <span className={`${className} text-muted`}>{content}</span>;

  return (
    <Link
      href={to}
      title={picked ? 'Dejar de mirar solo a este personaje' : 'Mirar solo su demanda'}
      aria-current={picked ? 'true' : undefined}
      className={`${className} ${picked ? 'text-accent' : 'hover:text-accent'}`}
    >
      {content}
    </Link>
  );
}

function Bulk({
  action,
  disabled,
  children,
}: {
  action: (characterId: number | null) => Promise<void>;
  disabled: boolean;
  children: React.ReactNode;
}) {
  return (
    <form action={action.bind(null, null)}>
      <button
        type="submit"
        disabled={disabled}
        className="flex items-center gap-1.5 rounded border border-edge px-2.5 py-1 font-mono text-[0.65rem] uppercase text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-40"
      >
        {children}
      </button>
    </form>
  );
}
