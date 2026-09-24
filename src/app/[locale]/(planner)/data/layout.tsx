import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { SectionTabs } from '@/components/section-tabs';
import { isLocale } from '@/lib/data/locales';

/**
 * The account's own data: what it holds, and how it gets in and out. Two views
 * that were two nav entries for no reason — nobody reaches for "importar"
 * without thinking about the inventory.
 */
export default async function DataLayout({ children, params }: LayoutProps<'/[locale]/data'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('data');

  return (
    <div className="space-y-6">
      <h1 className="page-title">{t('title')}</h1>
      <SectionTabs
        tabs={[
          { href: `/${locale}/data`, label: t('tabs.inventory.label'), hint: t('tabs.inventory.hint') },
          {
            href: `/${locale}/data/import`,
            label: t('tabs.importExport.label'),
            hint: t('tabs.importExport.hint'),
          },
        ]}
      />
      {children}
    </div>
  );
}
