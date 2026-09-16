import Link from 'next/link';
import { notFound } from 'next/navigation';

import { getCatalog, statLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { getDb } from '@/lib/db/client';
import { filterArtifacts, readArtifacts } from '@/lib/player/artifacts';

import { ArtifactCard } from './artifact-card';
import { FilterPanel } from './filter-panel';
import { RankControls } from './filter-inputs';
import { CLEARED, href, loadArtifactFilters } from './filters';

export const dynamic = 'force-dynamic';

/**
 * The box, without a character in front of it.
 *
 * Everywhere else in this app an artifact is judged against a build — the same
 * circlet is mediocre for one and excellent for another, and that is the right
 * question when somebody is on screen. It is the wrong one here. A thousand
 * pieces are spread across forty characters, and nobody opens forty character
 * sheets to find out whether they own a crit circlet that rolled four times
 * into crit.
 *
 * So this page judges pieces the way the game rolls them: every substat lands
 * on one of four tiers, 70% to 100% of its maximum, and how often a piece hit
 * the top of that range is a fact about the piece that no build changes. Who is
 * wearing it is the other half — a piece is only free if nobody needs it.
 */
export default async function ArtifactsPage({
  params, searchParams,
}: PageProps<'/[locale]/artefactos'>) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();

  const filters = await loadArtifactFilters(searchParams);
  const catalog = await getCatalog(locale);
  const db = getDb();

  // One read and one pass. The whole box is a single round trip, and the
  // counts in the header are of the box rather than of the slice, so narrowing
  // it further in SQL would only cost a second trip to answer the same thing.
  const all = await readArtifacts(db);
  const shown = filterArtifacts(
    all,
    {
      slot: filters.slot,
      setId: filters.set,
      substat: filters.sub,
      mainProp: filters.main,
      held: filters.quien,
      perfectOnly: filters.perfectos,
      minEfficiency: filters.calidad === null ? null : filters.calidad / 100,
      minCritValue: filters.cv,
    },
    filters.orden,
    filters.escalador,
  );

  const base = `/${locale}/artefactos`;
  const perfect = all.filter((piece) => piece.quality.hasPerfect).length;

  // Only the sets the player actually owns: the catalogue has sixty-three and
  // a picker listing the ones you have none of is a picker that lies.
  const ownedSets = [...new Set(all.map((piece) => piece.setId))]
    .map((setId) => ({ setId, name: catalog.artifacts.get(setId)?.name ?? `#${setId}` }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  // Narrowed to the slot in view, because the mains a slot can carry are the
  // question: a flower is always HP, and offering the other nine is noise.
  const forSlot = filters.slot ? all.filter((piece) => piece.slot === filters.slot) : all;
  const ownedMains = [...new Set(forSlot.map((piece) => piece.mainProp))]
    .map((prop) => ({ prop, name: statLabel(catalog, prop) }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-lg font-medium">Artefactos</h1>
          <p className="font-mono text-xs text-muted">
            {shown.length === all.length
              ? `${all.length} piezas`
              : `${shown.length} de ${all.length} piezas`}
            {' · '}
            <span className="text-accent">{perfect}</span> con algún substat perfecto
          </p>
        </div>
        <RankControls />
      </header>

      <FilterPanel
        base={base}
        filters={filters}
        catalog={catalog}
        ownedSets={ownedSets}
        ownedMains={ownedMains}
      />

      {shown.length === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          Ninguna pieza pasa ese filtro.{' '}
          <Link href={href(base, filters, CLEARED)} className="underline hover:text-accent">
            Quítalos todos
          </Link>.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((piece) => (
            <ArtifactCard
              key={piece.instanceId}
              piece={piece}
              scaler={filters.escalador}
              catalog={catalog}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
