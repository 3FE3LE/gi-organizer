'use client';

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

const SLOTS = [
  { key: 'sands', label: 'Arena' },
  { key: 'goblet', label: 'Cáliz' },
  { key: 'circlet', label: 'Diadema' },
];

const TALENTS = [
  { key: 'auto', label: 'Normal' },
  { key: 'skill', label: 'Habilidad' },
  { key: 'burst', label: 'Definitiva' },
] as const;

function defaultsFrom(values: ProgressValues): ProgressFormValues {
  return {
    characterId: values.characterId,
    buildId: values.buildId ?? '',
    role: values.role ?? '',
    substats: SUBSTAT_POSITIONS.map((position) => values.substats[position - 1] ?? ''),
    targetLevel: values.target.level,
    targetAscended: values.target.ascended,
    targetTalents: values.target.talents,
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
  const chosenStats = SLOTS.filter((slot) => mainStats?.[slot.key]).length;
  const chosenSubstats = (substats ?? []).filter(Boolean).length;
  const plannedSet = setName(setIds?.[0] ?? '');

  return (
    <form onSubmit={save} className="space-y-4">
      {/* Identity on its own line: the role decides which goal a team slot
          picks up, and which template fills the rest of this page in. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-edge bg-surface px-4 py-3">
        <label className="flex items-center gap-2">
          <span className="font-mono text-[0.65rem] uppercase tracking-wide text-muted">Rol</span>
          <select
            {...form.register('role')}
            defaultValue={defaults.role}
            className="rounded border border-edge bg-ink px-2 py-1.5 text-sm focus:border-accent focus:outline-none"
          >
            <option value="">sin rol</option>
            {options.roles.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <p className="min-w-48 flex-1 text-xs leading-relaxed text-muted">
          Un personaje tiene un objetivo por rol, y el rol es su identidad: es lo que un
          slot de equipo busca, y lo que decide los umbrales y substats de partida.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Panel
          icon={<Gauge size={14} />}
          title="Progreso"
          summary={`Nv. ${values.current.level} → ${targetLevel} · C${values.current.constellation}`}
          className="lg:col-span-5"
        >
          {/* One grid for level and the three talents: they are the same
              question — where it is, where it ends — asked four times. */}
          <div className="grid grid-cols-[minmax(3.5rem,auto)_1fr_1fr] items-start gap-x-2 gap-y-2 sm:gap-x-3">
            <span />
            <Column>hoy</Column>
            <Column>meta</Column>

            <RowLabel>Nivel</RowLabel>
            <Today>
              {values.current.level}{values.current.ascended && '+'}
            </Today>
            <LevelCell
              control={form.control}
              name="targetLevel"
              label="nivel objetivo"
              level={targetLevel}
              ascendedField={form.register('targetAscended')}
              ascendedDefault={defaults.targetAscended}
            />

            {TALENTS.map((talent) => (
              <TalentRow
                key={talent.key}
                talent={talent}
                today={values.current.talents[talent.key]}
                control={form.control}
              />
            ))}
          </div>

          <p className="mb-1.5 mt-4 flex items-baseline justify-between gap-2 font-mono text-[0.6rem] uppercase tracking-wide text-muted">
            Constelación
            <span className="text-sm text-text">C{values.current.constellation}</span>
          </p>

          {/* Where the character is comes from the account's own record of
              itself, so there is nothing to type here — only somewhere to go
              when it is out of date. */}
          <p className="mt-3 text-[0.7rem] leading-relaxed text-muted">
            Nivel, constelación y talentos salen del último import.{' '}
            <Link
              href={`/${locale}/data/import`}
              className="underline decoration-edge-strong underline-offset-2 hover:text-accent"
            >
              Reimporta tu GOOD
            </Link>{' '}
            para actualizarlos.
          </p>
        </Panel>

        <Panel
          icon={<Shield size={14} />}
          title="Equipamiento"
          summary={plannedSet ? `${plannedSet} · ${showSecondSet ? '2+2' : '4pc'}` : 'sin set'}
          className="lg:col-span-7"
        >
          <div className="space-y-4">
            <div>
              <FieldLabel>Arma objetivo</FieldLabel>
              <div className="flex flex-wrap items-end gap-2">
                <Ranked
                  field={form.register('weaponId')}
                  defaultValue={defaults.weaponId}
                  placeholder="sin arma objetivo…"
                  options={options.weapons}
                  className="min-w-48 flex-1 rounded border border-edge bg-ink px-2 py-2 text-sm"
                />
                <Controller
                  control={form.control}
                  name="weaponRefinement"
                  render={({ field }) => (
                    <Stepper
                      label="refinamiento del arma objetivo"
                      value={Number(field.value)}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      min={1}
                      max={5}
                      prefix="R"
                      className="w-24"
                    />
                  )}
                />
              </div>
              {values.equippedWeapon && (
                <p className="mt-1.5 font-mono text-[0.65rem] text-muted">
                  lleva ahora: <span className="text-text">{values.equippedWeapon}</span>
                </p>
              )}
            </div>

            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <FieldLabel className="mb-0">Set de artefactos</FieldLabel>
                <div className="flex overflow-hidden rounded border border-edge">
                  <Segment
                    active={!showSecondSet}
                    onClick={() => {
                      setShowSecondSet(false);
                      // The picker is gone, so the value behind it has to go
                      // too, or a 2+2 stays saved with one half invisible.
                      form.setValue('setIds.1', '', { shouldDirty: true });
                    }}
                    label="4 piezas"
                  />
                  <Segment
                    active={showSecondSet}
                    onClick={() => setShowSecondSet(true)}
                    label="2 + 2"
                  />
                </div>
              </div>

              <div className="grid min-w-0 gap-2 sm:grid-cols-2">
                <Controller
                  control={form.control}
                  name="setIds.0"
                  render={({ field }) => (
                    <SetPicker
                      label="primer set del plan"
                      options={options.sets}
                      value={field.value}
                      onChange={field.onChange}
                      placeholder="elige un set…"
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
                        label="segundo set del plan"
                        options={options.sets}
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="segundo set…"
                        activePieces={2}
                      />
                    )}
                  />
                )}
              </div>
            </div>

            <div>
              <FieldLabel count={`${chosenStats}/3`}>Main stats</FieldLabel>
              <div className="grid min-w-0 grid-cols-3 gap-2">
                {SLOTS.map((slot) => (
                  <label key={slot.key} className="min-w-0">
                    <span className="mb-1 block truncate text-[0.65rem] text-muted">
                      {slot.label}
                    </span>
                    <select
                      {...form.register(`mainStats.${slot.key}`)}
                      defaultValue={defaults.mainStats[slot.key]}
                      className="w-full min-w-0 rounded border border-edge bg-ink px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
                    >
                      <option value="">—</option>
                      {(options.mainStatsBySlot[slot.key] ?? []).map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <FieldLabel count={`${chosenSubstats}/4`} hint="ordenan las candidatas de cada slot">
                Substats por prioridad
              </FieldLabel>
              {/* Two by two on a phone, four across from `sm`: four stacked
                  selects is the shape that read as a questionnaire. */}
              <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
                {SUBSTAT_POSITIONS.map((position) => (
                  <div key={position} className="flex min-w-0 items-center gap-1.5">
                    <span className="w-4 shrink-0 font-mono text-[0.65rem] text-muted">
                      {position}º
                    </span>
                    <select
                      {...form.register(`substats.${position - 1}`)}
                      defaultValue={defaults.substats[position - 1]}
                      className="w-full min-w-0 rounded border border-edge bg-ink px-1.5 py-1.5 text-xs focus:border-accent focus:outline-none"
                    >
                      <option value="">—</option>
                      {options.substats.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <Panel
          icon={<Target size={14} />}
          title="Objetivos de stats"
          summary={statedGoals === 0
            ? 'ninguno'
            : `${statedGoals} umbral${statedGoals === 1 ? '' : 'es'}`}
          className="lg:col-span-12"
        >
          <p className="mb-3 max-w-prose text-xs leading-relaxed text-muted">
            El total que quieres alcanzar, no el reparto por pieza. Cada cambio se juzga
            contra esto: cumplido, cerca o corto. Con dos o tres basta — Furina es vida,
            prob. crítico y daño crítico; Sacarosa, mil de maestría y poco más.
          </p>

          {/* A grid, not a list: three thresholds side by side is a plan you
              read at a glance; three stacked rows is a queue you work through. */}
          <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {goalRows.fields.map((row, index) => {
              const prop = goals?.[index]?.prop ?? '';
              const status = verdict(prop, goals?.[index]?.min ?? '');

              return (
                <li
                  key={row.id}
                  className="flex min-w-0 items-start gap-2 rounded border border-edge bg-ink/40 p-2"
                >
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <select
                      {...form.register(`goals.${index}.prop`)}
                      defaultValue={defaults.goals[index]?.prop ?? ''}
                      className="w-full min-w-0 rounded border border-edge bg-ink px-2 py-1.5 text-xs focus:border-accent focus:outline-none"
                    >
                      <option value="">elige un stat…</option>
                      {options.goalProps.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.1"
                        min="0"
                        inputMode="decimal"
                        {...form.register(`goals.${index}.min`)}
                        defaultValue={defaults.goals[index]?.min ?? ''}
                        placeholder="mínimo"
                        className="tabular w-20 shrink-0 rounded border border-edge bg-ink px-2 py-1 text-right font-mono text-xs focus:border-accent focus:outline-none"
                      />
                      <Verdict status={status} current={prop ? propInfo(prop)?.current : null} />
                    </div>
                  </div>

                  {goalRows.fields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => goalRows.remove(index)}
                      aria-label={`Quitar el objetivo ${index + 1}`}
                      className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-surface-2 hover:text-bad"
                    >
                      <X size={14} />
                    </button>
                  )}
                </li>
              );
            })}

            {goalRows.fields.length < MAX_GOAL_ROWS && (
              <li>
                <button
                  type="button"
                  onClick={() => goalRows.append({ prop: '', min: '' })}
                  className="flex h-full min-h-20 w-full items-center justify-center gap-2 rounded border border-dashed border-edge text-xs text-muted transition-colors hover:border-accent hover:text-accent"
                >
                  <Plus size={14} /> otro objetivo
                </button>
              </li>
            )}
          </ul>
        </Panel>
      </div>

      {/* Stuck to the bottom on a phone, where the thumb is; a plain panel from
          `sm`, where the end of the form is already on screen. */}
      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-2 border-t border-edge bg-ink/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-lg sm:border sm:bg-surface sm:backdrop-blur-none">
        <button
          type="submit"
          disabled={form.formState.isSubmitting || busy !== null}
          className="flex items-center gap-2 rounded border border-accent px-3 py-1.5 text-sm text-accent transition-colors hover:bg-surface-2 disabled:opacity-50"
        >
          <Save size={14} />
          {form.formState.isSubmitting ? 'Guardando…' : 'Guardar objetivo'}
        </button>

        {values.buildId && (
          <button
            type="button"
            onClick={fillFromRole}
            disabled={form.formState.isSubmitting || busy !== null}
            title="Vuelve a rellenar set, main stats, substats, arma y umbrales con lo que pide el rol elegido"
            className="flex items-center gap-2 rounded border border-edge px-3 py-1.5 text-sm text-muted transition-colors hover:border-accent hover:text-text disabled:opacity-50"
          >
            <Sparkles size={14} />
            {busy === 'template' ? 'Rellenando…' : 'Rellenar desde el rol'}
          </button>
        )}

        {state.status !== 'idle' && (
          <span
            className={`font-mono text-xs ${
              state.status === 'ok' ? 'text-muted' : 'text-accent'
            }`}
          >
            {state.message}
          </span>
        )}

        {values.buildId && (
          <button
            type="button"
            onClick={remove}
            disabled={form.formState.isSubmitting || busy !== null}
            aria-label="Borrar este objetivo"
            title="Borrar este objetivo"
            className="ml-auto rounded border border-edge p-2 text-muted transition-colors hover:border-bad hover:text-bad disabled:opacity-50"
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
    <section className={`min-w-0 rounded-lg border border-edge bg-surface ${className ?? ''}`}>
      <header className="flex items-baseline gap-2 border-b border-edge px-4 py-2.5">
        <span className="self-center text-accent">{icon}</span>
        <h3 className="font-mono text-xs uppercase tracking-wide text-accent">{title}</h3>
        {summary && (
          <span className="tabular ml-auto min-w-0 truncate font-mono text-[0.65rem] text-muted">
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
      <span className="font-mono text-[0.6rem] uppercase tracking-wide text-muted">
        {children}
      </span>
      {count && <span className="tabular font-mono text-[0.6rem] text-muted">{count}</span>}
      {hint && <span className="text-[0.65rem] text-muted/70">{hint}</span>}
    </p>
  );
}

const Column = ({ children }: { children: React.ReactNode }) => (
  <span className="text-center font-mono text-[0.6rem] uppercase tracking-wide text-muted">
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
      className={`border-r border-edge px-2.5 py-1 text-[0.7rem] transition-colors last:border-r-0 ${
        active ? 'bg-surface-2 text-accent' : 'text-muted hover:text-text'
      }`}
    >
      {label}
    </button>
  );
}

/** Cumplido, cerca o corto — the three verdicts the planner itself reports. */
function Verdict({
  status,
  current,
}: {
  status: 'met' | 'close' | 'short' | null;
  current: string | null | undefined;
}) {
  if (!current) return <span className="text-[0.65rem] text-muted/60">sin stat</span>;

  const tone = status === 'met'
    ? 'text-good'
    : status === 'close'
      ? 'text-warn'
      : status === 'short' ? 'text-bad' : 'text-muted';

  return (
    <span className={`flex min-w-0 items-center gap-1 font-mono text-[0.65rem] ${tone}`}>
      {status === 'met' && <Check size={12} className="shrink-0" />}
      {status === 'close' && <CircleAlert size={12} className="shrink-0" />}
      {status === 'short' && <X size={12} className="shrink-0" />}
      <span className="tabular truncate">hoy {current}</span>
    </span>
  );
}

/** A select whose first group is what the engine would pick, in its order. */
function Ranked({
  field,
  defaultValue,
  placeholder,
  options,
  className,
}: {
  field: UseFormRegisterReturn;
  defaultValue: string;
  placeholder: string;
  options: RankedOptions;
  className: string;
}) {
  return (
    <select
      {...field}
      defaultValue={defaultValue}
      className={`min-w-0 focus:border-accent focus:outline-none ${className}`}
    >
      <option value="">{placeholder}</option>

      {options.suggested.length > 0 && (
        <optgroup label="Sugeridos para este personaje">
          {options.suggested.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </optgroup>
      )}

      <optgroup label="Todos">
        {options.all.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </optgroup>
    </select>
  );
}

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
  ascendedField,
  ascendedDefault,
}: {
  control: ProgressControl;
  name: 'targetLevel';
  label: string;
  level: number;
  ascendedField: UseFormRegisterReturn;
  ascendedDefault: boolean;
}) {
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
            min={1}
            max={90}
          />
        )}
      />
      {BREAKPOINTS.has(level) && (
        <label className="mt-1 flex cursor-pointer items-center justify-center gap-1 font-mono text-[0.6rem] text-muted">
          <input
            type="checkbox"
            {...ascendedField}
            defaultChecked={ascendedDefault}
            className="accent-accent"
          />
          ascendido
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
  today,
  control,
}: {
  talent: (typeof TALENTS)[number];
  today: number;
  control: ProgressControl;
}) {
  return (
    <>
      <RowLabel>{talent.label}</RowLabel>
      <Today>{today}</Today>
      {(['targetTalents'] as const).map((group) => (
        <Controller
          key={group}
          control={control}
          name={`${group}.${talent.key}`}
          render={({ field }) => (
            <Stepper
              label={`objetivo: ${talent.label}`}
              value={Number(field.value)}
              onChange={field.onChange}
              onBlur={field.onBlur}
              min={1}
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
  const set = (next: number) => onChange(Math.min(max, Math.max(min, next)));

  return (
    <div
      className={`flex min-w-0 items-stretch overflow-hidden rounded border border-edge bg-ink focus-within:border-accent ${
        className ?? ''
      }`}
    >
      <button
        type="button"
        onClick={() => set(value - 1)}
        aria-label={`${label}: menos`}
        className="flex shrink-0 items-center px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30"
        disabled={value <= min}
      >
        <Minus size={12} />
      </button>
      <span className="flex min-w-0 flex-1 items-center justify-center">
        {prefix && <span className="font-mono text-[0.65rem] text-muted">{prefix}</span>}
        <input
          type="number"
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(event) => set(Number(event.target.value))}
          onBlur={onBlur}
          min={min}
          max={max}
          className="tabular w-full min-w-0 bg-transparent py-1.5 text-center font-mono text-sm focus:outline-none"
        />
      </span>
      <button
        type="button"
        onClick={() => set(value + 1)}
        aria-label={`${label}: más`}
        className="flex shrink-0 items-center px-2 text-muted transition-colors hover:bg-surface-2 hover:text-text disabled:opacity-30"
        disabled={value >= max}
      >
        <Plus size={12} />
      </button>
    </div>
  );
}
