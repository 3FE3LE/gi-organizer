'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useQueryStates } from 'nuqs';

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
        <input
          type="range"
          min={0}
          max={CRIT_FILTERS.length}
          step={1}
          value={step}
          aria-label={t('cvMinAria')}
          aria-valuetext={reading}
          onChange={(event) => {
            const next = Number(event.target.value);
            setFilters({ cv: next === 0 ? null : CRIT_FILTERS[next - 1] });
          }}
          // The filled part of the track is the reading, so it is drawn rather
          // than left to the browser's default grey.
          style={{ '--fill': `${(step / CRIT_FILTERS.length) * 100}%` } as React.CSSProperties}
          className="h-4 w-full cursor-pointer appearance-none bg-transparent
            [&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-full
            [&::-webkit-slider-runnable-track]:bg-[linear-gradient(to_right,var(--color-accent)_var(--fill),var(--color-edge-strong)_var(--fill))]
            [&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-full
            [&::-moz-range-track]:bg-[linear-gradient(to_right,var(--color-accent)_var(--fill),var(--color-edge-strong)_var(--fill))]
            [&::-webkit-slider-thumb]:mt-[-5px] [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:w-[13px]
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-accent
            [&::-webkit-slider-thumb]:bg-ink
            [&::-moz-range-thumb]:h-[13px] [&::-moz-range-thumb]:w-[13px] [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-ink"
        />
        <div className="mt-1 flex justify-between font-mono text-[0.55rem] uppercase tracking-wide text-muted">
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
          <Select
            value={filters.set === null ? '' : String(filters.set)}
            onChange={(value) => setFilters({ set: value === '' ? null : Number(value) })}
            aria-label={t('setAria')}
          >
            <option value="">{t('allSetsWithCount', { count: ownedSets.length })}</option>
            {ownedSets.map((set) => (
              <option key={set.setId} value={set.setId}>{set.name}</option>
            ))}
          </Select>
        </Field>

        {/* The main stat is how a search is actually phrased — "a mastery
            sands" — and it is the one thing `worth` refuses to score, because
            which main stat is right is the build's decision and not the box's.
            Absent until a slot makes it a question with more than one answer. */}
        {ownedMains.length > 0 && (
          <Field label={t('mainStatLabel')}>
            <Select
              value={filters.main ?? ''}
              onChange={(value) => setFilters({ main: value === '' ? null : value })}
              aria-label={t('mainStatAria')}
            >
              <option value="">{t('anyWithCount', { count: ownedMains.length })}</option>
              {ownedMains.map((main) => (
                <option key={main.prop} value={main.prop}>{main.name}</option>
              ))}
            </Select>
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
        <span className="font-mono text-[0.6rem] uppercase text-muted">{t('scalerLabel')}</span>
        <Select
          value={filters.scaler ?? ''}
          onChange={(value) =>
            setFilters({ scaler: value === '' ? null : (value as typeof filters.scaler) })}
          aria-label={t('scalerAria')}
        >
          <option value="">{t('generalBest')}</option>
          {SCALERS.map((scaler) => (
            <option key={scaler} value={scaler}>{scalerLabel(scaler)}</option>
          ))}
        </Select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="font-mono text-[0.6rem] uppercase text-muted">{t('sortLabel')}</span>
        <Select
          value={filters.sort}
          onChange={(value) => setFilters({ sort: value as typeof filters.sort })}
          aria-label={t('sortAria')}
        >
          {SORTS.map((sort) => (
            <option key={sort} value={sort}>{sortLabel(sort)}</option>
          ))}
        </Select>
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
      <span className="flex items-baseline justify-between gap-2 font-mono text-[0.6rem] uppercase text-muted">
        {label}
        {hint && <span className="truncate normal-case text-text">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}

function Select({
  value,
  onChange,
  children,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
} & React.AriaAttributes) {
  return (
    <select
      {...rest}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="w-full truncate rounded border border-edge bg-ink px-2 py-1 text-xs text-text
        transition-colors hover:border-edge-strong focus:border-accent focus:outline-none"
    >
      {children}
    </select>
  );
}
