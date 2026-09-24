import {
  ChevronRight, Crown, Feather, Flower2, Hourglass, PackageOpen, SlidersHorizontal, UserCheck, Wine, X,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { Segment, Segments } from '@/components/segmented-links';
import { StatIcon } from '@/components/stat-icon';
import { formatSetEffect, setEffects, statLabel, type Catalog } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import type { ArtifactSlot } from '@/lib/data/types';
import { ROLLABLE } from '@/lib/rules/rolls';
import { SCALERS, SCALER_PROPS } from '@/lib/rules/worth';


import {
  CLEARED,
  CRIT_FILTERS,
  CRIT_STEP_LABELS,
  HELD,
  SORTS,
  TIER_FILTERS,
  activeCount,
  href,
  tierAt,
  type ArtifactFilters,
} from './filters';
import { FilterInputs } from './filter-inputs';
import { SetStrip, type SetChoice } from './set-strip';

/**
 * Seven rows of chips was the whole filter surface, open at once, and most of
 * it is not what anybody reaches for: slot and holder narrow the box on almost
 * every visit, and the rest is a second thought.
 *
 * So the ones that get used are a toolbar and the rest is behind a disclosure —
 * four selects in a row, then every set as a strip of its flowers — and what
 * is currently on is stated in one line underneath. That line is the
 * important part: with the controls folded away, a filtered view has to say so
 * somewhere, or the next question is why the box looks empty.
 */

const HELD_ICONS: Record<(typeof HELD)[number], typeof Flower2> = {
  free: PackageOpen,
  worn: UserCheck,
};

const SLOT_ICONS: Record<ArtifactSlot, typeof Flower2> = {
  flower: Flower2,
  plume: Feather,
  sands: Hourglass,
  goblet: Wine,
  circlet: Crown,
};

export async function FilterPanel({
  base,
  filters,
  catalog,
  setCounts,
  locale,
  ownedMains,
}: {
  base: string;
  filters: ArtifactFilters;
  catalog: Catalog;
  /** Pieces per set in the box. */
  setCounts: Map<number, number>;
  locale: string;
  ownedMains: { prop: string; name: string }[];
}) {
  const active = activeCount(filters);
  const t = await getTranslations('artifacts');
  const slotLabel = await getTranslations('common.slot');
  const heldLabel = await getTranslations('common.held');
  const tierLabel = await getTranslations('common.tier');
  const sortLabel = await getTranslations('common.sort');

  /*
   * Every set in the catalogue, owned first and by how much of it the box
   * holds, then the rest by name. The flower stands for the set — the piece
   * every set has — falling back to whatever piece exists for circlet-only
   * sets.
   */
  const sets: SetChoice[] = (await Promise.all(
    catalog.index.artifactsSorted.map(async (set) => ({
      setId: set.id,
      name: set.name,
      icon: await resolveIcon(
        set.pieces.flower?.icon
          ?? Object.values(set.pieces).map((piece) => piece?.icon).find(Boolean)
          ?? null,
        'relic',
      ),
      effects: setEffects(set).map(formatSetEffect),
      count: setCounts.get(set.id) ?? 0,
    })),
  )).sort((a, b) =>
    Number(b.count > 0) - Number(a.count > 0)
    || b.count - a.count
    || a.name.localeCompare(b.name, locale));

  // The narrowing controls behind the disclosure that are on, for its badge:
  // folded away, they have to say they are doing something.
  const advanced = [
    filters.sub !== null, filters.quality !== null, filters.cv !== null,
    filters.perfect, filters.main !== null, filters.lvl !== null,
  ].filter(Boolean).length;
  const scalerLabel = await getTranslations('common.scaler');
  // A scaler only prices the value ordering, so picking one switches to it —
  // unless the list is already ordered by value.
  const valueSort = filters.sort === 'value' ? {} : { sort: 'value' as const };

  return (
    <div className="space-y-3">
      {/*
        * Laid out in the order a search is actually made.
        *
        * The question this page answers is "of the pieces of this set, which is
        * best for this kind of build". So the card reads top to bottom as that
        * sentence: the set first, as a strip of its flowers across the head;
        * then which piece, what it is being valued for, and whose it may be;
        * then how the list is ordered. What remains — a substat, the roll
        * tier, the level band, a crit cut-off, the main stat — narrows an
        * answer that is already mostly right, so it is folded away.
        */}
      <div className="card">
      <div className="px-3 pb-1 pt-2.5">
        <SetStrip sets={sets} />
      </div>

      {/* Piece, what it is valued for, whose, and in what order: one row on a
          desktop, wrapping on a phone. The ordering never removes a piece, but
          it is the last word of the same question, so it sits on the line. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5 border-t border-edge px-3 py-2.5">
        <Segments label={t('pieceLabel')}>
          <Segment to={href(base, filters, { slot: null, main: null })} active={!filters.slot}>
            {t('allSlots')}
          </Segment>
          {ARTIFACT_SLOTS.map((slot) => {
            const Icon = SLOT_ICONS[slot];
            const label = slotLabel.has(slot) ? slotLabel(slot) : slot;

            return (
              <Segment
                key={slot}
                to={href(base, filters, { slot, main: null })}
                active={filters.slot === slot}
                title={label}
              >
                <Icon size={15} aria-hidden />
                <span className="sr-only">{label}</span>
              </Segment>
            );
          })}
        </Segments>

        {/*
          * What "best" means: the stat the build scales off. Buttons rather
          * than a select, because it is half of the question rather than a
          * setting — and choosing one orders the list by value, which is the
          * only ordering it prices, so picking a scaler always answers with a
          * ranking for it.
          */}
        <Segments label={t('scalerLabel')} hint={t('scalerHint')}>
          <Segment
            to={href(base, filters, { scaler: null, ...valueSort })}
            active={filters.scaler === null}
          >
            {t('generalBest')}
          </Segment>
          {SCALERS.map((scaler) => (
            <Segment
              key={scaler}
              to={href(base, filters, { scaler, ...valueSort })}
              active={filters.scaler === scaler}
              title={scalerLabel(scaler)}
            >
              <StatIcon prop={SCALER_PROPS[scaler]} label={scalerLabel(scaler)} size={14} />
            </Segment>
          ))}
        </Segments>

        {/* Icons, like the slots beside them: "free" and "worn" are two
            states a player reads at a glance, and spelled out they were the
            widest thing on the row. */}
        <Segments label={t('whoLabel')}>
          <Segment to={href(base, filters, { held: null })} active={!filters.held}>
            {t('allHolders')}
          </Segment>
          {HELD.map((held) => {
            const Icon = HELD_ICONS[held];
            return (
              <Segment
                key={held}
                to={href(base, filters, { held })}
                active={filters.held === held}
                title={heldLabel(held)}
              >
                <Icon size={15} aria-hidden />
                <span className="sr-only">{heldLabel(held)}</span>
              </Segment>
            );
          })}
        </Segments>

        <Segments label={t('sortLabel')}>
          {SORTS.map((sort) => (
            <Segment key={sort} to={href(base, filters, { sort })} active={filters.sort === sort}>
              {sortLabel(sort)}
            </Segment>
          ))}
        </Segments>
      </div>

      {/* `open` when something inside it is on, so a shared URL does not hide
          the control that produced it. */}
      <details
        open={advanced > 0}
        className="group border-t border-edge"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs text-text transition-colors hover:bg-surface-2/60">
          <SlidersHorizontal size={14} aria-hidden className="text-muted" />
          <span className="font-medium">{t('moreFilters')}</span>
          {advanced > 0 && (
            <span className="tabular rounded-full bg-accent px-1.5 font-mono text-2xs leading-4 text-on-accent">
              {advanced}
            </span>
          )}
          <ChevronRight size={14} aria-hidden className="ml-auto text-muted transition-transform group-open:rotate-90" />
        </summary>

        <div className="border-t border-edge px-3 py-2.5">
          <FilterInputs
            substats={ROLLABLE.map((prop) => ({ value: prop, label: statLabel(catalog, prop) }))}
            tiers={TIER_FILTERS.map((fraction) => ({
              value: String(Math.round(fraction * 100)),
              label: t('tierOrBetter', { tier: tierLabel(tierAt(fraction)) }),
            }))}
            ownedMains={ownedMains}
          />
        </div>
      </details>
      </div>

      {active > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-2xs uppercase text-muted">{t('activeLabel')}</span>
          {(await describe(filters, catalog)).map((entry) => (
            <Chip key={entry.key} to={href(base, filters, entry.clear)} active>
              {entry.label}
              <X size={10} className="ml-1 inline" aria-hidden />
              <span className="sr-only">{t('removeSr')}</span>
            </Chip>
          ))}
          <Link
            href={href(base, filters, CLEARED)}
            className="font-mono text-2xs text-muted underline decoration-edge-strong underline-offset-2 hover:text-accent"
          >
            {t('clearAll')}
          </Link>
        </div>
      )}
    </div>
  );
}

/** What is on, named the way the control that set it named it. */
async function describe(filters: ArtifactFilters, catalog: Catalog) {
  const t = await getTranslations('artifacts');
  const slotLabel = await getTranslations('common.slot');
  const heldLabel = await getTranslations('common.held');
  const critRatingLabel = await getTranslations('common.critRating');
  const tierLabel = await getTranslations('common.tier');

  const entries: { key: string; label: string; clear: Partial<ArtifactFilters> }[] = [];

  if (filters.slot) {
    entries.push({
      key: 'slot',
      label: slotLabel.has(filters.slot) ? slotLabel(filters.slot) : filters.slot,
      clear: { slot: null },
    });
  }
  if (filters.held) {
    entries.push({ key: 'held', label: heldLabel(filters.held), clear: { held: null } });
  }
  if (filters.sub) {
    entries.push({ key: 'sub', label: statLabel(catalog, filters.sub), clear: { sub: null } });
  }
  if (filters.main) {
    entries.push({ key: 'main', label: statLabel(catalog, filters.main), clear: { main: null } });
  }
  if (filters.set !== null) {
    entries.push({
      key: 'set',
      label: catalog.artifacts.get(filters.set)?.name ?? `#${filters.set}`,
      clear: { set: null },
    });
  }
  if (filters.quality !== null) {
    entries.push({
      key: 'quality',
      label: t('tierOrBetter', { tier: tierLabel(tierAt(filters.quality / 100)) }),
      clear: { quality: null },
    });
  }
  if (filters.cv !== null) {
    const step = CRIT_FILTERS.indexOf(filters.cv);
    entries.push({
      key: 'cv',
      label: t('cvActive', { value: filters.cv })
        + (step >= 0 ? ` · ${critRatingLabel(CRIT_STEP_LABELS[step])}` : ''),
      clear: { cv: null },
    });
  }
  if (filters.lvl !== null) {
    entries.push({
      key: 'lvl',
      label: filters.lvl === 20 ? '+20' : `+${filters.lvl}–${filters.lvl + 3}`,
      clear: { lvl: null },
    });
  }
  if (filters.perfect) {
    entries.push({ key: 'perfect', label: t('perfectSubstatActive'), clear: { perfect: false } });
  }

  return entries;
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
      data-active={active}
      className="chip"
    >
      {children}
    </Link>
  );
}
