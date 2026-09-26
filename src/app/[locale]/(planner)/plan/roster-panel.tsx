import { RotateCcw, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';

import { type Filters, href, toggle } from './filters';
import { PlannedCount, RosterBulk, RosterChip } from './roster-chip';

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
    /** Who is counted, for the trigger to follow a click before the server answers. */
    entries: scoped.map(({ characterId, dismissed }) => ({ characterId, dismissed })),
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
export async function RosterPanel({
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
  const t = await getTranslations('plan');
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
    <section className="card">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-edge px-3 py-2 text-xs">
        <span className="font-mono text-2xs uppercase text-muted">
          {t('charactersLabel')}
        </span>
        <PlannedCount entries={named} suffix={t('inPlanSuffix', { total: named.length })} />
        {team && <span className="text-muted">{t('onlyTeam', { team: team.name })}</span>}
        {filters.chars.length > 0 && (
          <Link
            href={href(base, filters, { chars: [] })}
            className="text-muted underline hover:text-accent"
          >
            {t('removeFilter', { count: filters.chars.length })}
          </Link>
        )}
        <span className="ml-auto flex flex-wrap gap-2">
          <RosterBulk dismiss entries={named}>
            <X size={11} /> {t('dismissAll')}
          </RosterBulk>
          <RosterBulk dismiss={false} entries={named}>
            <RotateCcw size={11} /> {t('restoreAll')}
          </RosterBulk>
        </span>
      </header>

      <div className="space-y-3 px-3 py-3">
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          {t('explainer')}
        </p>

        <ul className="flex flex-wrap gap-1.5">
          {shown.map((entry) => (
            <RosterChip
              key={entry.characterId}
              characterId={entry.characterId}
              name={entry.name}
              icon={
                <GameIcon
                  filename={entry.icon}
                  kind="avatar"
                  alt=""
                  className="h-6 w-6 rounded"
                  sizes="24px"
                />
              }
              hasTarget={entry.hasTarget}
              dismissed={entry.dismissed}
              picked={filters.chars.includes(entry.characterId)}
              dimmed={filters.chars.length > 0}
              assume={filters.assume}
              filterHref={href(base, filters, { chars: toggle(filters.chars, entry.characterId) })}
              labels={{
                restore: t('restoreTitle'),
                dismiss: t('dismissTitle'),
                filter: t('filterTitle'),
                stopFilter: t('stopFilterTitle'),
              }}
            />
          ))}
        </ul>
      </div>
    </section>
  );
}
