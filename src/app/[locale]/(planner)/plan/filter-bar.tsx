import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

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
}: {
  base: string;
  filters: Filters;
  catalog: Catalog;
  teams: Team[];
  /** The game server whose clock the day strip is read against. */
  region: GameRegion;
}) {
  const t = await getTranslations('plan');
  const reasonLabel = await getTranslations('common.reason');
  const weekdayShort = await getTranslations('common.weekdayShort');
  const regionLabel = await getTranslations('common.region');

  return (
    <div className="card space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-16 font-mono text-2xs uppercase text-muted">
          {t('viewLabel')}
        </span>
        <Chip
          to={href(base, filters, { range: 'day' })}
          active={filters.range === 'day'}
          title={t('byDayTitle')}
        >
          {t('byDayChip')}
        </Chip>
        <Chip
          to={href(base, filters, { range: 'all' })}
          active={filters.range === 'all'}
          title={t('allBacklogTitle')}
        >
          {t('allBacklogChip')}
        </Chip>
      </div>

      {filters.range === 'day' && (
        <nav className="flex flex-wrap gap-1">
          {gameWeekStrip(new Date(), region).map(({ day, date }) => {
            const active = day === filters.day;

            return (
              <Link
                key={day}
                href={href(base, filters, { day })}
                aria-current={active ? 'page' : undefined}
                data-active={active}
                className="chip w-12 flex-col gap-0 rounded-xl px-1 py-1.5 text-center"
              >
                <span className="block font-mono text-2xs uppercase">
                  {weekdayShort(day)}
                </span>
                <span className="block font-mono text-sm tabular">{date}</span>
              </Link>
            );
          })}
        </nav>
      )}

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
  );
}
