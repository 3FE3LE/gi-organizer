import { ChevronRight, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { DockFold } from '@/components/dock-fold';
import { HoverLabel } from '@/components/hint';
import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';
import {
  GAME_REGIONS,
  gameWeekStrip,
  type GameRegion,
} from '@/lib/rules/game-day';

import { chooseRegion } from './region-actions';
import {
  REASONS,
  type Filters,
  href,
  toggle,
} from './filters';

/**
 * One filter value, on or off.
 *
 * The explanations these carry — what "todo el backlog" costs, which slots a
 * team declared — used to be `title` attributes: a second of hover, nothing at
 * all on a phone, and unreachable from the keyboard. They are drawn labels now,
 * so the same sentence shows on focus as on hover.
 *
 * A chip is a link, and a link is where a tooltip cannot go: closing the bubble
 * is a React update, and an update landing in the navigation's transition makes
 * React skip it — the page cuts instead of crossfading. See
 * `components/hint.tsx`.
 */
function Chip({
  to, active, children, title,
}: {
  to: string; active: boolean; children: React.ReactNode; title?: string;
}) {
  return (
    <Link
      href={to}
      aria-current={active ? 'true' : undefined}
      data-active={active}
      className={`chip${title ? ' group relative' : ''}`}
    >
      {children}
      {title && <HoverLabel text={title} />}
    </Link>
  );
}

/**
 * What the day is being planned against.
 *
 * Every control here is a link, so the whole thing is static HTML and the
 * state is shareable. Narrowing to a team is the one that matters: "what does
 * my electro team still need" is a different question from "what does my
 * account still need", and only the first one is answerable in an evening.
 *
 * Who it is planned *for* is one list, and it is not this one — see
 * `RosterPanel`. This used to carry a second row of faces that filtered the
 * view while that panel decided who counted at all, which read as two lists of
 * the same roster disagreeing about what clicking a face meant.
 */
export async function FilterBar({
  base,
  filters,
  catalog,
  teams,
  region,
  roster,
}: {
  base: string;
  filters: Filters;
  catalog: Catalog;
  teams: Team[];
  /** The game server whose clock the day strip is read against. */
  region: GameRegion;
  /** Who the plan is for, as the trigger that opens that list. */
  roster?: React.ReactNode;
}) {
  const t = await getTranslations('plan');
  const reasonLabel = await getTranslations('common.reason');
  const weekdayShort = await getTranslations('common.weekdayShort');
  const regionLabel = await getTranslations('common.region');

  // Server, team and cost-type narrow the plan; the day strip is what nearly
  // every visit actually touches. Opened automatically whenever one of the
  // folded rows is off its default, so a shared link with a team or a reason
  // picked never hides the control that picked it.
  const moreOpen = filters.team !== null || filters.reason.length > 0 || !filters.assume;
  const team = teams.find((entry) => entry.id === filters.team);

  return (
    <div className="card flex flex-col p-4 transition-[padding] duration-200 group-data-[stuck]/dock:p-2">
      {/* The day strip is the view toggle: a day is either the one thing this
          is scoped to, or — tapped again — nothing, which is the whole
          backlog. A separate "por día"/"todo el backlog" pair said the same
          thing in a row of its own and doubled the number of controls that
          answer one question. Horizontal scroll is the fallback for a phone
          too narrow to fit all seven at once, not the expected way to read
          it — the strip stays one row rather than wrapping the last day or
          two beneath the first. */}
      <div className="flex items-center gap-1 sm:gap-3">
        <nav className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-0.5">
          {gameWeekStrip(new Date(), region).map(({ day, date }) => {
            const active = filters.range === 'day' && day === filters.day;

            return (
              <Link
                key={day}
                href={active
                  ? href(base, filters, { range: 'all' })
                  : href(base, filters, { range: 'day', day })}
                aria-current={active ? 'page' : undefined}
                data-active={active}
                className="chip w-9 shrink-0 flex-col gap-0 rounded-xl px-1 py-1.5 text-center sm:w-10"
              >
                <span className="block font-mono text-2xs uppercase">
                  {weekdayShort(day)}
                </span>
                <span className="block font-mono text-sm tabular">{date}</span>
              </Link>
            );
          })}
        </nav>
        {/* Beside the days rather than under them, so the dock stays one row. */}
        {roster && <div className="shrink-0">{roster}</div>}
      </div>

      {/* Docked, the folded rows give way to what they have picked: the day
          strip is what gets touched mid-list, and an open disclosure over the
          results would cover the thing being filtered. What stays is each
          choice that is off its default, one tap from undoing it — so the
          docked bar never hides why the list is narrower than it looks. */}
      {moreOpen && (
        <DockFold when="undocked" className="flex flex-wrap gap-1 pt-2">
          {team && (
            <Chip to={href(base, filters, { team: null, chars: [] })} active>
              {team.name} <X size={12} aria-hidden />
            </Chip>
          )}
          {filters.reason.map((reason) => (
            <Chip
              key={reason}
              to={href(base, filters, { reason: toggle(filters.reason, reason) })}
              active
            >
              {reasonLabel(reason)} <X size={12} aria-hidden />
            </Chip>
          ))}
          {!filters.assume && (
            <Chip to={href(base, filters, { assume: true, chars: [] })} active={false}>
              {t('assumeToggle')}
            </Chip>
          )}
        </DockFold>
      )}

      <DockFold when="docked" className="pt-3">
      <details open={moreOpen} className="group card">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-mono text-2xs uppercase text-muted hover:text-text">
          <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
          {t('moreFilters')}
        </summary>

        <div className="space-y-3 border-t border-edge px-3 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-16 font-mono text-2xs uppercase text-muted">
              {t('serverLabel')}
            </span>
            {GAME_REGIONS.map((entry) => (
              <form key={entry} action={chooseRegion.bind(null, entry)}>
                <button
                  type="submit"
                  aria-current={region === entry ? 'true' : undefined}
                  title={t('serverTitle')}
                  data-active={region === entry}
                  className="chip"
                >
                  {regionLabel(entry)}
                </button>
              </form>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-16 font-mono text-2xs uppercase text-muted">
              {t('teamLabel')}
            </span>
            <Chip to={href(base, filters, { team: null, chars: [] })} active={!filters.team}>
              {t('allTeams')}
            </Chip>
            {teams.map((entry) => (
              <Chip
                key={entry.id}
                to={href(base, filters, { team: entry.id, chars: [] })}
                active={filters.team === entry.id}
                title={entry.slots
                  .map((slot) => catalog.characters.get(slot.characterId)?.name ?? slot.characterId)
                  .join(' · ')}
              >
                {entry.name}
              </Chip>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="w-16 font-mono text-2xs uppercase text-muted">
              {t('reasonLabel')}
            </span>
            <Chip to={href(base, filters, { reason: [] })} active={filters.reason.length === 0}>
              {t('allReasons')}
            </Chip>
            {REASONS.map((reason) => (
              <Chip
                key={reason}
                to={href(base, filters, { reason: toggle(filters.reason, reason) })}
                active={filters.reason.includes(reason)}
              >
                {reasonLabel(reason)}
              </Chip>
            ))}

            <span className="ml-2">
              <Chip
                to={href(base, filters, {
                  assume: !filters.assume,
                  chars: [],
                })}
                active={filters.assume}
                title={t('assumeTitle')}
              >
                {filters.assume ? '✓ ' : ''}{t('assumeToggle')}
              </Chip>
            </span>
          </div>
        </div>
      </details>
      </DockFold>
    </div>
  );
}
