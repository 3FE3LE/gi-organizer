import { SlidersHorizontal } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { ActiveFilters } from '@/components/active-filters';
import { DockFold } from '@/components/dock-fold';
import { Segment, Segments } from '@/components/segmented-links';
import { FoldMark } from '@/components/fold-mark';
import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';
import { gameWeekStrip, type GameRegion } from '@/lib/rules/game-day';

import {
  REASONS,
  type Filters,
  href,
  toggle,
} from './filters';

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
  const common = await getTranslations('common');
  const reasonLabel = await getTranslations('common.reason');
  const weekdayShort = await getTranslations('common.weekdayShort');

  // Team and cost-type narrow the plan; the day strip is what nearly every
  // visit actually touches. The server is not here: it is a fact about the
  // account, kept in the settings, not a way of looking at the plan. Opened automatically whenever one of the
  // folded rows is off its default, so a shared link with a team or a reason
  // picked never hides the control that picked it.
  const folded = (filters.team !== null ? 1 : 0) + filters.reason.length;
  const moreOpen = folded > 0;
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
        <DockFold when="undocked" className="pt-2">
          <ActiveFilters
            items={[
              ...(team ? [{ key: 'team', label: team.name, to: href(base, filters, { team: null, chars: [] }) }] : []),
              ...filters.reason.map((reason) => ({
                key: `reason-${reason}`,
                label: reasonLabel(reason),
                to: href(base, filters, { reason: toggle(filters.reason, reason) }),
              })),
            ]}
            clear={href(base, filters, { team: null, reason: [], chars: [] })}
            labels={{
              title: common('activeFilters'),
              clear: common('clearFilters'),
              remove: (name) => common('removeFilter', { name }),
            }}
          />
        </DockFold>
      )}

      <DockFold when="docked" className="pt-3">
      <details open={moreOpen} className="group/fold card">
        {/* The artifacts' "more filters", word for word: an icon, the name, how
            many of the folded filters are on, and the fold mark. */}
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-text transition-colors hover:bg-surface-2/60">
          <SlidersHorizontal size={14} aria-hidden className="text-muted" />
          <span className="font-medium">{t('moreFilters')}</span>
          {folded > 0 && (
            <span className="tabular rounded-full bg-accent px-1.5 font-mono text-2xs leading-4 text-on-accent">
              {folded}
            </span>
          )}
          <FoldMark className="ml-auto" />
        </summary>

        {/* One question per group, its label above its values, and the
            groups side by side where the card is wide enough. */}
        <div className="flex flex-wrap gap-x-6 gap-y-3 border-t border-edge px-3 py-3">
          <Segments label={t('teamLabel')}>
            <Segment to={href(base, filters, { team: null, chars: [] })} active={!filters.team}>
              {t('allTeams')}
            </Segment>
            {teams.map((entry) => (
              <Segment
                key={entry.id}
                to={href(base, filters, { team: entry.id, chars: [] })}
                active={filters.team === entry.id}
                title={entry.slots
                  .map((slot) => catalog.characters.get(slot.characterId)?.name ?? slot.characterId)
                  .join(' · ')}
              >
                {entry.name}
              </Segment>
            ))}
          </Segments>

          <Segments label={t('reasonLabel')}>
            <Segment to={href(base, filters, { reason: [] })} active={filters.reason.length === 0}>
              {t('allReasons')}
            </Segment>
            {REASONS.map((reason) => (
              <Segment
                key={reason}
                to={href(base, filters, { reason: toggle(filters.reason, reason) })}
                active={filters.reason.includes(reason)}
              >
                {reasonLabel(reason)}
              </Segment>
            ))}
          </Segments>
        </div>
      </details>
      </DockFold>
    </div>
  );
}
