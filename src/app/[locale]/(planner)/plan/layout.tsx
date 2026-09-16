import { notFound } from 'next/navigation';

import { SectionTabs } from '@/components/section-tabs';
import { isLocale } from '@/lib/data/locales';

/**
 * What to do next, in three views of one calculation: the day's domains, the
 * whole material backlog behind them, and the queue of gear moves that need no
 * farming at all.
 */
export default async function PlanLayout({ children, params }: LayoutProps<'/[locale]/plan'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-medium">Plan</h1>
      <SectionTabs
        tabs={[
          { href: `/${locale}/plan`, label: 'Hoy', hint: 'Los dominios que rotan hoy' },
          { href: `/${locale}/plan/farmeo`, label: 'Qué farmear', hint: 'Todos los materiales' },
          { href: `/${locale}/plan/mejoras`, label: 'Qué mejorar', hint: 'La cola de cambios' },
        ]}
      />
      {children}
    </div>
  );
}
