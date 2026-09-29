import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isLocale } from '@/lib/data/locales';

import { PlanTabs } from './plan-tabs';

/**
 * What to do next, in two views: what is missing — a day's rotation or the
 * whole backlog, picked with the `range` filter — and what the bag already
 * pays for, levelled without farming anything.
 */
export default async function PlanLayout({ children, params }: LayoutProps<'/[locale]/plan'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('plan');
  const nav = await getTranslations('nav');

  return (
    <div className="space-y-6">
      <h1 className="page-title">{nav('plan')}</h1>
      <PlanTabs
        tabs={[
          { href: `/${locale}/plan`, label: t('farmTab'), hint: t('farmHint') },
          { href: `/${locale}/plan/ready`, label: t('readyTab'), hint: t('readyHint') },
          { href: `/${locale}/plan/invest`, label: t('investTab'), hint: t('investHint') },
        ]}
      />
      {children}
    </div>
  );
}
