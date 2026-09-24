import { ChevronRight, Crown, Feather, Flower2, Hourglass, Wine, X } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import Link from 'next/link';

import { formatSetEffect, setEffects, statLabel, type Catalog } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import { ARTIFACT_SLOTS } from '@/lib/enka/slots';
import type { ArtifactSlot } from '@/lib/data/types';
import { ROLLABLE } from '@/lib/rules/rolls';

import {
  CLEARED,
  CRIT_FILTERS,
  CRIT_STEP_LABELS,
  HELD,
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

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
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
                <Icon size={13} aria-hidden />
                <span className="sr-only">{label}</span>
              </Segment>
            );
          })}
        </Segments>

        <Segments label={t('whoLabel')}>
          <Segment to={href(base, filters, { held: null })} active={!filters.held}>
            {t('allHolders')}
          </Segment>
          {HELD.map((held) => (
            <Segment
              key={held}
              to={href(base, filters, { held })}
              active={filters.held === held}
            >
              {heldLabel(held)}
            </Segment>
          ))}
        </Segments>
      </div>

      {/* `open` when something inside it is on, so a shared URL does not hide
          the control that produced it. */}
      <details
        open={filters.sub !== null || filters.quality !== null || filters.cv !== null
          || filters.perfect || filters.set !== null || filters.main !== null}
        className="group card"
      >
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-3 py-2 font-mono text-2xs uppercase text-muted hover:text-text">
          <ChevronRight size={12} className="transition-transform group-open:rotate-90" />
          {t('moreFilters')}
        </summary>

        <div className="space-y-4 border-t border-edge px-3 py-3">
          <FilterInputs
            substats={ROLLABLE.map((prop) => ({ value: prop, label: statLabel(catalog, prop) }))}
            tiers={TIER_FILTERS.map((fraction) => ({
              value: String(Math.round(fraction * 100)),
              label: t('tierOrBetter', { tier: tierLabel(tierAt(fraction)) }),
            }))}
            ownedMains={ownedMains}
          />

          {/* Always a row of its own: forty-odd flowers do not share a line
              with anything. */}
          <SetStrip sets={sets} />
        </div>
      </details>

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
  if (filters.perfect) {
    entries.push({ key: 'perfect', label: t('perfectSubstatActive'), clear: { perfect: false } });
  }

  return entries;
}

/**
 * A dial rather than loose chips: one bordered strip whose parts are hairline
 * divided, so the five slots read as one choice of five and not as five things
 * to think about.
 */
function Segments({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div
      aria-label={label}
      className="flex items-stretch divide-x divide-edge overflow-hidden card"
    >
      {children}
    </div>
  );
}

function Segment({
  to,
  active,
  title,
  children,
}: {
  to: string;
  active: boolean;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      title={title}
      aria-current={active ? 'true' : undefined}
      className={`flex items-center gap-1 px-2.5 py-1.5 text-2xs transition-colors ${
        active
          ? 'bg-surface-2 text-accent'
          : 'text-muted hover:bg-surface-2 hover:text-text'
      }`}
    >
      {children}
    </Link>
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
      data-active={active}
      className="chip"
    >
      {children}
    </Link>
  );
}
