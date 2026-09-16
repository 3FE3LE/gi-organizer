import Link from 'next/link';

import { GameIcon } from '@/components/game-icon';
import type { Catalog } from '@/lib/data/catalog';
import type { Team } from '@/lib/player/teams';

import {
  DAY_SHORT,
  REASONS,
  REASON_LABEL,
  type Filters,
  href,
  toggle,
  weekStrip,
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
 * Who and what the day is being planned for.
 *
 * Every control is a link, so the whole thing is static HTML and the state is
 * shareable. Narrowing to a team is the one that matters: "what does my
 * electro team still need" is a different question from "what does my account
 * still need", and only the first one is answerable in an evening.
 */
export function FilterBar({
  base,
  filters,
  catalog,
  teams,
  characters,
  showDays = true,
}: {
  base: string;
  filters: Filters;
  catalog: Catalog;
  teams: Team[];
  /** The roster, already narrowed to whoever can contribute demand. */
  characters: { characterId: number; hasTarget: boolean }[];
  showDays?: boolean;
}) {
  const team = teams.find((entry) => entry.id === filters.equipo) ?? null;
  const inTeam = new Set(team?.slots.map((slot) => slot.characterId) ?? []);

  const pickable = characters
    .filter((entry) => !team || inTeam.has(entry.characterId))
    .filter((entry) => entry.hasTarget || filters.sinmeta);

  return (
    <div className="space-y-3">
      {showDays && (
        <nav className="flex flex-wrap gap-1">
          {weekStrip().map(({ day, date }) => {
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

      {pickable.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="w-16 font-mono text-[0.65rem] uppercase text-muted">personaje</span>
          {pickable.map((entry) => {
            const character = catalog.characters.get(entry.characterId);
            const active = filters.pj.includes(entry.characterId);

            return (
              <Link
                key={entry.characterId}
                href={href(base, filters, {
                  pj: toggle(filters.pj, entry.characterId),
                })}
                title={character?.name ?? `#${entry.characterId}`}
                aria-current={active ? 'true' : undefined}
                className={`rounded border ${
                  active ? 'border-accent' : 'border-edge hover:border-accent'
                } ${filters.pj.length > 0 && !active ? 'opacity-40' : ''}`}
              >
                <GameIcon
                  filename={character?.icon}
                  kind="avatar"
                  alt={character?.name ?? ''}
                  className="h-7 w-7 rounded"
                  sizes="28px"
                />
              </Link>
            );
          })}
        </div>
      )}

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
