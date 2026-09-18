'use client';

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
 * The controls that are inputs rather than links.
 *
 * A set picker listing every set you own is the single heaviest thing on this
 * page, a crit-value cut-off is a scale and reads as one, and an ordering is a
 * choice of one from five. All three are what a native control is for. They
 * write to the same query string the links do, so the view is still a URL.
 *
 * `shallow: false` because the filtering happens on the server: the list is a
 * thousand pieces and narrowing it in the browser would mean shipping all of
 * them. The transition is what makes that honest — the panel dims while the
 * server answers instead of the control feeling stuck.
 */
export function FilterInputs({
  ownedSets,
  ownedMains,
}: {
  ownedSets: { setId: number; name: string }[];
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
      className="grid gap-x-6 gap-y-4 transition-opacity data-pending:opacity-50 sm:grid-cols-2"
    >
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
        <div className="mt-1 flex justify-between font-mono text-2xs uppercase tracking-wide text-muted">
          <span>—</span>
          {CRIT_FILTERS.map((value, index) => (
            <span key={value} className={step === index + 1 ? 'text-accent' : undefined}>
              {value}
            </span>
          ))}
        </div>
      </Field>

      <div className={`grid gap-4 ${ownedMains.length > 0 ? 'sm:grid-cols-2' : ''}`}>
        <Field label={t('setLabel')}>
          <FieldSelect
            label={t('setAria')}
            value={filters.set === null ? '' : String(filters.set)}
            onValueChange={(value) => setFilters({ set: value === '' ? null : Number(value) })}
            placeholder={t('allSetsWithCount', { count: ownedSets.length })}
            groups={[{ options: ownedSets.map((set) => ({
              value: String(set.setId), label: set.name,
            })) }]}
            triggerClassName="px-2 py-1 text-xs"
          />
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
