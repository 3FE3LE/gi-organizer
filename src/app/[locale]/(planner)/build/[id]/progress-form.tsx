'use client';

import { useFormatter, useTranslations } from 'next-intl';
import Link from 'next/link';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  Check,
  CircleAlert,
  Gauge,
  Minus,
  Plus,
  Save,
  Shield,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  Controller,
  useFieldArray,
  useForm,
  useWatch,
  type Control,
  type UseFormRegisterReturn,
} from 'react-hook-form';

import { Button, buttonVariants } from '@/components/ui/button';
import { FieldSelect } from '@/components/field-select';
import { Slider } from '@/components/ui/slider';
import { ActionStatus } from '@/components/action-status';
import {
  BREAKPOINTS,
  DEFAULT_GOAL_ROWS,
  MAX_GOAL_ROWS,
  SUBSTAT_POSITIONS,
  progressSchema,
  type ProgressFormValues,
  type ProgressPayload,
} from '@/lib/forms/build';

import { applyTemplateAction, deleteBuildAction } from './build-actions';
import { type ProgressState, saveProgressAction } from './progress-actions';
import { SetPicker, type SetOptions } from './set-picker';

/**
 * Where this character is, and where they are going.
 *
 * The gap between the two is what the whole planner reasons about. Stat goals
 * are the part that matters most: nobody plans an artifact substat by substat,
 * but "700 EM and 200% recharge" is a real target, and stating it is what lets
 * every swap be judged as met, close or short instead of merely bigger.
 *
 * ## Why it is laid out like this
 *
 * It used to be seven full-width cards in a column: a page that scrolled for a
 * screen and a half and read, on a phone, like a multiple-choice exam — one
 * question, scroll, one question, scroll. Nothing was removed to fix that.
 * What changed is the shape of the space.
 *
 *   - **Two columns from `lg`.** Progress is short and dense, gear is tall;
 *     side by side they end on roughly the same line instead of stacking.
 *   - **Level and talents are one question** asked four times: where it is,
 *     where it ends. One `hoy → meta` grid says that once, instead of a Level
 *     card and a separate Talents card with six steppers in pairs.
 *   - **Goals are a grid, not a list.** Three thresholds side by side is a
 *     plan you read at a glance; three stacked rows is a queue you work.
 *   - **Every panel carries its own answer in its header.** "Nv. 80 → 90 · C1"
 *     next to the title makes a long form skimmable and gives the page a pulse
 *     as it is filled in.
 *   - **The save bar sticks to the bottom on a phone**, where the thumb is,
 *     and sits inline from `sm`, where the end of the form is already visible.
 *
 * The palette and the type are the app's, unchanged. This is one screen inside
 * a tool, and a screen that invents its own look reads as a different product.
 */

export type Option = { value: string; label: string };

export type GoalProp = Option & {
  /** What the character measures today, formatted, for contrast. */
  current: string;
  /** The same number unformatted, so a typed threshold can be judged. */
  currentValue: number;
};

/**
 * Ranked first, then everything else.
 *
 * The suggestions used to be a separate list further down the page, which made
 * choosing a weapon a two-step act: read the ranking there, find the name here.
 * They are the same decision, so they are the same control.
 */
export type RankedOptions = { suggested: Option[]; all: Option[] };

export type ProgressOptions = {
  roles: Option[];
  substats: Option[];
  weapons: RankedOptions;
  /** Weapon ids whose refinement is farmable — see `objective-view.ts`. */
  forgeable: number[];
  /** Richer than the rest: a set is picked by its icon and its bonus. */
  sets: SetOptions;
  mainStatsBySlot: Record<string, Option[]>;
  goalProps: GoalProp[];
};

export type ProgressValues = {
  characterId: number;
  buildId: string | null;
  role: string | null;
  substats: string[];
  current: {
    level: number;
    ascended: boolean;
    constellation: number;
    talents: { auto: number; skill: number; burst: number };
  };
  target: {
    level: number;
    ascended: boolean;
    talents: { auto: number; skill: number; burst: number };
  };
  weaponId: number | null;
  weaponRefinement: number | null;
  /** What is on the character right now, for the line under the picker. */
  equippedWeapon: string | null;
  setIds: number[];
  mainStats: Record<string, string>;
  goals: { prop: string; min: number }[];
};

/** The resolver transforms, so the control carries both shapes. */
type ProgressControl = Control<ProgressFormValues, unknown, ProgressPayload>;

const SLOTS = [{ key: 'sands' }, { key: 'goblet' }, { key: 'circlet' }];

const TALENTS = ['auto', 'skill', 'burst'] as const;

function defaultsFrom(values: ProgressValues): ProgressFormValues {
  return {
    characterId: values.characterId,
    buildId: values.buildId ?? '',
    role: values.role ?? '',
    substats: SUBSTAT_POSITIONS.map((position) => values.substats[position - 1] ?? ''),
    // A stored target from before the character last levelled up is not a
    // choice to undo levelling, it is a target that fell behind — so the form
    // opens on whichever is higher, same as the Stepper's own floor below.
    targetLevel: Math.max(values.current.level, values.target.level),
    targetAscended: values.target.ascended,
    targetTalents: {
      auto: Math.max(values.current.talents.auto, values.target.talents.auto),
      skill: Math.max(values.current.talents.skill, values.target.talents.skill),
      burst: Math.max(values.current.talents.burst, values.target.talents.burst),
    },
    weaponId: values.weaponId === null ? '' : String(values.weaponId),
    weaponRefinement: values.weaponRefinement ?? 1,
    setIds: [
      values.setIds[0] === undefined ? '' : String(values.setIds[0]),
      values.setIds[1] === undefined ? '' : String(values.setIds[1]),
    ],
    mainStats: Object.fromEntries(SLOTS.map((slot) => [
      slot.key, values.mainStats[slot.key] ?? '',
    ])),
    // Three rows, or as many as this goal already states. An empty row is a
    // question; three of them is a form, six was an interrogation.
    goals: Array.from(
      { length: Math.max(DEFAULT_GOAL_ROWS, values.goals.length) },
      (_, index) => ({
        prop: values.goals[index]?.prop ?? '',
        min: values.goals[index]?.min === undefined ? '' : String(values.goals[index].min),
      }),
    ),
  };
}

/**
 * Owns the outcome of the last action, and remounts the form around it.
 *
 * The key the form is mounted under is built from every value it holds, so
 * that refilling from a role — which writes on the server — comes back to a
 * form that can see the new values. A plain save changes those values too, so
 * the form is remounted by its own success: a status owned inside it would be
 * destroyed at the exact moment it had something to say, which is how the save
 * confirmation stopped appearing at all.
 *
 * Holding it out here is the whole fix. This component is not keyed, so it
 * survives the remount it causes.
 */
export function ProgressPanel({
  progressKey,
  locale,
  values,
  options,
}: {
  progressKey: string;
  locale: string;
  values: ProgressValues;
  options: ProgressOptions;
}) {
  const [state, setState] = useState<ProgressState>({ status: 'idle' });

  return (
    <ProgressForm
      key={progressKey}
      locale={locale}
      values={values}
      options={options}
      state={state}
      onState={setState}
    />
  );
}

function ProgressForm({
  locale,
  values,
  options,
  state,
  onState: setState,
}: {
  locale: string;
  values: ProgressValues;
  options: ProgressOptions;
  state: ProgressState;
  onState: (state: ProgressState) => void;
}) {
  const t = useTranslations('build');
  const slotLabel = useTranslations('common.slot');
  const talentLabel = useTranslations('common.talent');
  const [busy, setBusy] = useState<'template' | 'delete' | null>(null);

  /*
   * The same defaults twice, on purpose.
   *
   * `register` sets a field's value through a ref after mount, so a select it
   * owns renders with nothing selected on the server. Passing `defaultValue`
   * as well is what puts the right option in the HTML: the first paint is
   * correct, and hydration agrees with it because both read this object.
   * `Controller` needs none of it — it renders the value it holds.
   */
  const defaults = defaultsFrom(values);

  const form = useForm<ProgressFormValues, unknown, ProgressPayload>({
    resolver: zodResolver(progressSchema),
    defaultValues: defaults,
  });

  const goalRows = useFieldArray({ control: form.control, name: 'goals' });

  /*
   * The raw values go over the wire, not the ones the resolver transformed.
   * The client's parse decides whether to submit at all; the server's parse is
   * the one that decides what gets written, and it has to run on the same input
   * the schema was written for. Sending the output would mean the action
   * validates a shape nobody can forge — which is exactly backwards.
   */
  const save = form.handleSubmit(async () => {
    setState(await saveProgressAction(form.getValues()));
  });

  /*
   * Refilling from the role reads the role that is on screen, not the one on
   * disk, so picking a role and filling from it is one gesture. It writes on
   * the server, which is what makes the page come back with new values — and
   * the remount key at the call site is what lets this form see them.
   */
  const fillFromRole = async () => {
    if (!values.buildId) return;
    setBusy('template');
    setState(await applyTemplateAction({
      characterId: values.characterId,
      buildId: values.buildId,
      role: form.getValues('role'),
    }));
    setBusy(null);
  };

  const remove = async () => {
    if (!values.buildId) return;
    setBusy('delete');
    setState(await deleteBuildAction(values.buildId));
    setBusy(null);
  };

  // `useWatch` rather than `form.watch`: the latter hands back a fresh function
  // every render, which makes the React Compiler skip this component entirely.
  const [targetLevel, setIds, mainStats, substats, goals] = useWatch({
    control: form.control,
    name: ['targetLevel', 'setIds', 'mainStats', 'substats', 'goals'],
  });
  const weaponId = useWatch({ control: form.control, name: 'weaponId' });

  /*
   * A refinement is only a target when copies can be worked towards.
   *
   * Forged weapons take a billet and ore whenever the player wants another
   * copy, so R1 → R5 is a plan. Everything else — every five-star, every
   * four-star off a banner, the gacha-shop and event weapons — is copies you
   * either have or wish for, and typing a number here would have the planner
   * cost out a wish. So it reads what the account holds and stops being a
   * control. The stored value is left exactly as it is: nothing is rewritten
   * because a field went quiet.
   */
  const plannableRefinement =
    weaponId !== '' && options.forgeable.includes(Number(weaponId));

  const twoPlusTwo = (setIds?.[1] ?? '') !== '';
  const [showSecondSet, setShowSecondSet] = useState(twoPlusTwo);

  const setName = (value: string) =>
    [...options.sets.suggested, ...options.sets.all].find((set) => set.value === value)?.name;

  const propInfo = (prop: string) =>
    options.goalProps.find((entry) => entry.value === prop) ?? null;

  /** Met, close or short — the same three verdicts the planner reports. */
  const verdict = (prop: string, min: string) => {
    const info = propInfo(prop);
    const threshold = Number(min);
    if (!info || !min || !Number.isFinite(threshold) || threshold <= 0) return null;
    if (info.currentValue >= threshold) return 'met' as const;
    return info.currentValue >= threshold * 0.95 ? 'close' as const : 'short' as const;
  };

  const statedGoals = (goals ?? []).filter((goal) => goal?.prop && goal?.min).length;
  const format = useFormatter();
  const chosenStats = SLOTS.filter((slot) => mainStats?.[slot.key]).length;
  const chosenSubstats = (substats ?? []).filter(Boolean).length;
  const plannedSet = setName(setIds?.[0] ?? '');

  return (
    <form onSubmit={save} className="space-y-4">
      {/* Identity on its own line: the role decides which goal a team slot
          picks up, and which template fills the rest of this page in. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 card px-4 py-3">
        <label className="flex items-center gap-2">
          <span className="font-mono text-2xs uppercase tracking-wide text-muted">{t('roleLabel')}</span>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <FieldSelect
                name={field.name}
                label={t('roleLabel')}
                value={field.value}
                onValueChange={field.onChange}
                onBlur={field.onBlur}
                placeholder={t('noRole')}
                groups={[{ options: options.roles }]}
                triggerClassName="w-auto py-1.5"
              />
            )}
          />
        </label>
        {/* Explains what the role is for, which a phone already has to take
            on faith once — the selector next to it is the control that
            actually does something, so it's what stays below `sm`. */}
        <p className="hidden min-w-48 flex-1 text-xs leading-relaxed text-muted sm:block">
          {t('roleHint')}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          icon={<Gauge size={14} />}
          title={t('progressPanelTitle')}
          summary={t('progressSummary', {
            level: values.current.level, target: targetLevel, constellation: values.current.constellation,
          })}
          className="lg:col-span-5"
        >
          {/* One grid for level and the three talents: they are the same
              question — where it is, where it ends — asked four times. */}
          <div className="grid grid-cols-[minmax(3.5rem,auto)_1fr_1fr] items-start gap-x-2 gap-y-2 sm:gap-x-3">
            <span />
            <Column>{t('todayColumn')}</Column>
            <Column>{t('targetColumn')}</Column>

            <RowLabel>{t('levelRow')}</RowLabel>
            <Today>
              {values.current.level}{values.current.ascended && '+'}
            </Today>
            <LevelCell
              control={form.control}
              name="targetLevel"
              label={t('targetLevelAria')}
              level={targetLevel}
              min={values.current.level}
              ascendedField={form.register('targetAscended')}
              ascendedDefault={defaults.targetAscended}
            />

            {TALENTS.map((talent) => (
              <TalentRow
                key={talent}
                talent={talent}
                label={talentLabel(talent)}
                today={values.current.talents[talent]}
                control={form.control}
              />
            ))}
          </div>

          <p className="mb-1.5 mt-4 flex items-baseline justify-between gap-2 font-mono text-2xs uppercase tracking-wide text-muted">
            {t('constellationLabel')}
            <span className="text-sm text-text">C{values.current.constellation}</span>
          </p>

          {/* Where the character is comes from the account's own record of
              itself, so there is nothing to type here — only somewhere to go
              when it is out of date. */}
          <p className="mt-3 text-2xs leading-relaxed text-muted">
            {t('importHint')}{' '}
            <Link
              href={`/${locale}/data/import`}
              className="underline decoration-edge-strong underline-offset-2 hover:text-accent"
            >
              {t('reimportLink')}
            </Link>{' '}
            {t('importHintSuffix')}
          </p>
        </Panel>

        <Panel
          icon={<Shield size={14} />}
          title={t('gearPanelTitle')}
          summary={plannedSet ? `${plannedSet} · ${showSecondSet ? '2+2' : '4pc'}` : t('gearSummaryNoSet')}
          className="lg:col-span-7"
        >
          <div className="space-y-4">
            <div>
              <FieldLabel>{t('targetWeaponLabel')}</FieldLabel>
              <div className="flex flex-wrap items-end gap-2">
                {/* Controlled, unlike a registered field: the refinement
                    control beside it changes shape with what is picked here,
                    and a registered select only tells the form its value on
                    submit — the render next to it never hears about it. */}
                <Controller
                  control={form.control}
                  name="weaponId"
                  render={({ field }) => (
                    <FieldSelect
                      name={field.name}
                      label={t('targetWeaponLabel')}
                      value={field.value}
                      onValueChange={field.onChange}
                      onBlur={field.onBlur}
                      placeholder={t('weaponPlaceholder')}
                      groups={[
                        ...(options.weapons.suggested.length > 0
                          ? [{ label: t('suggestedForCharacter'), options: options.weapons.suggested }]
                          : []),
                        { label: t('allOption'), options: options.weapons.all },
                      ]}
                      triggerClassName="min-w-48 flex-1"
                    />
                  )}
                />
                <Controller
                  control={form.control}
                  name="weaponRefinement"
                  render={({ field }) => (plannableRefinement ? (
                    <Stepper
                      label={t('weaponRefinementAria')}
                      value={Number(field.value)}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      min={1}
                      max={5}
                      prefix="R"
                      className="w-24"
                    />
                  ) : (
                    <span
                      className="tabular card-2 w-24 px-2 py-2 text-center font-mono text-sm text-muted"
                      title={t('refinementNotPlannable')}
                    >
                      R{Number(field.value)}
                    </span>
                  ))}
                />
              </div>
              {weaponId !== '' && !plannableRefinement && (
                <p className="mt-1.5 font-mono text-2xs text-muted">
                  {t('refinementNotPlannable')}
                </p>
              )}
              {values.equippedWeapon && (
                <p className="mt-1.5 font-mono text-2xs text-muted">
                  {t('equippedNow')} <span className="text-text">{values.equippedWeapon}</span>
                </p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <FieldLabel className="mb-0">{t('artifactSetLabel')}</FieldLabel>
                <div className="flex overflow-hidden rounded border border-edge">
                  <Segment
                    active={!showSecondSet}
                    onClick={() => {
                      setShowSecondSet(false);
                      // The picker is gone, so the value behind it has to go
                      // too, or a 2+2 stays saved with one half invisible.
                      form.setValue('setIds.1', '', { shouldDirty: true });
                    }}
                    label={t('fourPieces')}
                  />
                  <Segment
                    active={showSecondSet}
                    onClick={() => setShowSecondSet(true)}
                    label={t('twoPlusTwo')}
                  />
                </div>
              </div>

              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="setIds.0"
                  render={({ field }) => (
                    <SetPicker
                      label={t('firstSetAria')}
                      options={options.sets}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder={t('chooseSetPlaceholder')}
                      activePieces={showSecondSet ? 2 : 4}
                    />
                  )}
                />
                {showSecondSet && (
                  <Controller
                    control={form.control}
                    name="setIds.1"
                    render={({ field }) => (
                      <SetPicker
                        label={t('secondSetAria')}
                        options={options.sets}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t('secondSetPlaceholder')}
                        activePieces={2}
                      />
                    )}
                  />
                )}
              </div>
            </div>

            <div>
              <FieldLabel count={`${chosenStats}/3`}>{t('mainStatsLabel')}</FieldLabel>
              <div className="grid min-w-0 grid-cols-3 gap-2">
                {SLOTS.map((slot) => (
                  <label key={slot.key} className="min-w-0">
                    <span className="mb-1 block truncate text-2xs text-muted">
                      {slotLabel(slot.key)}
                    </span>
                    <Controller
                      control={form.control}
                      name={`mainStats.${slot.key}`}
                      render={({ field }) => (
                        <FieldSelect
                          name={field.name}
                          label={t('mainStatSlotAria', { slot: slotLabel(slot.key) })}
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="—"
                          groups={[{ options: options.mainStatsBySlot[slot.key] ?? [] }]}
                          triggerClassName="px-2 py-1.5 text-xs"
                        />
                      )}
                    />
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel count={`${chosenSubstats}/4`} hint={t('substatsHint')}>
                {t('substatsLabel')}
              </FieldLabel>
              {/* Two by two on a phone, four across from `sm`: four stacked
                  selects is the shape that read as a questionnaire. */}
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                {SUBSTAT_POSITIONS.map((position) => (
                  <div key={position} className="flex min-w-0 items-center gap-1.5">
                    <span className="w-4 shrink-0 font-mono text-2xs text-muted">
                      {position}º
                    </span>
                    <Controller
                      control={form.control}
                      name={`substats.${position - 1}`}
                      render={({ field }) => (
                        <FieldSelect
                          name={field.name}
                          label={t('substatPositionAria', { position })}
                          value={field.value ?? ''}
                          onValueChange={field.onChange}
                          onBlur={field.onBlur}
                          placeholder="—"
                          groups={[{ options: options.substats }]}
                          triggerClassName="px-1.5 py-1.5 text-xs"
                        />
                      )}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          icon={<Target size={14} />}
          title={t('statGoalsTitle')}
          summary={statedGoals === 0 ? t('noneGoals') : t('thresholdsCount', { count: statedGoals })}
          className="lg:col-span-12"
        >
          <p className="mb-3 max-w-prose text-xs leading-relaxed text-muted">
            {t('statGoalsHint')}
          </p>

          {/* A card per threshold: what it is and a way out on top, the stat
              across the card, then the number — dragged or typed — and how
              far today is from it. The old row packed all four across one
              line, which on a phone left a picker too narrow to read its own
              choice. */}
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {goalRows.fields.map((row, index) => {
              const prop = goals?.[index]?.prop ?? '';
              const min = goals?.[index]?.min ?? '';
              const info = prop ? propInfo(prop) : null;
              const status = verdict(prop, min);
              const range = goalRange(prop, info?.currentValue ?? 0);

              return (
                <li
                  key={row.id}
                  className="flex min-w-0 flex-col gap-3 rounded-lg border border-edge bg-surface p-3 transition-colors hover:border-accent/50"
                >
                  <div className="flex items-center gap-2">
                    <span className={`min-w-0 flex-1 truncate text-sm ${info ? '' : 'text-muted'}`}>
                      {info?.label ?? t('newGoal')}
                    </span>
                    {goalRows.fields.length > 1 && (
                      <button
                        type="button"
                        onClick={() => goalRows.remove(index)}
                        aria-label={t('removeGoalAria', { n: index + 1 })}
                        className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'shrink-0 text-muted hover:text-bad' })}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  <Controller
                    control={form.control}
                    name={`goals.${index}.prop`}
                    render={({ field }) => (
                      <FieldSelect
                        name={field.name}
                        label={t('goalStatAria', { n: index + 1 })}
                        value={field.value ?? ''}
                        onValueChange={field.onChange}
                        onBlur={field.onBlur}
                        placeholder={t('chooseStatPlaceholder')}
                        groups={[{ options: options.goalProps }]}
                        triggerClassName="w-full px-2 py-1.5 text-xs"
                      />
                    )}
                  />

                  {/* One value, two ways to set it: the slider for a rough
                      number, the field for an exact one. A typed value past
                      the slider's end is kept as typed; the thumb just rests
                      at the end. */}
                  <Controller
                    control={form.control}
                    name={`goals.${index}.min`}
                    render={({ field }) => {
                      const typed = Number(field.value);
                      const position = field.value === '' || !Number.isFinite(typed)
                        ? range.min
                        : Math.min(range.max, Math.max(range.min, typed));

                      return (
                        <div className="flex items-center gap-3">
                          <Slider
                            aria-label={t('goalMinAria', { n: index + 1 })}
                            min={range.min}
                            max={range.max}
                            step={range.step}
                            value={position}
                            disabled={!prop}
                            onValueChange={(next) => field.onChange(String(next))}
                            className="min-w-0 flex-1"
                          />
                          <span className="field flex w-24 shrink-0 items-center gap-0.5 px-2 py-1 focus-within:border-accent">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              inputMode="decimal"
                              name={field.name}
                              ref={field.ref}
                              value={field.value ?? ''}
                              onChange={(event) => field.onChange(event.target.value)}
                              onBlur={field.onBlur}
                              placeholder={t('minPlaceholder')}
                              aria-label={t('goalMinAria', { n: index + 1 })}
                              className="tabular min-w-0 flex-1 bg-transparent text-right font-mono text-xs outline-none"
                            />
                            {prop && range.unit && (
                              <span className="font-mono text-2xs text-muted">{range.unit}</span>
                            )}
                          </span>
                        </div>
                      );
                    }}
                  />

                  <div className="flex items-center justify-between gap-2">
                    <Verdict status={status} current={info?.current} />
                    {prop && (
                      <span className="tabular shrink-0 font-mono text-2xs text-muted">
                        {format.number(range.min)}–{format.number(range.max)}{range.unit}
                      </span>
                    )}
                  </div>
                </li>
              );
            })}

            {goalRows.fields.length < MAX_GOAL_ROWS && (
              <li>
                <button
                  type="button"
                  onClick={() => goalRows.append({ prop: '', min: '' })}
                  className="flex h-full min-h-36 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-edge text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  <Plus size={14} /> {t('addGoal')}
                </button>
              </li>
            )}
          </ul>
        </Panel>
      </div>

      {/* Stuck to the bottom on a phone, where the thumb is; a plain panel from
          `sm`, where the end of the form is already on screen. It stops above
          the section bar rather than under it — see `--section-nav-height`.
          One row, never two: nothing here wraps, so every piece is either a
          fixed-size icon or set to shrink and truncate instead of forcing the
          bar wider than the screen. The delete button is a sibling of the
          group rather than an `ml-auto` item inside it for the same reason —
          see the fix two commits back for the auto-margin/flex-wrap bug that
          left it hanging off the edge. */}
      <div data-sticky-save className="glass sticky bottom-[var(--section-nav-height)] -mx-4 flex items-center gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:rounded-card sm:border sm:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button
            variant="default"
            type="submit"
            size="icon"
            aria-label={form.formState.isSubmitting ? t('saving') : t('saveGoal')}
            title={form.formState.isSubmitting ? t('saving') : t('saveGoal')}
            disabled={form.formState.isSubmitting || busy !== null}
          >
            <Save size={16} />
          </Button>

          {values.buildId && (
            <button
              type="button"
              onClick={fillFromRole}
              disabled={form.formState.isSubmitting || busy !== null}
              aria-label={busy === 'template' ? t('filling') : t('fillFromRole')}
              title={t('fillFromRoleTitle')}
              className="flex shrink-0 items-center gap-2 rounded border border-edge px-2 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-50 sm:px-3"
            >
              <Sparkles size={14} />
              <span className="max-sm:hidden">
                {busy === 'template' ? t('filling') : t('fillFromRole')}
              </span>
            </button>
          )}

          <ActionStatus state={state} className="min-w-0 truncate font-mono text-xs" />
        </div>

        {values.buildId && (
          <button
            type="button"
            onClick={remove}
            disabled={form.formState.isSubmitting || busy !== null}
            aria-label={t('deleteGoalAria')}
            title={t('deleteGoalAria')}
            className="shrink-0 rounded border border-edge p-2 text-muted transition-colors hover:border-bad hover:text-bad disabled:opacity-50"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </form>
  );
}

/* ------------------------------------------------------------ pieces --- */

/**
 * A section, with its own answer in the header.
 *
 * The summary is what turns a long form into something skimmable: the page's
 * state reads off the titles alone, and it moves as the form is filled in.
 */
function Panel({
  icon,
  title,
  summary,
  className,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  summary?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`min-w-0 card ${className ?? ''}`}>
      <header className="flex items-baseline gap-2 border-b border-edge px-4 py-2.5">
        <span className="self-center text-accent">{icon}</span>
        <h3 className="font-mono text-xs uppercase tracking-wide text-accent">{title}</h3>
        {summary && (
          <span className="tabular ml-auto min-w-0 truncate font-mono text-2xs text-muted">
            {summary}
          </span>
        )}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function FieldLabel({
  children,
  count,
  hint,
  className,
}: {
  children: React.ReactNode;
  count?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <p className={`mb-1.5 flex flex-wrap items-baseline gap-x-2 ${className ?? ''}`}>
      <span className="font-mono text-2xs uppercase tracking-wide text-muted">
        {children}
      </span>
      {count && <span className="tabular font-mono text-2xs text-muted">{count}</span>}
      {hint && <span className="text-2xs text-muted">{hint}</span>}
    </p>
  );
}

const Column = ({ children }: { children: React.ReactNode }) => (
  <span className="text-center font-mono text-2xs uppercase tracking-wide text-muted">
    {children}
  </span>
);

const RowLabel = ({ children }: { children: React.ReactNode }) => (
  <span className="self-center truncate text-xs text-muted">{children}</span>
);

function Segment({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border-r border-edge px-2.5 py-1 text-2xs transition-colors last:border-r-0 ${
        active ? 'bg-surface-2 text-accent' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

/** Cumplido, cerca o corto — the three verdicts the planner itself reports. */
/**
 * Where a threshold's slider runs, per stat.
 *
 * Wide enough for any build worth planning and narrow enough that a drag lands
 * on a sensible number: a slider from 0 to 60 000 HP moves in steps nobody
 * could aim. Percentages are in the same scale the field takes — 70 is 70%. A
 * character already past the end widens it, so today's value is always on it.
 */
function goalRange(prop: string, current: number) {
  const base = prop === 'FIGHT_PROP_HP' ? { min: 10000, max: 60000, step: 500, unit: '' }
    : prop === 'FIGHT_PROP_ATTACK' || prop === 'FIGHT_PROP_DEFENSE'
      ? { min: 500, max: 4000, step: 50, unit: '' }
      : prop === 'FIGHT_PROP_ELEMENT_MASTERY' ? { min: 0, max: 1200, step: 10, unit: '' }
        : prop === 'FIGHT_PROP_CHARGE_EFFICIENCY' ? { min: 100, max: 300, step: 5, unit: '%' }
          : prop === 'FIGHT_PROP_CRITICAL' ? { min: 5, max: 100, step: 1, unit: '%' }
            : prop === 'FIGHT_PROP_CRITICAL_HURT' ? { min: 50, max: 300, step: 1, unit: '%' }
              : { min: 0, max: 100, step: 1, unit: '%' };

  const reach = Math.ceil(current / base.step) * base.step;
  return { ...base, max: Math.max(base.max, reach) };
}

function Verdict({
  status,
  current,
}: {
  status: 'met' | 'close' | 'short' | null;
  current: string | null | undefined;
}) {
  const t = useTranslations('build');
  if (!current) return <span className="text-2xs text-muted">{t('noStatCurrent')}</span>;

  const tone = status === 'met'
    ? 'text-good'
    : status === 'close'
      ? 'text-warn'
      : status === 'short' ? 'text-bad' : 'text-muted';

  return (
    <span className={`flex min-w-0 items-center gap-1 font-mono text-2xs ${tone}`}>
      {status === 'met' && <Check size={12} className="shrink-0" />}
      {status === 'close' && <CircleAlert size={12} className="shrink-0" />}
      {status === 'short' && <X size={12} className="shrink-0" />}
      <span className="tabular truncate">{t('todayPrefix', { value: current })}</span>
    </span>
  );
}

/** A select whose first group is what the engine would pick, in its order. */

/**
 * A level, with the ascension it implies.
 *
 * The ascension is derived rather than asked for, except at the six levels
 * where the game allows both — there the checkbox appears, and nowhere else.
 */
function LevelCell({
  control,
  name,
  label,
  level,
  min,
  ascendedField,
  ascendedDefault,
}: {
  control: ProgressControl;
  name: 'targetLevel';
  label: string;
  level: number;
  /** The character's level today: a target cannot undo levelling already done. */
  min: number;
  ascendedField: UseFormRegisterReturn;
  ascendedDefault: boolean;
}) {
  const t = useTranslations('build');
  return (
    <div className="min-w-0">
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <Stepper
            label={label}
            value={Number(field.value)}
            onChange={field.onChange}
            onBlur={field.onBlur}
            min={min}
            max={90}
          />
        )}
      />
      {BREAKPOINTS.has(level) && (
        <label className="mt-1 flex cursor-pointer items-center justify-center gap-1 font-mono text-2xs text-muted">
          <input
            type="checkbox"
            {...ascendedField}
            defaultChecked={ascendedDefault}
            className="accent-accent"
          />
          {t('ascendedLabel')}
        </label>
      )}
    </div>
  );
}

/** A fact from the last import, shown where its stepper used to be. */
function Today({ children }: { children: React.ReactNode }) {
  return (
    <span className="tabular flex items-center justify-center py-1.5 font-mono text-sm text-muted">
      {children}
    </span>
  );
}

function TalentRow({
  talent,
  label,
  today,
  control,
}: {
  talent: (typeof TALENTS)[number];
  label: string;
  today: number;
  control: ProgressControl;
}) {
  const t = useTranslations('build');
  return (
    <>
      <RowLabel>{label}</RowLabel>
      <Today>{today}</Today>
      {(['targetTalents'] as const).map((group) => (
        <Controller
          key={group}
          control={control}
          name={`${group}.${talent}`}
          render={({ field }) => (
            <Stepper
              label={t('targetTalentAria', { talent: label })}
              value={Number(field.value)}
              onChange={field.onChange}
              onBlur={field.onBlur}
              min={today}
              max={10}
            />
          )}
        />
      ))}
    </>
  );
}

/**
 * A number with the two buttons a phone can actually hit.
 *
 * The input keeps `type="number"` so a phone raises its numeric keypad, and
 * the buttons exist because nobody wants to type a talent level.
 */
function Stepper({
  label,
  value,
  onChange,
  onBlur,
  min,
  max,
  prefix,
  className,
}: {
  /** What this one counts. Six steppers sit in one grid and only their column and row tell them apart, which is nothing a screen reader or a test can use. */
  label: string;
  value: number;
  onChange: (value: number) => void;
  onBlur?: () => void;
  min: number;
  max: number;
  prefix?: string;
  className?: string;
}) {
  const t = useTranslations('build');
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  return (
    <div
      className={`flex min-w-0 items-stretch overflow-hidden field focus-within:border-accent ${
        className ?? ''
      }`}
    >
      <button
        type="button"
        onClick={() => set(value - 1)}
        aria-label={t('decreaseAria', { label })}
        className="flex shrink-0 items-center px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30"
        disabled={value <= min}
      >
        <Minus size={12} />
      </button>
      <span className="flex min-w-0 flex-1 items-center justify-center">
        {prefix && <span className="font-mono text-2xs text-muted">{prefix}</span>}
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(event) => set(Number(event.target.value))}
          onBlur={onBlur}
          min={min}
          max={max}
          className="tabular w-full min-w-0 bg-transparent py-1.5 text-center font-mono text-sm"
        />
      </span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        aria-label={t('increaseAria', { label })}
        className="flex shrink-0 items-center px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30"
        disabled={value >= max}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
