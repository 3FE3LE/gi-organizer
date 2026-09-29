import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';
import { talentBookDays } from '@/lib/rules/card-progress';
import type { Weekday } from '@/lib/rules/materials';

import { type Filters, href } from './filters';
import { PlannedCount, RosterBulk, RosterFace, RosterTeam } from './roster-chip';

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
 * With nothing written down the planner assumes every owned character is
 * headed for the cap, because sixty characters with no stated target still
 * have sixty characters' worth of demand. That is the honest reading and it is
 * also every material in the game on the first screen, which nobody can act
 * on. Everything is in by default and the player says no — the opposite way
 * round from asking them to opt sixty characters in one at a time, which is
 * the version nobody finishes.
 *
 * The roster is a wall of faces: lit is in the plan, greyed is out, a click
 * swaps the two. The teams underneath are the usual way back in — the players
 * someone fields are the ones worth farming for — so each is one click that
 * brings its members back without touching anybody else.
 *
 * Alphabetical and never re-sorted by state: a face that jumped to the other
 * end of the list when clicked would be a face the next click misses.
 */
export async function RosterPanel({
  base,
  catalog,
  filters,
  roster,
  teams,
  today,
}: {
  base: string;
  catalog: Catalog;
  filters: Filters;
  roster: { characterId: number; hasTarget: boolean; dismissed: boolean; talentsShort: boolean }[];
  teams: Team[];
  /** The game server's day, for the ring on whoever's books drop today. */
  today: Weekday;
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
      // Same reading as the "hoy" badge on a roster card: a book they still
      // need drops from a domain open today.
      booksToday: entry.talentsShort && talentBookDays(
        catalog.characters.get(entry.characterId)?.talentCosts ?? {},
        (id) => catalog.materials.get(id)?.days,
      ).has(today),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  if (named.length === 0) return null;

  // Only what the roster holds: a team slot can name somebody not yet owned,
  // and there is nothing to plan for them.
  const byId = new Map(roster.map((entry) => [entry.characterId, entry]));
  const squads = teams
    .map((entry) => ({
      id: entry.id,
      name: entry.name,
      members: [...new Set(entry.slots.map((slot) => slot.characterId))]
        .map((id) => byId.get(id))
        .filter((member) => member !== undefined)
        .map(({ characterId, dismissed }) => ({ characterId, dismissed })),
    }))
    .filter((entry) => entry.members.length > 0);

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
          <RosterBulk dismiss entries={named}>{t('dismissAll')}</RosterBulk>
          <RosterBulk dismiss={false} entries={named}>{t('restoreAll')}</RosterBulk>
        </span>
      </header>

      <div className="space-y-4 px-3 py-3">
        <p className="max-w-prose text-xs leading-relaxed text-muted">
          {t('explainer')}
        </p>

        <ul className="flex flex-wrap gap-2">
          {named.map((entry) => (
            <RosterFace
              key={entry.characterId}
              characterId={entry.characterId}
              name={entry.name}
              icon={
                <GameIcon
                  filename={entry.icon}
                  kind="avatar"
                  alt=""
                  className="h-10 w-10 rounded-full border border-edge bg-surface-2"
                  sizes="40px"
                />
              }
              hasTarget={entry.hasTarget}
              booksToday={entry.booksToday}
              dismissed={entry.dismissed}
              labels={{
                restore: t('restoreTitle'),
                dismiss: t('dismissTitle'),
                target: t('ownTargetTitle'),
                today: t('booksTodayTitle'),
              }}
            />
          ))}
        </ul>

        {/* What the marks mean, said once under the faces rather than
            only in each tooltip: a phone has no hover to find them with. */}
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 font-mono text-2xs text-muted">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-full ring-2 ring-good ring-offset-1 ring-offset-surface" />
            {t('legendToday')}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-2 w-2 rounded-full bg-accent" />
            {t('legendTarget')}
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-3 rounded-full border border-edge bg-muted/40" />
            {t('legendOut')}
          </li>
        </ul>

        {squads.length > 0 && (
          <div className="space-y-2 border-t border-edge pt-3">
            <p className="font-mono text-2xs uppercase text-muted">{t('planTeamLabel')}</p>
            <div className="flex flex-wrap gap-2">
              {squads.map((squad) => (
                <RosterTeam key={squad.id} name={squad.name} members={squad.members} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
