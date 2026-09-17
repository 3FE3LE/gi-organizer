import Link from 'next/link';

import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';
import {
  GAME_REGIONS,
  REGION_LABEL,
  gameWeekStrip,
  type GameRegion,
} from '@/lib/rules/game-day';

import { chooseRegion } from './region-actions';
import {
  DAY_SHORT,
  REASONS,
  REASON_LABEL,
  type Filters,
  href,
  toggle,
} from './filters';

/** One filter value, on or off. */
function Chip({
  to, active, children, title,
}: {
  to: string; active: boolean; children: React.ReactNode; title?: string;
}) {
  return (
    <Link
      href={to}
      title={title}
      aria-current={active ? 'true' : undefined}
      className={`rounded border px-2 py-1 text-xs ${
        active
          ? 'border-accent bg-surface-2 text-accent'
          : 'border-edge text-muted hover:border-accent hover:text-text'
      }`}
    >
      {children}
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
export function FilterBar({
  base,
  filters,
  catalog,
  teams,
  region,
  showDays = true,
}: {
  base: string;
  filters: Filters;
  catalog: Catalog;
  teams: Team[];
  /** The game server whose clock the day strip is read against. */
  region: GameRegion;
  showDays?: boolean;
}) {
  return (
    <div className="space-y-3">
      {showDays && (
        <nav className="flex flex-wrap gap-1">
          {gameWeekStrip(new Date(), region).map(({ day, date }) => {
            const active = day === filters.dia;

            return (
              <Link
                key={day}
                href={href(base, filters, { dia: day })}
                aria-current={active ? 'page' : undefined}
                className={`w-12 rounded border px-1 py-1 text-center ${
                  active
                    ? 'border-accent bg-surface-2 text-accent'
                    : 'border-edge text-muted hover:border-accent hover:text-text'
                }`}
              >
                <span className="block font-mono text-[0.6rem] uppercase">{DAY_SHORT[day]}</span>
                <span className="block font-mono text-sm tabular">{date}</span>
              </Link>
            );
          })}
        </nav>
      )}

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-16 font-mono text-[0.65rem] uppercase text-muted">servidor</span>
        {GAME_REGIONS.map((entry) => (
          <form key={entry} action={chooseRegion.bind(null, entry)}>
            <button
              type="submit"
              aria-current={region === entry ? 'true' : undefined}
              title="El día rota con el reloj del servidor y cambia a las 04:00, no a medianoche"
              className={`rounded border px-2 py-1 text-xs ${
                region === entry
                  ? 'border-accent bg-surface-2 text-accent'
                  : 'border-edge text-muted hover:border-accent hover:text-text'
              }`}
            >
              {REGION_LABEL[entry]}
            </button>
          </form>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-16 font-mono text-[0.65rem] uppercase text-muted">equipo</span>
        <Chip to={href(base, filters, { equipo: null, pj: [] })} active={!filters.equipo}>
          todos
        </Chip>
        {teams.map((entry) => (
          <Chip
            key={entry.id}
            to={href(base, filters, { equipo: entry.id, pj: [] })}
            active={filters.equipo === entry.id}
            title={entry.slots
              .map((slot) => catalog.characters.get(slot.characterId)?.name ?? slot.characterId)
              .join(' · ')}
          >
            {entry.name}
          </Chip>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="w-16 font-mono text-[0.65rem] uppercase text-muted">tipo</span>
        <Chip to={href(base, filters, { tipo: [] })} active={filters.tipo.length === 0}>
          todo
        </Chip>
        {REASONS.map((reason) => (
          <Chip
            key={reason}
            to={href(base, filters, { tipo: toggle(filters.tipo, reason) })}
            active={filters.tipo.includes(reason)}
          >
            {REASON_LABEL[reason]}
          </Chip>
        ))}

        <span className="ml-2">
          <Chip
            to={href(base, filters, {
              sinmeta: !filters.sinmeta,
              pj: [],
            })}
            active={filters.sinmeta}
            title="Cuenta a los personajes sin objetivo como si fueran a 90 y talentos 9"
          >
            {filters.sinmeta ? '✓ ' : ''}incluir sin objetivo
          </Chip>
        </span>
      </div>
    </div>
  );
}
