import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readTeams } from '@/lib/player/teams';
import { farmingPlan } from '@/lib/rules/assemble';
import type { Need } from '@/lib/rules/materials';

import { FilterBar } from '../filter-bar';
import { DAY_LABEL, REASON_LABEL, href, loadFilters } from '../filters';
import { farmingFilter, resolveScope } from '../scope';

export const dynamic = 'force-dynamic';

/**
 * What is left to farm, in full.
 *
 * The day tab says which domains to open tonight; this one says how much is
 * behind them and who is waiting, which is the number that decides whether a
 * target is worth keeping. Demand is the gap between where a character is and
 * where their build says they should be, so it is empty until somebody says.
 */
export default async function FarmingPage({
  params, searchParams,
}: PageProps<'/[locale]/plan/farmeo'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const filters = await loadFilters(searchParams);
  const catalog = await getCatalog(locale);
  const db = getDb();
  const teams = await readTeams(db);

  const { characterIds } = resolveScope(teams, filters);
  const { schedule, sources, roster } = await farmingPlan(
    catalog, db, farmingFilter(filters, characterIds),
  );

  const name = (materialId: number) =>
    catalog.materials.get(materialId)?.name ?? `#${materialId}`;

  const NeedRow = ({ need }: { need: Need }) => (
    <li className="flex flex-wrap items-center gap-x-3 border-b border-edge/40 px-3 py-1.5 text-xs last:border-b-0">
      <GameIcon
        filename={catalog.materials.get(need.materialId)?.icon}
        kind="material"
        className="h-6 w-6"
        sizes="24px"
      />
      <span className="min-w-0 flex-1 truncate">{name(need.materialId)}</span>
      <span className="font-mono">
        faltan <span className="text-accent">{need.short.toLocaleString(locale)}</span>
      </span>
      <span className="font-mono text-muted">
        tienes {need.owned.toLocaleString(locale)} de {need.needed.toLocaleString(locale)}
      </span>
      <span className="font-mono text-[0.65rem] text-muted">
        {need.by
          .map((entry) =>
            `${catalog.characters.get(entry.characterId)?.name ?? entry.characterId}` +
            ` ${REASON_LABEL[entry.reason]} ×${entry.count}` +
            (entry.assumed ? '?' : ''))
          .join(' · ')}
      </span>
    </li>
  );

  return (
    <div className="space-y-8">
      <FilterBar
        base={`/${locale}/plan/farmeo`}
        filters={filters}
        catalog={catalog}
        teams={teams}
        characters={roster}
        showDays={false}
      />

      <p className="font-mono text-xs text-muted">
        {sources} build{sources === 1 ? '' : 's'} con objetivo de nivel ·{' '}
        {schedule.domains.length} dominios · {schedule.anytime.length} sin horario
      </p>

      {sources === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          Ninguna build dice a dónde quiere llegar todavía. La demanda es la diferencia
          entre dónde está un personaje y dónde debería estar, así que hasta que una build
          fije nivel o talentos objetivo no hay nada que planificar.{' '}
          <Link href={`/${locale}/characters`} className="underline hover:text-accent">
            Empieza por una ficha
          </Link>
          , o usa{' '}
          <Link
            href={href(`/${locale}/plan/farmeo`, filters, { sinmeta: true })}
            className="underline hover:text-accent"
          >
            incluir sin objetivo
          </Link>
          .
        </p>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
              Por dominio
            </h2>
            <div className="space-y-3">
              {schedule.domains.map((plan) => (
                <div key={plan.domain} className="rounded border border-edge bg-surface">
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
                    {plan.needs.map((need) => <NeedRow key={need.materialId} need={need} />)}
                  </ul>
                </div>
              ))}
            </div>
          </section>

          {schedule.anytime.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted">
                Sin horario
              </h2>
              <p className="mb-2 max-w-prose text-sm text-muted">
                Jefes, especialidades locales, drops de enemigos y Mora. Cuestión de
                cantidad, no de qué día es.
              </p>
              <ul className="rounded border border-edge bg-surface">
                {schedule.anytime.map((need) => <NeedRow key={need.materialId} need={need} />)}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
