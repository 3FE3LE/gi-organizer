'use client';

import { Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useQueryStates } from 'nuqs';

import { FieldSelect } from '@/components/field-select';
import { Slider } from '@/components/ui/slider';
import { SCALERS } from '@/lib/rules/worth';

import {
  CRIT_FILTERS,
  CRIT_STEP_LABELS,
  SORTS,
  artifactParsers,
} from './filters';

/**
 * The narrowing controls that are inputs rather than links.
 *
 * Substat and roll tier were rows of chips — eleven stats and four tiers
 * spread over two lines — for what is a choice of one from a list, which is
 * what a select is. With them as selects, the four questions a search is
 * phrased in (a substat, how well it rolled, how much crit, which main stat)
 * sit in one row on a desktop and wrap on a phone. The sets are a row of their
 * own under them; see `set-strip.tsx`.
 *
 * `shallow: false` because the filtering happens on the server: the list is a
 * thousand pieces and narrowing it in the browser would mean shipping all of
 * them. The transition is what makes that honest — the panel dims while the
 * server answers instead of the control feeling stuck.
 */
export function FilterInputs({
  substats,
  tiers,
  ownedMains,
}: {
  /** Every rollable substat, worded by the server. */
  substats: { value: string; label: string }[];
  /** The roll-tier cut-offs, as percentages, worded by the server. */
  tiers: { value: string; label: string }[];
  /** Only the main stats the box actually holds for the slot in view. */
  /** Empty for a slot whose main stat the game fixed, and before one is picked. */
  ownedMains: { prop: string; name: string }[];
}) {
  const t = useTranslations('artifacts');
  const critRatingLabel = useTranslations('common.critRating');
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(artifactParsers, {
    shallow: false,
    startTransition,
  });

  // 0 is "any"; the rest index into the cut-offs.
  const step = filters.cv === null ? 0 : CRIT_FILTERS.indexOf(filters.cv) + 1;
  const reading = step === 0
    ? t('any')
    : t('cvOrMore', { rating: critRatingLabel(CRIT_STEP_LABELS[step - 1]), value: CRIT_FILTERS[step - 1] });

  return (
    <div
      data-pending={pending || undefined}
      className={`grid gap-x-4 gap-y-4 transition-opacity data-pending:opacity-50 sm:grid-cols-2 ${
        ownedMains.length > 0 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'
      }`}
    >
      <Field label={t('substatLabel')}>
        <FieldSelect
          label={t('substatAria')}
          value={filters.sub ?? ''}
          onValueChange={(value) => setFilters({ sub: value === '' ? null : value })}
          placeholder={t('any')}
          groups={[{ options: substats }]}
          triggerClassName="px-2 py-1 text-xs"
        />
      </Field>

      {/* "quality" named nothing in particular. What it cuts on is the average
          tier of a piece's rolls, which is the vocabulary the cards below
          already use. A maxed roll is a toggle beside it rather than a fifth
          tier, because it is a different question: not how the piece rolled on
          average, but whether one roll hit the ceiling. */}
      <Field label={t('rollsLabel')}>
        <span className="flex items-center gap-1.5">
          <span className="min-w-0 flex-1">
            <FieldSelect
              label={t('rollsAria')}
              value={filters.quality === null ? '' : String(filters.quality)}
              onValueChange={(value) => setFilters({ quality: value === '' ? null : Number(value) })}
              placeholder={t('any')}
              groups={[{ options: tiers }]}
              triggerClassName="px-2 py-1 text-xs"
            />
          </span>
          <button
            type="button"
            aria-pressed={filters.perfect}
            title={t('perfectSubstatToggle')}
            onClick={() => setFilters({ perfect: !filters.perfect })}
            className={`flex h-[1.875rem] shrink-0 items-center gap-1 rounded-md border px-2 text-2xs transition-colors ${
              filters.perfect
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-edge text-muted hover:border-edge-strong hover:text-text'
            }`}
          >
            <Sparkles size={11} aria-hidden />
            <span className="sr-only">{t('perfectSubstatToggle')}</span>
          </button>
        </span>
      </Field>

      <Field label={t('critValueLabel')} hint={reading}>
        {/*
          * The cut-off, as a scale.
          *
          * This was a native range with forty lines of vendor-prefixed CSS to
          * paint its own track and thumb — `::-webkit-slider-runnable-track`,
          * `::-moz-range-thumb`, and a `--fill` variable to colour the part
          * behind the handle. The primitive draws the same thing from two
          * elements, in both themes, and keeps the keyboard behaviour.
          */}
        <Slider
          min={0}
          max={CRIT_FILTERS.length}
          step={1}
          value={step}
          aria-label={t('cvMinAria')}
          onValueChange={(next) => {
            const value = Number(next);
            setFilters({ cv: value === 0 ? null : CRIT_FILTERS[value - 1] });
          }}
          className="py-1.5"
        />
        <span className="mt-1 flex justify-between font-mono text-2xs uppercase tracking-wide text-muted">
          <span>—</span>
          {CRIT_FILTERS.map((value, index) => (
            <span key={value} className={step === index + 1 ? 'text-accent' : undefined}>
              {value}
            </span>
          ))}
        </span>
      </Field>

      {/* The main stat is how a search is actually phrased — "a mastery
          sands" — and it is the one thing `worth` refuses to score, because
          which main stat is right is the build's decision and not the box's.
          Absent until a slot makes it a question with more than one answer. */}
      {ownedMains.length > 0 && (
        <Field label={t('mainStatLabel')}>
          <FieldSelect
            label={t('mainStatAria')}
            value={filters.main ?? ''}
            onValueChange={(value) => setFilters({ main: value === '' ? null : value })}
            placeholder={t('anyWithCount', { count: ownedMains.length })}
            groups={[{ options: ownedMains.map((main) => ({
              value: main.prop, label: main.name,
            })) }]}
            triggerClassName="px-2 py-1 text-xs"
          />
        </Field>
      )}
    </div>
  );
}

/**
 * How the list is priced and ordered. Neither is a filter — they never change
 * which pieces are in the list — so they sit with the count rather than behind
 * the disclosure the narrowing controls live in.
 *
 * The scaler is here rather than next to the substat chips because it is the
 * same kind of decision as the ordering: it says what counts as good, and the
 * cards grey out the rolls it prices at nothing.
 */
export function RankControls() {
  const t = useTranslations('artifacts');
  const scalerLabel = useTranslations('common.scaler');
  const sortLabel = useTranslations('common.sort');
  const [pending, startTransition] = useTransition();
  const [filters, setFilters] = useQueryStates(artifactParsers, {
    shallow: false,
    startTransition,
  });

  return (
    <div
      data-pending={pending || undefined}
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 transition-opacity data-pending:opacity-50"
    >
      <label className="flex items-center gap-1.5">
        <span className="font-mono text-2xs uppercase text-muted">{t('scalerLabel')}</span>
        <FieldSelect
          label={t('scalerAria')}
          value={filters.scaler ?? ''}
          onValueChange={(value) =>
            setFilters({ scaler: value === '' ? null : (value as typeof filters.scaler) })}
          placeholder={t('generalBest')}
          groups={[{ options: SCALERS.map((scaler) => ({
            value: scaler, label: scalerLabel(scaler),
          })) }]}
          triggerClassName="w-auto px-2 py-1 text-xs"
        />
      </label>

      <label className="flex items-center gap-1.5">
        <span className="font-mono text-2xs uppercase text-muted">{t('sortLabel')}</span>
        <FieldSelect
          label={t('sortAria')}
          value={filters.sort}
          onValueChange={(value) => setFilters({ sort: value as typeof filters.sort })}
          groups={[{ options: SORTS.map((sort) => ({
            value: sort, label: sortLabel(sort),
          })) }]}
          triggerClassName="w-auto px-2 py-1 text-xs"
        />
      </label>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="flex items-baseline justify-between gap-2 font-mono text-2xs uppercase text-muted">
        {label}
        {hint && <span className="truncate normal-case text-text">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
