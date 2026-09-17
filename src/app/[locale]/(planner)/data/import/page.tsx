import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { isLocale } from '@/lib/data/locales';

import { Backup } from '../backup';
import { ImportForm } from '../import-form';

/**
 * Everything that moves data in or out of the account, in the order it is
 * reached: the scan you import and the copy you keep.
 *
 * Nothing is typed in here. What the account holds is what the last scan said
 * it holds — a second way to say it was a second answer that drifted from the
 * first and won until the next import overwrote it.
 */
export default async function DataIoPage({ params }: PageProps<'/[locale]/data/import'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const t = await getTranslations('data.importPage');

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('importHeading')}
        </h2>
        <div className="mt-4">
          <ImportForm />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          {t('backupHeading')}
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          {t('backupHint')}
        </p>
        <div className="mt-4">
          <Backup />
        </div>
      </section>
    </div>
  );
}
