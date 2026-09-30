import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { isLocale } from '@/lib/data/locales';

import { PlanTabs } from './plan-tabs';

/**
 * What to do next: what is missing — a day's rotation or everything left,
 * picked with the `range` filter — what the bag already pays for, where resin
 * goes furthest, and which artifact domain to run.
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
          { href: `/${locale}/plan/artifacts`, label: t('artifactsTab'), hint: t('artifactsHint') },
        ]}
      />
      {children}
    </div>
  );
}
