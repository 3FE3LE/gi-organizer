import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog, type Catalog } from '@/lib/data/catalog';
import { isLocale, type Locale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readRegion } from '@/lib/player/region';
import { readTeams } from '@/lib/player/teams';
import { farmingPlan } from '@/lib/rules/assemble';
import { gameWeekday } from '@/lib/rules/game-day';
import { charactersIn, domainsByKind, type DomainPlan, type Need } from '@/lib/rules/materials';

import { groupAnytime, type AnytimeGroup } from './anytime';
import { FilterBar } from './filter-bar';
import { DAY_LABEL, href, loadFilters } from './filters';
import { MaterialRow } from './material-row';
import { RosterPanel, summarizeRoster } from './roster-panel';
import { RosterSheet } from './roster-sheet';
import { farmingFilter, resolveScope } from './scope';

export const dynamic = 'force-dynamic';

/**
 * The plan, in one of two grains: a day's rotation, or the whole backlog
 * behind it.
 *
 * These used to be two routes that answered nearly the same question twice —
 * "what do I open tonight" and "what is left, in full" — sharing the same
 * filter bar and roster underneath. The `range` filter is the one thing that
 * actually differs, so it is one page with a switch rather than two pages
 * that disagree about layout. "What should I change" stays its own tab: that
 * question is about gear, not material demand, and answering it needs neither
 * a day nor a backlog.
 */
export default async function PlanPage({ params, searchParams }: PageProps<'/[locale]/plan'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);
  const db = getDb();
  const teams = await readTeams(db);

  // Today on the player's own server, where the rotation turns at 04:00 and
  // not at midnight — and never on the machine's UTC clock, which showed
  // tomorrow's domains to anybody farming in the evening west of Greenwich.
  const region = await readRegion(db);
  const today = gameWeekday(new Date(), region);
  const filters = await loadFilters(searchParams, today);

  const { team, characterIds } = resolveScope(teams, filters);
  const { schedule, sources, roster } = await farmingPlan(
    catalog, db, farmingFilter(filters, characterIds),
  );

  const { talent, weapon } = domainsByKind(schedule, filters.day);
  const showing = filters.view === 'weapon' ? weapon : talent;
  const base = `/${locale}/plan`;
  const rosterSummary = summarizeRoster(roster, teams, filters);

  return (
    <div className="space-y-6">
      <FilterBar base={base} filters={filters} catalog={catalog} teams={teams} region={region} />

      <RosterSheet
        total={rosterSummary.total}
        planned={rosterSummary.planned}
        teamName={rosterSummary.teamName}
        charsCount={filters.chars.length}
        clearCharsHref={filters.chars.length > 0 ? href(base, filters, { chars: [] }) : null}
      >
        <RosterPanel base={base} catalog={catalog} filters={filters} roster={roster} teams={teams} />
      </RosterSheet>

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm">
          {filters.range === 'day'
            ? <>{filters.day === today ? 'Hoy' : 'El'} {DAY_LABEL[filters.day]}</>
            : 'Todo el backlog'}
          {team && <span className="text-muted"> · {team.name}</span>}
        </h2>
        <p className="font-mono text-xs text-muted">
          {filters.range === 'day'
            ? <>
                {sources} con objetivo · {talent.length + weapon.length} dominio
                {talent.length + weapon.length === 1 ? '' : 's'} · {schedule.anytime.length} sin horario
              </>
            : <>
                {sources} build{sources === 1 ? '' : 's'} con objetivo de nivel ·{' '}
                {schedule.domains.length} dominio{schedule.domains.length === 1 ? '' : 's'} ·{' '}
                {schedule.anytime.length} sin horario
              </>}
        </p>
      </div>

      {sources === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          Nadie tiene objetivo todavía, así que no hay nada que farmear. La demanda es la
          diferencia entre dónde está un personaje y dónde debería estar.{' '}
          <Link href={`/${locale}/characters`} className="underline hover:text-accent">
            Fija nivel o talentos objetivo en una ficha
          </Link>
          , o mira qué costaría subirlos a todos con{' '}
          <Link href={href(base, filters, { assume: true })} className="underline hover:text-accent">
            incluir sin objetivo
          </Link>
          .
        </p>
      ) : filters.range === 'day' ? (
        <>
          <nav className="flex flex-wrap gap-x-1 border-b border-edge">
            {([
              ['talent', 'Materiales de talento', talent.length],
              ['weapon', 'Materiales de arma', weapon.length],
            ] as const).map(([view, label, count]) => (
              <Link
                key={view}
                href={href(base, filters, { view })}
                aria-current={filters.view === view ? 'page' : undefined}
                className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                  filters.view === view
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-text'
                }`}
              >
                {label} <span className="font-mono text-xs">{count}</span>
              </Link>
            ))}
          </nav>

          {showing.length === 0 ? (
            <p className="text-sm text-muted">
              Ningún dominio de {filters.view === 'weapon' ? 'forja' : 'maestría'} que necesites rota
              {filters.day === today ? ' hoy' : ` el ${DAY_LABEL[filters.day]}`}.
            </p>
          ) : (
            <div className="space-y-3">
              {showing.map((plan) => (
                <DomainCard key={plan.domain} plan={plan} catalog={catalog} locale={locale} />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="space-y-3">
          {schedule.domains.map((plan) => (
            <FullDomainCard key={plan.domain} plan={plan} catalog={catalog} locale={locale} />
          ))}
        </div>
      )}

      {schedule.anytime.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
            Recolección general
          </h2>
          <p className="mb-3 max-w-prose text-xs text-muted">
            Jefes, especialidades locales, drops de enemigos y Mora. Sin horario: es cuestión
            de cantidad, no de qué día es. Cada montón se abre para ver cuánto falta y quién
            lo espera.
          </p>
          <div className="space-y-2">
            {groupAnytime(schedule.anytime, (id) => catalog.materials.get(id)).map((group) => (
              <AnytimePile key={group.label} group={group} catalog={catalog} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * One domain: what it drops, and who is waiting on it.
 *
 * The materials are a row of icons rather than rows of numbers on purpose —
 * the tiers of one book are the same run, and the quantity only decides how
 * many times you go in. Used in the day view, where the domain is already
 * narrowed to one day's worth and the per-material arithmetic is one click
 * away in the backlog view instead.
 */
async function DomainCard({
  plan, catalog, locale,
}: {
  plan: DomainPlan; catalog: Catalog; locale: Locale;
}) {
  // Lowest tier first, which is the order the domain itself lists them in.
  const needs = [...plan.needs].sort((a, b) => a.materialId - b.materialId);
  const waiting = charactersIn([plan]);

  return (
    <section className="rounded border border-edge bg-surface">
      <p className="flex flex-wrap items-baseline gap-x-3 border-b border-edge px-3 py-2">
        <span className="flex-1 text-sm">{plan.label}</span>
        <span className="font-mono text-xs text-muted">
          faltan {plan.short.toLocaleString(locale)}
        </span>
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-3 py-3">
        <ul className="flex gap-2">
          {needs.map((need) => (
            <li key={need.materialId} className="relative">
              <GameIcon
                filename={catalog.materials.get(need.materialId)?.icon}
                kind="material"
                alt={catalog.materials.get(need.materialId)?.name ?? ''}
                className="h-11 w-11"
                sizes="44px"
              />
              <span className="tabular absolute -bottom-1 right-0 rounded bg-surface-2 px-1 font-mono text-[0.6rem] text-accent">
                {need.short.toLocaleString(locale)}
              </span>
            </li>
          ))}
        </ul>

        <ul className="flex flex-wrap gap-2">
          {waiting.map((entry) => {
            const character = catalog.characters.get(entry.characterId);
            const assumed = isAssumed(needs, entry.characterId);

            return (
              <li key={entry.characterId}>
                <Link
                  href={`/${locale}/build/${entry.characterId}`}
                  title={`${character?.name ?? entry.characterId} — faltan ${entry.count}` +
                    (assumed ? ' (objetivo asumido: 90 y talentos 9)' : '')}
                  className={`block rounded border ${
                    assumed ? 'border-dashed border-edge opacity-60' : 'border-edge'
                  } hover:border-accent`}
                >
                  <GameIcon
                    filename={character?.icon}
                    kind="avatar"
                    alt={character?.name ?? ''}
                    className="h-11 w-11 rounded"
                    sizes="44px"
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Whether every row for this character came from a target nobody stated. */
function isAssumed(needs: Need[], characterId: number) {
  const rows = needs.flatMap((need) =>
    need.by.filter((entry) => entry.characterId === characterId));

  return rows.length > 0 && rows.every((entry) => entry.assumed);
}

/**
 * One domain, in full: which days it rotates, and the per-material arithmetic
 * behind it. Used in the backlog view, where the point is the number rather
 * than the glance.
 */
function FullDomainCard({
  plan, catalog, locale,
}: {
  plan: DomainPlan; catalog: Catalog; locale: Locale;
}) {
  return (
    <section className="rounded border border-edge bg-surface">
      <p className="flex flex-wrap items-baseline gap-x-3 border-b border-edge px-3 py-2 text-sm">
        <span className="flex-1">{plan.label}</span>
        <span className="font-mono text-xs text-muted">
          {plan.days.map((day) => DAY_LABEL[day]).join(' · ')}
        </span>
        <span className="font-mono text-xs">
          faltan {plan.short.toLocaleString(locale)}
        </span>
      </p>
      <ul>
        {plan.needs.map((need) => (
          <MaterialRow key={need.materialId} need={need} catalog={catalog} locale={locale} />
        ))}
      </ul>
    </section>
  );
}

/**
 * One pile of ungated materials: what it is, and what it is short.
 *
 * Closed it is a line — the pile's name, its faces, the total missing — which
 * is everything needed to decide whether tonight is a boss night or an
 * arrowhead night. Open it is the arithmetic: per material, how much is
 * missing against how much is owned, and who is waiting on it.
 *
 * Collapsed by default, because in the day view the answer this section
 * exists for is which domains rotate today, and in the backlog view the bag
 * is still the thing you check after the domains — same reason, either way.
 */
async function AnytimePile({
  group, catalog, locale,
}: {
  group: AnytimeGroup; catalog: Catalog; locale: Locale;
}) {
  return (
    <details className="rounded border border-edge bg-surface">
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-xs">
        <span className="min-w-0 flex-1 truncate">{group.label}</span>

        {/* What is in the pile, without opening it. */}
        <span className="flex flex-wrap gap-1">
          {group.needs.slice(0, 8).map((need) => (
            <GameIcon
              key={need.materialId}
              filename={catalog.materials.get(need.materialId)?.icon}
              kind="material"
              alt={catalog.materials.get(need.materialId)?.name ?? ''}
              className="h-6 w-6"
              sizes="24px"
            />
          ))}
          {group.needs.length > 8 && (
            <span className="self-center font-mono text-[0.65rem] text-muted">
              +{group.needs.length - 8}
            </span>
          )}
        </span>

        <span className="font-mono text-muted">
          faltan <span className="text-accent">{group.short.toLocaleString(locale)}</span>
        </span>
      </summary>

      <ul className="border-t border-edge">
        {group.needs.map((need) => (
          <MaterialRow key={need.materialId} need={need} catalog={catalog} locale={locale} />
        ))}
      </ul>
    </details>
  );
}
