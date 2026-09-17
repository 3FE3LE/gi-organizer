import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog, type Catalog } from '@/lib/data/catalog';
import { isLocale, type Locale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readTeams } from '@/lib/player/teams';
import { farmingPlan } from '@/lib/rules/assemble';
import { charactersIn, domainsByKind, type DomainPlan, type Need } from '@/lib/rules/materials';

import { FilterBar } from './filter-bar';
import { DAY_LABEL, REASON_LABEL, href, loadFilters, todayName } from './filters';
import { RosterPanel } from './roster-panel';
import { farmingFilter, resolveScope } from './scope';

export const dynamic = 'force-dynamic';

/**
 * The day, at a glance.
 *
 * The other two tabs answer "what is left" and "what should I change"; this one
 * answers "what do I open tonight". So it is the day's domains and nothing
 * else: which ones rotate, what they drop, and who is waiting on them — the
 * per-material arithmetic stays one tab over, where it is the point.
 */
export default async function TodayPage({ params, searchParams }: PageProps<'/[locale]/plan'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const filters = await loadFilters(searchParams);
  const catalog = await getCatalog(locale);
  const db = getDb();
  const teams = await readTeams(db);

  const { team, characterIds } = resolveScope(teams, filters);
  const { schedule, sources, roster } = await farmingPlan(
    catalog, db, farmingFilter(filters, characterIds),
  );

  const { talent, weapon } = domainsByKind(schedule, filters.dia);
  const showing = filters.ver === 'arma' ? weapon : talent;
  const today = todayName();

  return (
    <div className="space-y-6">
      <FilterBar
        base={`/${locale}/plan`}
        filters={filters}
        catalog={catalog}
        teams={teams}
      />

      <RosterPanel
        base={`/${locale}/plan`}
        catalog={catalog}
        filters={filters}
        roster={roster}
        teams={teams}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-sm">
          {filters.dia === today ? 'Hoy' : 'El'} {DAY_LABEL[filters.dia]}
          {team && <span className="text-muted"> · {team.name}</span>}
        </h2>
        <p className="font-mono text-xs text-muted">
          {sources} con objetivo · {talent.length + weapon.length} dominio
          {talent.length + weapon.length === 1 ? '' : 's'} · {schedule.anytime.length} sin horario
        </p>
      </div>

      <nav className="flex flex-wrap gap-x-1 border-b border-edge">
        {([
          ['talento', 'Materiales de talento', talent.length],
          ['arma', 'Materiales de arma', weapon.length],
        ] as const).map(([view, label, count]) => (
          <Link
            key={view}
            href={href(`/${locale}/plan`, filters, { ver: view })}
            aria-current={filters.ver === view ? 'page' : undefined}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              filters.ver === view
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-text'
            }`}
          >
            {label} <span className="font-mono text-xs">{count}</span>
          </Link>
        ))}
      </nav>

      {sources === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          Nadie tiene objetivo todavía, así que no hay nada que farmear. La demanda es la
          diferencia entre dónde está un personaje y dónde debería estar.{' '}
          <Link href={`/${locale}/characters`} className="underline hover:text-accent">
            Fija nivel o talentos objetivo en una ficha
          </Link>
          , o mira qué costaría subirlos a todos con{' '}
          <Link
            href={href(`/${locale}/plan`, filters, { sinmeta: true })}
            className="underline hover:text-accent"
          >
            incluir sin objetivo
          </Link>
          .
        </p>
      ) : showing.length === 0 ? (
        <p className="text-sm text-muted">
          Ningún dominio de {filters.ver === 'arma' ? 'forja' : 'maestría'} que necesites rota
          {filters.dia === today ? ' hoy' : ` el ${DAY_LABEL[filters.dia]}`}.
        </p>
      ) : (
        <div className="space-y-3">
          {showing.map((plan) => (
            <DomainCard key={plan.domain} plan={plan} catalog={catalog} locale={locale} />
          ))}
        </div>
      )}

      {schedule.anytime.length > 0 && (
        <section>
          <h2 className="mb-1 text-sm font-medium uppercase tracking-wide text-muted">
            Recolección general
          </h2>
          <p className="mb-2 max-w-prose text-xs text-muted">
            Jefes, especialidades locales, drops de enemigos y Mora. Sin horario: es cuestión
            de cantidad, no de qué día es.
          </p>
          <ul className="flex flex-wrap gap-2">
            {schedule.anytime.map((need) => (
              <li
                key={need.materialId}
                title={`${catalog.materials.get(need.materialId)?.name ?? need.materialId} — ${
                  need.by.map((entry) =>
                    `${catalog.characters.get(entry.characterId)?.name ?? entry.characterId}` +
                    ` ${REASON_LABEL[entry.reason]} ×${entry.count}`).join(' · ')
                }`}
                className="flex items-center gap-2 rounded border border-edge bg-surface px-2 py-1"
              >
                <GameIcon
                  filename={catalog.materials.get(need.materialId)?.icon}
                  kind="material"
                  className="h-6 w-6"
                  sizes="24px"
                />
                <span className="max-w-32 truncate text-xs">
                  {catalog.materials.get(need.materialId)?.name ?? `#${need.materialId}`}
                </span>
                <span className="font-mono text-xs text-accent tabular">
                  {need.short.toLocaleString(locale)}
                </span>
              </li>
            ))}
          </ul>
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
 * many times you go in.
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
