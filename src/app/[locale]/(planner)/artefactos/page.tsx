import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { GameIcon } from '@/components/game-icon';
import { getCatalog, propLabel } from '@/lib/data/catalog';
import { isLocale } from '@/lib/data/locales';
import { formatPropValue } from '@/lib/data/props';
import { getDb } from '@/lib/db/client';
import { filterArtifacts, readArtifacts, type OwnedArtifact } from '@/lib/player/artifacts';
import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import { ROLLABLE, TIERS, type CritRating, type RollQuality } from '@/lib/rules/rolls';
import { mainStatValue } from '@/lib/rules/stats';

import {
  CRIT_FILTERS,
  HELD,
  HELD_LABELS,
  SLOT_LABELS,
  SORTS,
  SORT_LABELS,
  TIER_FILTERS,
  href,
  loadArtifactFilters,
  type ArtifactFilters,
} from './filters';

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

  const all = await readArtifacts(db);
  const shown = filterArtifacts(
    all,
    {
      slot: filters.slot,
      setId: filters.set,
      substat: filters.sub,
      mainProp: filters.main,
      rarity: filters.rareza,
      held: filters.quien,
      perfectOnly: filters.perfectos,
      minEfficiency: filters.calidad === null ? null : filters.calidad / 100,
      minCritValue: filters.cv,
    },
    filters.orden,
  );

  const base = `/${locale}/artefactos`;
  const perfect = all.filter((piece) => piece.quality.hasPerfect).length;

  // Only the sets the player actually owns: the catalogue has sixty-three and
  // a filter listing the ones you have none of is a filter that lies.
  const ownedSets = [...new Set(all.map((piece) => piece.setId))]
    .map((setId) => ({ setId, name: catalog.artifacts.get(setId)?.name ?? `#${setId}` }))
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h1 className="text-lg font-medium">Artefactos</h1>
        <p className="font-mono text-xs text-muted">
          {shown.length === all.length
            ? `${all.length} piezas`
            : `${shown.length} de ${all.length} piezas`}
          {' · '}
          <span className="text-accent">{perfect}</span> con algún substat perfecto
        </p>
      </header>

      <Filters
        base={base}
        filters={filters}
        catalog={catalog}
        ownedSets={ownedSets}
      />

      {shown.length === 0 ? (
        <p className="max-w-prose text-sm text-muted">
          Ninguna pieza pasa ese filtro.{' '}
          <Link href={base} className="underline hover:text-accent">Quítalos todos</Link>.
        </p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((piece) => (
            <ArtifactRow
              key={piece.instanceId}
              piece={piece}
              catalog={catalog}
              locale={locale}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

type PageCatalog = Awaited<ReturnType<typeof getCatalog>>;

/** Loud only where it earns it: a piece nobody would keep stays grey. */
const CRIT_TONE: Record<CritRating, string> = {
  ninguno: 'text-muted',
  bajo: 'text-muted',
  normal: 'text-text',
  bueno: 'text-good',
  'muy bueno': 'text-good',
  excelente: 'text-accent',
};

function Filters({
  base,
  filters,
  catalog,
  ownedSets,
}: {
  base: string;
  filters: ArtifactFilters;
  catalog: PageCatalog;
  ownedSets: { setId: number; name: string }[];
}) {
  return (
    <div className="space-y-2 rounded-lg border border-edge bg-surface p-3">
      <Row label="pieza">
        <Chip to={href(base, filters, { slot: null })} active={!filters.slot}>todas</Chip>
        {ARTIFACT_SLOTS.map((slot) => (
          <Chip
            key={slot}
            to={href(base, filters, { slot })}
            active={filters.slot === slot}
          >
            {SLOT_LABELS[slot] ?? slot}
          </Chip>
        ))}
      </Row>

      <Row label="quién">
        <Chip to={href(base, filters, { quien: null })} active={!filters.quien}>todos</Chip>
        {HELD.map((held) => (
          <Chip
            key={held}
            to={href(base, filters, { quien: held })}
            active={filters.quien === held}
          >
            {HELD_LABELS[held]}
          </Chip>
        ))}
      </Row>

      <Row label="substat">
        <Chip to={href(base, filters, { sub: null })} active={!filters.sub}>cualquiera</Chip>
        {ROLLABLE.map((prop) => (
          <Chip key={prop} to={href(base, filters, { sub: prop })} active={filters.sub === prop}>
            {propLabel(catalog, prop)}
          </Chip>
        ))}
      </Row>

      <Row label="calidad">
        <Chip to={href(base, filters, { calidad: null })} active={filters.calidad === null}>
          cualquiera
        </Chip>
        {TIER_FILTERS.map((fraction) => {
          const percent = Math.round(fraction * 100);
          return (
            <Chip
              key={percent}
              to={href(base, filters, { calidad: percent })}
              active={filters.calidad === percent}
            >
              {TIERS[TIER_FILTERS.indexOf(fraction) + 1]} o mejor
            </Chip>
          );
        })}
        <Chip
          to={href(base, filters, { perfectos: !filters.perfectos })}
          active={filters.perfectos}
        >
          <Sparkles size={11} className="inline" /> con substat perfecto
        </Chip>
      </Row>

      {/* Its own row rather than a chip among the quality ones: crit value
          answers a narrower question — what a crit build wants — and reading it
          as "the" quality of a piece is how a mastery artifact ends up in the
          bin. */}
      <Row label="crit value">
        <Chip to={href(base, filters, { cv: null })} active={filters.cv === null}>
          cualquiera
        </Chip>
        {CRIT_FILTERS.map((value) => (
          <Chip
            key={value}
            to={href(base, filters, { cv: value })}
            active={filters.cv === value}
          >
            {value}+
          </Chip>
        ))}
      </Row>

      <Row label="set">
        <Chip to={href(base, filters, { set: null })} active={filters.set === null}>todos</Chip>
        {ownedSets.map((set) => (
          <Chip
            key={set.setId}
            to={href(base, filters, { set: set.setId })}
            active={filters.set === set.setId}
          >
            {set.name}
          </Chip>
        ))}
      </Row>

      <Row label="orden">
        {SORTS.map((sort) => (
          <Chip
            key={sort}
            to={href(base, filters, { orden: sort })}
            active={filters.orden === sort}
          >
            {SORT_LABELS[sort]}
          </Chip>
        ))}
      </Row>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span className="w-16 shrink-0 font-mono text-[0.6rem] uppercase text-muted">{label}</span>
      {children}
    </div>
  );
}

function Chip({
  to,
  active,
  children,
}: {
  to: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      aria-current={active ? 'true' : undefined}
      className={`rounded border px-2 py-0.5 text-[0.7rem] transition-colors ${
        active
          ? 'border-accent bg-surface-2 text-accent'
          : 'border-edge text-muted hover:border-accent hover:text-text'
      }`}
    >
      {children}
    </Link>
  );
}

/**
 * One piece, read as the dice left it.
 *
 * Each substat shows how many times it rolled and how well those rolls landed,
 * because "crit rate 10.9%" says nothing on its own: three maximum rolls and
 * four minimum ones land within a hair of each other, and only one of them is
 * a piece worth keeping.
 */
function ArtifactRow({
  piece,
  catalog,
  locale,
}: {
  piece: OwnedArtifact;
  catalog: PageCatalog;
  locale: string;
}) {
  const set = catalog.artifacts.get(piece.setId);
  const holder = piece.holderId === null
    ? null
    : catalog.characters.get(piece.holderId)?.name ?? `#${piece.holderId}`;

  return (
    <li className="flex min-w-0 flex-col rounded-lg border border-edge bg-surface p-3">
      <div className="flex items-start gap-2">
        <GameIcon
          filename={set?.pieces[piece.slot]?.icon}
          kind="relic"
          className="h-10 w-10 shrink-0"
          sizes="40px"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs" title={set?.name}>{set?.name ?? `#${piece.setId}`}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[0.65rem]">
            <span className="rounded bg-ink px-1 text-muted">+{piece.level}</span>
            <span className="text-accent">{'★'.repeat(piece.rarity)}</span>
            <span className="text-muted">{SLOT_LABELS[piece.slot] ?? piece.slot}</span>
          </p>
        </div>
        {piece.quality.hasPerfect && (
          <Sparkles size={13} className="shrink-0 text-accent" aria-label="substat perfecto" />
        )}
      </div>

      <p className="mt-2 flex items-baseline justify-between gap-2 border-b border-edge pb-1.5">
        <span className="truncate text-xs text-muted">{propLabel(catalog, piece.mainProp)}</span>
        <span className="tabular font-mono text-sm">
          {formatPropValue(
            piece.mainProp,
            mainStatValue(piece.mainProp, piece.rarity, piece.level),
            'percent',
            locale,
          )}
        </span>
      </p>

      <ul className="mt-1.5 space-y-1">
        {piece.substats.map((substat) => {
          const quality = piece.quality.substats.find((entry) => entry.prop === substat.prop);

          return (
            <li key={substat.prop} className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[0.7rem] text-muted">
                {propLabel(catalog, substat.prop)}
              </span>
              <span className="flex shrink-0 items-baseline gap-1.5 font-mono text-[0.65rem]">
                <span className="tabular">
                  +{formatPropValue(substat.prop, substat.value, 'percent', locale)}
                </span>
                {quality && <RollBadge quality={quality} />}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 border-t border-edge pt-1.5 font-mono text-[0.65rem]">
        <span className={holder ? 'text-muted' : 'text-good'}>
          {holder ?? 'libre'}
        </span>
        <span className="flex items-baseline gap-2">
          {piece.critValue > 0 && (
            <span
              className={`tabular ${CRIT_TONE[piece.critRating]}`}
              title={`Crit value: 2 × prob. CRIT + daño CRIT = ${
                piece.critValue.toFixed(1)} · ${piece.critRating}`}
            >
              CV {piece.critValue.toFixed(1)}
            </span>
          )}
          <span className="tabular text-muted">
            {piece.quality.count} roll{piece.quality.count === 1 ? '' : 's'}
            {piece.quality.efficiency !== null
              && ` · ${Math.round(piece.quality.efficiency * 100)}%`}
          </span>
        </span>
      </p>
    </li>
  );
}

/**
 * How a substat rolled: how many times, and at which tier.
 *
 * Four dots rather than a number, because the tier is the reading and a
 * percentage next to a percentage is unreadable.
 */
function RollBadge({ quality }: { quality: RollQuality }) {
  const tier = TIERS.indexOf(quality.tier);

  return (
    <span
      title={`${quality.count} roll${quality.count === 1 ? '' : 's'} · ${quality.tier}`}
      className={`flex items-center gap-0.5 ${
        quality.perfect ? 'text-accent' : tier >= 2 ? 'text-good' : 'text-muted'
      }`}
    >
      <span className="tabular">×{quality.count}</span>
      <span aria-hidden className="tracking-tighter">
        {'▰'.repeat(tier + 1)}{'▱'.repeat(3 - tier)}
      </span>
    </span>
  );
}
