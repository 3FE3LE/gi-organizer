import { ArrowRight, Download, Swords, Target } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Suspense } from 'react';

import { GameIcon } from '@/components/game-icon';
import { Skeleton } from '@/components/skeleton';
import type { Catalog } from '@/lib/data/catalog';
import type { Locale } from '@/lib/data/locales';
import type { Team } from '@/lib/player/teams';
import type { AgendaItem } from '@/lib/rules/agenda';
import { inTeam, summarizeAgenda } from '@/lib/rules/agenda';
import type { farmingPlan } from '@/lib/rules/assemble';
import { gameDate, nextGameReset, type GameRegion } from '@/lib/rules/game-day';
import { charactersIn, domainsOn, type Weekday } from '@/lib/rules/materials';

import { href, type Filters } from './filters';
import { ResetCountdown } from './reset-countdown';

type Plan = Awaited<ReturnType<typeof farmingPlan>>;

/** Past this many faces the row is a crowd, and the count says the rest. */
const FACES = 10;

/**
 * The first thing the app says after signing in: what today is for.
 *
 * The filter bar under it asks which day to look at; this answers the one
 * day every visit starts from, whichever day the list below is showing. It
 * holds only what the rest of the page does not: how long the rotation has
 * left, who is waiting on today's domains across both kinds, and whether
 * there is gear to move before any resin is spent — a count from the other
 * tab, which nobody would otherwise open to find out.
 *
 * The day and the countdown need nothing but the clock, so they paint with
 * the shell. The faces wait on the plan and the upgrade count on the agenda,
 * each behind its own boundary, so the slower one never holds up the other.
 */
export async function TodayCard({
  plan,
  agenda,
  base,
  catalog,
  filters,
  locale,
  region,
  team,
  today,
}: {
  plan: Promise<Plan>;
  agenda: Promise<AgendaItem[]>;
  base: string;
  catalog: Catalog;
  filters: Filters;
  locale: Locale;
  region: GameRegion;
  /** The team the page is narrowed to, which the upgrade count follows. */
  team: Team | null;
  today: Weekday;
}) {
  const t = await getTranslations('plan');
  const weekdayLabel = await getTranslations('common.weekday');
  const now = new Date();

  return (
    <section className="card space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="font-display text-xl capitalize">
          {t('todayTitle', { day: weekdayLabel(today), date: gameDate(now, region).day })}
        </h2>
        <ResetCountdown at={nextGameReset(now, region).toISOString()} serverNow={now.toISOString()} />
      </div>

      <Suspense fallback={<Skeleton className="h-9 w-72" />}>
        <TodayBody
          plan={plan}
          agenda={agenda}
          base={base}
          catalog={catalog}
          filters={filters}
          locale={locale}
          team={team}
          today={today}
        />
      </Suspense>
    </section>
  );
}

async function TodayBody({
  plan,
  agenda,
  base,
  catalog,
  filters,
  locale,
  team,
  today,
}: {
  plan: Promise<Plan>;
  agenda: Promise<AgendaItem[]>;
  base: string;
  catalog: Catalog;
  filters: Filters;
  locale: Locale;
  team: Team | null;
  today: Weekday;
}) {
  const t = await getTranslations('plan');
  const { schedule, roster } = await plan;

  if (roster.length === 0) return <Onboarding locale={locale} />;

  const domains = domainsOn(schedule, today);
  const waiting = charactersIn(domains);
  const todayHref = href(base, filters, { range: 'day', day: today });

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      {waiting.length === 0 ? (
        <p className="text-sm text-muted">{t('noneToday')}</p>
      ) : (
        <div className="flex min-w-0 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <span className="font-mono text-2xs uppercase text-muted">{t('waitingToday')}</span>
          <div className="flex items-center gap-3">
            <ul className="flex -space-x-2">
              {waiting.slice(0, FACES).map((entry) => {
                const character = catalog.characters.get(entry.characterId);

                return (
                  <li key={entry.characterId}>
                    <Link
                      href={`/${locale}/build/${entry.characterId}`}
                      title={character?.name}
                      className="relative block rounded-full ring-2 ring-surface transition-transform hover:z-10 hover:-translate-y-0.5"
                    >
                      <GameIcon
                        filename={character?.icon}
                        kind="avatar"
                        alt={character?.name ?? ''}
                        className="h-9 w-9 rounded-full bg-surface-2"
                        sizes="36px"
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
            {waiting.length > FACES && (
              <span className="font-mono text-2xs text-muted">+{waiting.length - FACES}</span>
            )}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
        {/* A way to today's list, so not drawn while today's list is it. */}
        {domains.length > 0 && !(filters.range === 'day' && filters.day === today) && (
          <Link href={todayHref} className="chip">
            {t('domainsToday', { count: domains.length })}
          </Link>
        )}
        <Suspense fallback={<Skeleton className="h-7 w-44 rounded-full" />}>
          <UpgradesChip agenda={agenda} locale={locale} team={team} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Gear that can move tonight without farming, one tap from the queue.
 *
 * Counted for the team the page is narrowed to, like everything else on it,
 * and the link carries the team along so the queue it opens says the same
 * number.
 */
async function UpgradesChip({
  agenda, locale, team,
}: {
  agenda: Promise<AgendaItem[]>; locale: Locale; team: Team | null;
}) {
  const t = await getTranslations('plan');
  const { actionableNow } = summarizeAgenda(inTeam(await agenda, team));
  if (actionableNow === 0) return null;

  const queue = `/${locale}/plan/upgrades${team ? `?team=${encodeURIComponent(team.id)}` : ''}`;

  return (
    <Link href={queue} data-active className="chip gap-1">
      {t('upgradesReady', { count: actionableNow })}
      <ArrowRight size={12} aria-hidden />
    </Link>
  );
}

/**
 * An account with nobody on it, which is what everybody's first visit is.
 *
 * The plan below has nothing to say until there is a roster, so this says
 * what to do about that instead, in the order it has to happen.
 */
async function Onboarding({ locale }: { locale: Locale }) {
  const t = await getTranslations('plan');
  const steps = [
    { href: `/${locale}/data/import`, icon: Download, title: t('stepImportTitle'), body: t('stepImportBody') },
    { href: `/${locale}/characters`, icon: Target, title: t('stepTargetsTitle'), body: t('stepTargetsBody') },
    { href: `/${locale}/teams`, icon: Swords, title: t('stepTeamsTitle'), body: t('stepTeamsBody') },
  ];

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm">{t('onboardingTitle')}</p>
        <p className="text-xs text-muted">{t('onboardingIntro')}</p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => (
          <li key={step.href}>
            <Link href={step.href} className="card-2 card-link flex h-full items-start gap-3 p-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-edge font-mono text-xs text-accent">
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5 text-sm">
                  <step.icon size={14} aria-hidden />
                  {step.title}
                </span>
                <span className="block text-xs text-muted">{step.body}</span>
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}
