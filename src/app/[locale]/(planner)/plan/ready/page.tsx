import { notFound } from 'next/navigation';

import { ReadyLists, ReadyTiles } from '@/components/ready-list';
import { StaleStock } from '@/components/stale-stock';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { getAccountCatalog } from '@/lib/player/traveler';
import { readyToLevel } from '@/lib/rules/ready';

export const dynamic = 'force-dynamic';

/**
 * What can be levelled tonight without farming anything.
 *
 * The other half of the plan: "Qué farmear" is what the bag is missing, this
 * is what it already holds enough for — levels and phases on EXP books and
 * ascension materials, talent levels, and weapons up to their last level — for
 * everyone in the plan. It replaced a queue of gear swaps that ranked pieces
 * by a score too coarse to trust, and asked the player to take gear off people
 * they were building.
 */
export default async function ReadyPage({ params }: PageProps<'/[locale]/plan/ready'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const db = getDb();
  const catalog = await getAccountCatalog(locale);
  const ready = await readyToLevel(catalog, db);

  return (
    <div className="space-y-6">
      <StaleStock catalog={catalog} locale={locale} />
      <ReadyTiles ready={ready} />
      <ReadyLists ready={ready} catalog={catalog} locale={locale} />
    </div>
  );
}
