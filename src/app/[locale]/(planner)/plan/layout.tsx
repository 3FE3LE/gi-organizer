import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isLocale } from '@/lib/data/locales';

import { PlanTabs } from './plan-tabs';

/**
 * What to do next, in two views: material demand — a day's rotation or the
 * whole backlog, picked with the `range` filter — and the queue of gear moves
 * that need no farming at all.
 */
export default async function PlanLayout({ children, params }: LayoutProps<'/[locale]/plan'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('plan');

  return (
    <div className="space-y-6">
      <h1 className="page-title">Plan</h1>
      <PlanTabs
        tabs={[
          { href: `/${locale}/plan`, label: t('farmTab'), hint: t('farmHint') },
          { href: `/${locale}/plan/upgrades`, label: t('upgradesTab'), hint: t('upgradesHint') },
        ]}
      />
      {children}
    </div>
  );
}
