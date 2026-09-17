import { notFound } from 'next/navigation';

import { SectionTabs } from '@/components/section-tabs';
import { isLocale } from '@/lib/data/locales';

/**
 * What to do next, in two views: material demand — a day's rotation or the
 * whole backlog, picked with the `range` filter — and the queue of gear moves
 * that need no farming at all.
 */
export default async function PlanLayout({ children, params }: LayoutProps<'/[locale]/plan'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-medium">Plan</h1>
      <SectionTabs
        tabs={[
          { href: `/${locale}/plan`, label: 'Qué farmear', hint: 'Hoy, o todo el backlog' },
          { href: `/${locale}/plan/upgrades`, label: 'Qué mejorar', hint: 'La cola de cambios' },
        ]}
      />
      {children}
    </div>
  );
}
