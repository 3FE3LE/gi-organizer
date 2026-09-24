import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCatalog, statLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { CHOOSABLE_SLOTS } from '@/lib/rules/piece-score';

import { ownedArtifactCardData } from './artifact-card';
import { ArtifactList } from './artifact-list';
import { FilterPanel } from './filter-panel';
import { StickyDock } from './sticky-dock';
import { CLEARED, href, loadArtifactFilters } from './filters';
import { PAGE_SIZE, queryArtifacts } from './query';

export const dynamic = 'force-dynamic';

/**
 * The box, without a character in front of it.
 *
 * Everywhere else in this app an artifact is judged against a build — the same
 * circlet is mediocre for one and excellent for another, and that is the right
 * question when somebody is on screen. It is the wrong one here. A thousand
 * pieces are spread across forty characters, and nobody opens forty character
 * sheets to find out whether they own a crit circlet that rolled four times
 * into crit.
 *
 * So this page judges pieces the way the game rolls them: every substat lands
 * on one of four tiers, 70% to 100% of its maximum, and how often a piece hit
 * the top of that range is a fact about the piece that no build changes. Who is
 * wearing it is the other half — a piece is only free if nobody needs it.
 */
export default async function ArtifactsPage({
  params, searchParams,
}: PageProps<'/[locale]/artifacts'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const t = await getTranslations('artifacts');
  const filters = await loadArtifactFilters(searchParams);
  const catalog = await getCatalog(locale);
  const db = getDb();

  const { all, shown } = await queryArtifacts(filters, db);
  const first = await Promise.all(shown.slice(0, PAGE_SIZE).map(async (piece) => ({
    id: piece.instanceId,
    data: await ownedArtifactCardData(piece, filters.scaler, catalog, locale),
  })));

  const base = `/${locale}/artifacts`;
  const perfect = all.filter((piece) => piece.quality.hasPerfect).length;

  const setCounts = new Map<number, number>();
  for (const piece of all) setCounts.set(piece.setId, (setCounts.get(piece.setId) ?? 0) + 1);

  /*
   * Main stats to choose from, which only exist once a slot is chosen.
   *
   * A flower is always flat HP and a plume always flat ATK — the game decided,
   * and a picker offering one option is asking a question with one answer. The
   * other three slots are where the main stat is a decision, and even there it
   * is a decision per slot: a goblet's list and a circlet's have nothing in
   * common, so the union of all of them was mostly options that cannot apply.
   */
  const choosable = filters.slot !== null && CHOOSABLE_SLOTS.includes(filters.slot);
  const ownedMains = choosable
    ? [...new Set(all.filter((piece) => piece.slot === filters.slot)
        .map((piece) => piece.mainProp))]
      .map((prop) => ({ prop, name: statLabel(catalog, prop) }))
      .sort((a, b) => a.name.localeCompare(b.name, locale))
    : [];

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="page-title">{t('title')}</h1>
          <p className="font-mono text-xs text-muted">
            {shown.length === all.length
              ? t('countAll', { count: all.length })
              : t('countFiltered', { shown: shown.length, total: all.length })}
            {' · '}
            <span className="text-accent">{perfect}</span> {t('perfectSuffix')}
          </p>
        </div>
      </header>

      <StickyDock>
        <FilterPanel
          base={base}
          filters={filters}
          catalog={catalog}
          setCounts={setCounts}
          locale={locale}
          ownedMains={ownedMains}
        />
      </StickyDock>

      {shown.length === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          {t('empty')}{' '}
          <Link href={href(base, filters, CLEARED)} className="underline hover:text-accent">
            {t('clearAllLink')}
          </Link>.
        </p>
      ) : (
        /* Narrower cards, so the box reads as a box: the stats are drawn rather
           than named, which took a third off the width each one needs and put
           two more pieces on every row. */
        <ul className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          <ArtifactList
            key={href(base, filters)}
            initial={first}
            total={shown.length}
            locale={locale}
            search={href('', filters).replace(/^\?/, '')}
          />
        </ul>
      )}
    </div>
  );
}
