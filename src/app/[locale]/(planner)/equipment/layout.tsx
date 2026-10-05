import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

import { SectionTabs } from '@/components/section-tabs';
import { isLocale } from '@/lib/data/locales';

/**
 * What the account carries: the box of artifacts, and the weapons beside it.
 *
 * One section with two tabs rather than two entries in a nav bar that is
 * already five wide. Both answer "what do I have, and who has it" — the
 * artifacts by how their rolls landed, the weapons by what their passive does —
 * and each keeps its own filters in its own query string.
 */
export default async function EquipmentLayout({ children, params }: LayoutProps<'/[locale]/equipment'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('equipment');
  const nav = await getTranslations('nav');

  return (
    <div className="space-y-6">
      <h1 className="page-title">{nav('equipment')}</h1>
      <SectionTabs
        tabs={[
          { href: `/${locale}/equipment`, label: t('artifactsTab'), hint: t('artifactsHint') },
          { href: `/${locale}/equipment/weapons`, label: t('weaponsTab'), hint: t('weaponsHint') },
        ]}
      />
      {children}
    </div>
  );
}
