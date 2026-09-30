'use client';

import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { useQueryStates } from 'nuqs';

import { FieldSelect } from '@/components/field-select';
import { Hint } from '@/components/hint';
import { GROUP_LABEL } from '@/components/segmented-links';
import { Slider } from '@/components/ui/slider';

import {
  CRIT_FILTERS,
  CRIT_STEP_LABELS,
  LEVEL_CAPS,
  artifactParsers,
} from './filters';

/**
 * The narrowing controls that are inputs rather than links.
 *
 * The build's four substats in one row, and under them how much crit and which
 * main stat. The roll-tier select and the level bands are gone: the first cut
 * on luck rather than on where the rolls landed, which read as a filter that
 * did not work, and the second is now a cap that belongs to the potential
 * ordering and only shows with it. The sets are a row of their own above;
 * see `set-strip.tsx`.
 *
 * `shallow: false` because the filtering happens on the server: the list is a
 * thousand pieces and narrowing it in the browser would mean shipping all of
 * them. The transition is what makes that honest — the panel dims while the
 * server answers instead of the control feeling stuck.
 */
export function FilterInputs({
  substats,
  ownedMains,
}: {
  /** Every rollable substat, worded by the server. */
  substats: { value: string; label: string }[];
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
  const reading = (step === 0
    ? t('any')
    : t('cvOrMore', { rating: critRatingLabel(CRIT_STEP_LABELS[step - 1]), value: CRIT_FILTERS[step - 1] }));

  /*
   * The build's substats, one select per line: two required, two optional —
   * see `lib/rules/archetype.ts`. A stat another line has taken stays in the
   * list, disabled and marked with that line, so a stat cannot be both
   * required and a bonus — the same as the build's own priority. Choosing any
   * retires the scaler and orders by the fit, which is the answer the choice
   * was asking for.
   */
  const lines = [
    ...[0, 1].map((index) => ({
      key: `need-${index}`,
      label: t('requiredLine', { index: index + 1 }),
      value: filters.need[index] ?? null,
      set: (value: string | null) => ({ need: place(filters.need, index, value) }),
    })),
    ...[0, 1].map((index) => ({
      key: `want-${index}`,
      label: t('optionalLine', { index: index + 1 }),
      value: filters.want[index] ?? null,
      set: (value: string | null) => ({ want: place(filters.want, index, value) }),
    })),
  ];
  const takenBy = new Map(lines.flatMap((line) => (line.value === null ? [] : [[line.value, line.label] as const])));
  const optionsFor = (line: (typeof lines)[number]) => substats.map((option) => {
    const at = takenBy.get(option.value);
    return at === undefined || option.value === line.value
      ? option
      : { ...option, label: `${option.label} · ${at}`, disabled: true };
  });

  // The level cap is part of the potential ordering: "which raw pieces are
  // worth feeding" is that ordering over pieces not yet levelled, and on any
  // other ordering a cap was a second question nobody was asking.
  const potential = filters.sort === 'potential';
  // A hand-edited step that is not one of the marks reads as no cap.
  const capIndex = LEVEL_CAPS.indexOf(filters.lvl as (typeof LEVEL_CAPS)[number]);
  const cap = capIndex === -1 ? LEVEL_CAPS.length - 1 : capIndex;

  return (
    <div
      data-pending={pending || undefined}
      className="space-y-3 transition-opacity data-pending:opacity-50"
    >
      <fieldset className="min-w-0">
        <legend className={`flex items-baseline gap-2 ${GROUP_LABEL}`}>
          {t('substatLabel')}
          <Hint text={t('archetypeHint')}>
            <span className="cursor-help normal-case text-muted">?</span>
          </Hint>
        </legend>
        <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-4">
          {lines.map((line) => (
            <Field key={line.key} label={line.label}>
              <FieldSelect
                label={line.label}
                value={line.value ?? ''}
                onValueChange={(value) => setFilters({
                  ...line.set(value === '' ? null : value),
                  scaler: null,
                  // Potential keeps its own order; everything else answers
                  // with the fit.
                  ...(potential ? {} : { sort: 'value' as const }),
                })}
                placeholder={t('any')}
                groups={[{ options: optionsFor(line) }]}
                triggerClassName="px-2 py-1 text-xs"
              />
            </Field>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
        <Field label={t('critValueLabel')} hint={reading}>
          <Scale
            steps={['—', ...CRIT_FILTERS.map(String)]}
            value={step}
            label={t('cvMinAria')}
            onChange={(value) => setFilters({ cv: value === 0 ? null : CRIT_FILTERS[value - 1] })}
          />
        </Field>

        {potential && (
          <Field label={t('levelCapLabel')} hint={t('levelCapReading', { level: LEVEL_CAPS[cap] })}>
            <Scale
              steps={LEVEL_CAPS.map((level) => `+${level}`)}
              value={cap}
              label={t('levelCapAria')}
              // The last step is no cap at all, so it leaves the address.
              onChange={(value) => setFilters({
                lvl: value === LEVEL_CAPS.length - 1 ? null : LEVEL_CAPS[value],
              })}
            />
          </Field>
        )}

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
 * A handful of named steps, as a scale.
 *
 * This was a native range with forty lines of vendor-prefixed CSS to paint its
 * own track and thumb. The primitive draws the same thing from two elements,
 * in both themes, and keeps the keyboard behaviour; the marks under it name
 * each step, the current one in the accent.
 */
function Scale({
  steps, value, label, onChange,
}: {
  steps: string[];
  value: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <>
      <Slider
        min={0}
        max={steps.length - 1}
        step={1}
        value={value}
        aria-label={label}
        onValueChange={(next) => onChange(Number(next))}
        className="py-1.5"
      />
      <span className="mt-1 flex justify-between font-mono text-2xs uppercase tracking-wide text-muted">
        {steps.map((mark, index) => (
          <span key={mark} className={index === value && index > 0 ? 'text-accent' : undefined}>
            {mark}
          </span>
        ))}
      </span>
    </>
  );
}

/**
 * A line's choice written into its position. Emptied lines close up, so the
 * URL never carries a hole — the second required line cleared leaves one.
 */
function place(list: string[], index: number, value: string | null) {
  const next = [...list];
  next[index] = value ?? '';
  return next.filter((entry) => entry !== '');
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
      <span className={`flex items-baseline justify-between gap-2 ${GROUP_LABEL}`}>
        {label}
        {hint && <span className="truncate normal-case text-text">{hint}</span>}
      </span>
      <span className="mt-1.5 block">{children}</span>
    </label>
  );
}
