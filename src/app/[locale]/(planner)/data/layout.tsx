import { notFound } from 'next/navigation';

import { SectionTabs } from '@/components/section-tabs';
import { isLocale } from '@/lib/data/locales';

/**
 * The account's own data: what it holds, how it gets in and out, and what has
 * been done to it. Three views that were three nav entries for no reason —
 * nobody reaches for "importar" without thinking about the inventory.
 */
export default async function DataLayout({ children, params }: LayoutProps<'/[locale]/data'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-medium">Datos</h1>
      <SectionTabs
        tabs={[
          { href: `/${locale}/data`, label: 'Inventario', hint: 'Lo que tienes' },
          {
            href: `/${locale}/data/import`,
            label: 'Entrada y salida',
            hint: 'Importar, exportar, copias y entrada manual',
          },
          { href: `/${locale}/data/history`, label: 'Historial', hint: 'Lo que has movido' },
        ]}
      />
      {children}
    </div>
  );
}
