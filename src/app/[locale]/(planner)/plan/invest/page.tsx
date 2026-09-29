import { notFound } from 'next/navigation';

import { InvestHelp, InvestLists } from '@/components/invest-list';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { getAccountCatalog } from '@/lib/player/traveler';
import { investPlan } from '@/lib/rules/invest-plan';

import { StrategyPicker } from './strategy-picker';

export const dynamic = 'force-dynamic';

/**
 * Where resin goes furthest.
 *
 * The plan says what is missing and "what you can level now" what the bag
 * already pays for; this is the decision between them — which step, for
 * which character, adds the most for the resin it still costs, weighted by
 * what that character is for in their team. The strategy on top decides
 * whether that is spread across the plan or poured into one team or one
 * character.
 */
export default async function InvestPage({ params }: PageProps<'/[locale]/plan/invest'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getAccountCatalog(locale);
  const plan = await investPlan(catalog, getDb());

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <StrategyPicker
          strategy={plan.strategy}
          teams={plan.teams}
          characters={plan.characters
            .map((id) => ({ id, name: catalog.characters.get(id)?.name ?? `#${id}` }))
            .sort((a, b) => a.name.localeCompare(b.name, locale))}
        />
        <InvestHelp />
      </div>
      <InvestLists plan={plan} catalog={catalog} locale={locale} />
    </div>
  );
}
