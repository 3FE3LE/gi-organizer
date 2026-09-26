import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, ViewTransition } from 'react';

import { GameIcon } from '@/components/game-icon';
import { SectionTabs } from '@/components/section-tabs';
import { PanelsSkeleton, Skeleton } from '@/components/skeleton';
import { StickyDock } from '@/components/sticky-dock';
import { type Catalog } from '@/lib/data/catalog';
import { isLocale, type Locale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { readRegion } from '@/lib/player/region';
import { isDraft, readTeams, type Team } from '@/lib/player/teams';
import { accountAgenda, farmingPlan } from '@/lib/rules/assemble';
import { gameWeekday } from '@/lib/rules/game-day';
import { getAccountCatalog } from '@/lib/player/traveler';
import {
  charactersIn,
  domainsByKind,
  type DomainPlan,
  type Need,
  type Weekday,
} from '@/lib/rules/materials';

import { groupAnytime, type AnytimeGroup } from './anytime';
import { FilterBar } from './filter-bar';
import { href, loadFilters, type Filters } from './filters';
import { MaterialRow } from './material-row';
import { RosterPanel, summarizeRoster } from './roster-panel';
import { RosterSheet } from './roster-sheet';
import { farmingFilter, resolveScope } from './scope';
import { TodayCard } from './today-card';

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

  const catalog = await getAccountCatalog(locale);
  const db = getDb();
  // The draft is named where it is shown; see `isDraft`.
  const reserveLabel = (await getTranslations('teams'))('reserveTeam');
  const teams = (await readTeams(db)).map((team) =>
    isDraft(team) ? { ...team, name: reserveLabel } : team);

  // Today on the player's own server, where the rotation turns at 04:00 and
  // not at midnight — and never on the machine's UTC clock, which showed
  // tomorrow's domains to anybody farming in the evening west of Greenwich.
  const region = await readRegion(db);
  const today = gameWeekday(new Date(), region);
  const filters = await loadFilters(searchParams, today);

  const { characterIds } = resolveScope(teams, filters);
  const base = `/${locale}/plan`;

  // Started here and awaited where each piece is drawn: the plan feeds the
  // day card, the roster trigger in the dock and the list, and one scan of
  // the account is enough for all three. Neither is awaited by the page
  // itself, so the shell streams before either is known.
  const plan = farmingPlan(catalog, db, farmingFilter(filters, characterIds));
  const agenda = accountAgenda(catalog, db);

  /*
   * The filter bar is a pure function of the URL and the catalog; the plan
   * behind it is a scan of every target the account holds. Streaming the
   * second one means the controls are on screen — and clickable — while it
   * runs, instead of the whole page waiting on the slowest thing on it.
   *
   * Keyed by the filters so that changing one re-shows the fallback rather
   * than leaving the previous answer up, which reads as "nothing happened".
   */
  return (
    <div className="space-y-6">
      <TodayCard
        plan={plan}
        agenda={agenda}
        base={base}
        catalog={catalog}
        filters={filters}
        locale={locale}
        region={region}
        today={today}
      />

      {/* Docked like the roster's grouping and the artifact filters: the day
          is changed from halfway down a backlog as often as from the top. */}
      <StickyDock>
        <FilterBar
          base={base}
          filters={filters}
          catalog={catalog}
          teams={teams}
          region={region}
          roster={
            // Not keyed by the filters: a navigation keeps the last count on
            // screen until the new one arrives, rather than blinking it out.
            <Suspense fallback={<Skeleton className="h-8 w-16 rounded-xl" />}>
              <DockedRoster base={base} catalog={catalog} filters={filters} plan={plan} teams={teams} />
            </Suspense>
          }
        />
      </StickyDock>

      {/*
        * The skeleton hands over to the plan rather than being replaced by it:
        * the placeholder fades down and out, the answer fades up and in. The
        * timings are asymmetric on purpose — see `globals.css`.
        */}
      <Suspense
        key={href(base, filters)}
        fallback={
          <ViewTransition exit="fade-out" default="none">
            <div className="space-y-4">
              <Skeleton className="h-8 w-52" />
              <PanelsSkeleton count={4} height="h-28" />
            </div>
          </ViewTransition>
        }
      >
        <ViewTransition enter="fade-in" default="none">
          <PlanContent
            base={base}
            catalog={catalog}
            plan={plan}
            filters={filters}
            locale={locale}
            today={today}
          />
        </ViewTransition>
      </Suspense>
    </div>
  );
}

type Plan = Awaited<ReturnType<typeof farmingPlan>>;

/**
 * Who the plan is for, as the trigger that opens the list.
 *
 * It lives in the dock rather than beside the list's heading, so narrowing to
 * one face or dismissing somebody is in reach from anywhere down the page.
 */
async function DockedRoster({
  base, catalog, filters, plan, teams,
}: {
  base: string; catalog: Catalog; filters: Filters; plan: Promise<Plan>; teams: Team[];
}) {
  const { roster } = await plan;
  const summary = summarizeRoster(roster, teams, filters);

  return (
    <RosterSheet
      total={summary.total}
      planned={summary.planned}
      teamName={summary.teamName}
      charsCount={filters.chars.length}
      clearCharsHref={filters.chars.length > 0 ? href(base, filters, { chars: [] }) : null}
    >
      <RosterPanel base={base} catalog={catalog} filters={filters} roster={roster} teams={teams} />
    </RosterSheet>
  );
}

/** Everything that needs the plan itself, which is the expensive half. */
async function PlanContent({
  base,
  catalog,
  plan,
  filters,
  locale,
  today,
}: {
  base: string;
  catalog: Catalog;
  plan: Promise<Plan>;
  filters: Filters;
  locale: Locale;
  today: Weekday;
}) {
  const { schedule, sources, roster } = await plan;
  // An empty account: the day card is walking them through the first import,
  // and a zero-count heading over "nobody has a target" would argue with it.
  if (roster.length === 0) return null;

  const { talent, weapon } = domainsByKind(schedule, filters.day);
  const showing = filters.view === 'weapon' ? weapon : talent;
  const t = await getTranslations('plan');
  const weekdayLabel = await getTranslations('common.weekday');

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {/* The day, and only the day. The active team was named three times
            on this screen: the filled chip in the filter bar, the roster
            trigger that explains why the count is scoped, and here. The
            chip is the control and the trigger earns its copy by
            explaining a number; a heading that repeats the filter above it
            earns nothing. */}
        <h2 className="text-sm">
          {filters.range === 'day'
            ? (filters.day === today
              ? t('today')
              : t('otherDay', { day: weekdayLabel(filters.day) }))
            : t('allBacklogHeading')}
        </h2>
        <p className="font-mono text-xs text-muted">
          {filters.range === 'day'
            ? t('sourcesCountDay', {
                count: sources,
                domains: talent.length + weapon.length,
                anytime: schedule.anytime.length,
              })
            : t('sourcesCountAll', {
                count: sources,
                domains: schedule.domains.length,
                anytime: schedule.anytime.length,
              })}
        </p>
      </div>

      {sources === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          {t('noTargetsMessage')}{' '}
          <Link href={`/${locale}/characters`} className="underline hover:text-accent">
            {t('fixTargetLink')}
          </Link>
          , {t('costToLevelAllPrefix')}{' '}
          <Link href={href(base, filters, { assume: true })} className="underline hover:text-accent">
            {t('assumeToggle')}
          </Link>
          .
        </p>
      ) : filters.range === 'day' ? (
        <>
          {/* One route with a `view` parameter, so the strip is told which tab
              is current rather than reading it off the path. */}
          <SectionTabs
            tabs={([
              ['talent', t('talentTab'), talent.length],
              ['weapon', t('weaponTab'), weapon.length],
            ] as const).map(([view, label, count]) => ({
              href: href(base, filters, { view }),
              label,
              badge: count,
              active: filters.view === view,
            }))}
          />

          {showing.length === 0 ? (
            <p className="text-sm text-muted">
              {t('noDomainsMessage', {
                kind: filters.view === 'weapon' ? t('forjaWord') : t('maestriaWord'),
                day: filters.day === today
                  ? t('todaySuffix')
                  : t('daySuffix', { day: weekdayLabel(filters.day) }),
              })}
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
            {t('collectionHeading')}
          </h2>
          <p className="mb-3 max-w-prose text-xs text-muted">
            {t('collectionHint')}
          </p>
          <div className="space-y-2">
            {groupAnytime(schedule.anytime, (id) => catalog.materials.get(id), t('unsortedLabel')).map((group) => (
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
  const t = await getTranslations('plan');
  // Lowest tier first, which is the order the domain itself lists them in.
  const needs = [...plan.needs].sort((a, b) => a.materialId - b.materialId);
  const waiting = charactersIn([plan]);

  return (
    <section className="card">
      <p className="flex flex-wrap items-baseline gap-x-3 border-b border-edge px-3 py-2">
        <span className="flex-1 text-sm">{plan.label}</span>
        <span className="font-mono text-xs text-muted">
          {t('missing', { count: plan.short.toLocaleString(locale) })}
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
              <span className="tabular absolute -bottom-1 right-0 rounded bg-surface-2 px-1 font-mono text-2xs text-accent">
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
                  title={t('waitingTitle', {
                    name: character?.name ?? entry.characterId,
                    count: entry.count,
                    assumedSuffix: assumed ? t('assumedTargetSuffix') : '',
                  })}
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
async function FullDomainCard({
  plan, catalog, locale,
}: {
  plan: DomainPlan; catalog: Catalog; locale: Locale;
}) {
  const t = await getTranslations('plan');
  const weekdayLabel = await getTranslations('common.weekday');

  return (
    <section className="card">
      <p className="flex flex-wrap items-baseline gap-x-3 border-b border-edge px-3 py-2 text-sm">
        <span className="flex-1">{plan.label}</span>
        <span className="font-mono text-xs text-muted">
          {plan.days.map((day) => weekdayLabel(day)).join(' · ')}
        </span>
        <span className="font-mono text-xs">
          {t('missing', { count: plan.short.toLocaleString(locale) })}
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
  const t = await getTranslations('plan');

  return (
    <details className="card">
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
            <span className="self-center font-mono text-2xs text-muted">
              +{group.needs.length - 8}
            </span>
          )}
        </span>

        <span className="font-mono text-muted">
          {t('missingLabel')} <span className="text-accent">{group.short.toLocaleString(locale)}</span>
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
