import { notFound } from 'next/navigation';

import { getCatalog } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';

import { Backup } from '../backup';
import { ImportForm } from '../import-form';
import { ManualForms } from '../manual-forms';

/**
 * Everything that moves data in or out of the account, in the order it is
 * reached: the scan you import, the copy you keep, and the handful of things
 * no scan saw.
 */
export default async function DataIoPage({ params }: PageProps<'/[locale]/datos/importar'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const catalog = await getCatalog(locale);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Importar
        </h2>
        <div className="mt-4">
          <ImportForm />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Copias y salida
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Nada de esto es una puerta de un solo sentido.
        </p>
        <div className="mt-4">
          <Backup />
        </div>
      </section>

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-muted">
          Entrada manual
        </h2>
        <p className="mt-2 max-w-prose text-sm text-muted">
          Para lo que el escáner no vio. Los artefactos no se escriben a mano:
          vuelve a importar el GOOD.
        </p>
        <div className="mt-4">
          <ManualForms
            characters={catalog.index.charactersSorted.map((character) => ({
              id: character.id,
              name: character.name,
              detail: `${character.rarity}★ ${character.elementText} · ${character.weaponText}`,
            }))}
            weapons={catalog.index.weaponsSorted.map((weapon) => ({
              id: weapon.id,
              name: weapon.name,
              detail: `${weapon.rarity}★ ${weapon.weaponText}`,
            }))}
          />
        </div>
      </section>
    </div>
  );
}
