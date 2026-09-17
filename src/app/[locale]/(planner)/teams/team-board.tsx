'use client';

import { useTranslations } from 'next-intl';
import { useActionState } from 'react';

import { AssetImage } from '@/components/asset-image';
import { TEAM_ROLES, type TeamRole } from '@/lib/rules/types';

import {
  type TeamActionState,
  addSlotAction,
  deleteTeamAction,
  removeSlotAction,
  setDeclarationAction,
  setObjectiveAction,
  setRolesAction,
} from './actions';

export type SlotView = {
  characterId: number;
  name: string;
  icon: string | null;
  element: string;
  elementColor: string;
  roles: TeamRole[];
  /** The build this slot resolved to, which is what everything measures against. */
  buildName: string | null;
  /** Sets currently worn, as `name ×n`. */
  gear: string[];
  /** Equipped weapon, if any. */
  weapon: string | null;
  /** Goals of the resolved build, already evaluated. */
  goals: { label: string; status: string; actual: number; min: number }[];
  buildHref: string;
  declarations: Record<string, string>;
  /** Declarations this slot's gear actually needs, from the active rules. */
  needed: { field: string; options: { value: string; label: string }[] }[];
  findings: { id: string; severity: string; message: string }[];
};

export type TeamView = {
  id: string;
  name: string;
  mode: string;
  objective: string | null;
  slots: SlotView[];
  findings: { id: string; severity: string; message: string }[];
};

/** A character the player owns, and the team that already holds them. */
export type RosterEntry = {
  id: number;
  name: string;
  detail: string;
  inTeam: { id: string; name: string } | null;
};

const ROLES = TEAM_ROLES;

export function TeamBoard({
  team,
  roster,
  objectives,
}: {
  team: TeamView;
  roster: RosterEntry[];
  objectives: { id: string; label: string }[];
}) {
  const t = useTranslations('teams');
  const [addState, add, adding] = useActionState<TeamActionState, FormData>(
    addSlotAction, { status: 'idle' },
  );
  const [removeState, remove] = useActionState<TeamActionState, FormData>(
    deleteTeamAction, { status: 'idle' },
  );

  const state = addState.status !== 'idle' ? addState : removeState;

  return (
    <article className="rounded border border-edge bg-surface">
      <header className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-2">
        <h2 className="text-sm font-medium">{team.name}</h2>
        <span className="font-mono text-xs uppercase text-muted">{team.mode}</span>
        <span className="font-mono text-xs text-muted">{team.slots.length}/4</span>
        <ObjectivePicker teamId={team.id} current={team.objective} objectives={objectives} />
        <div className="ml-auto flex items-center gap-2">
          <form action={remove}>
            <input type="hidden" name="teamId" value={team.id} />
            <button
              type="submit"
              className="rounded border border-edge px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
            >
              {t('deleteButton')}
            </button>
          </form>
        </div>
      </header>

      {state.status !== 'idle' && (
        <p
          className={`border-b border-edge px-4 py-1.5 font-mono text-xs ${
            state.status === 'ok' ? 'text-muted' : 'text-accent'
          }`}
        >
          {state.message}
        </p>
      )}

      {team.findings.length > 0 && (
        <ul className="border-b border-edge px-4 py-2">
          {team.findings.map((finding) => (
            <Finding key={finding.id} finding={finding} />
          ))}
        </ul>
      )}

      {team.slots.length < 4 && (
        <AddMember teamId={team.id} roster={roster} action={add} pending={adding} />
      )}

      <div className="grid gap-px bg-edge sm:grid-cols-2 xl:grid-cols-4">
        {team.slots.map((slot) => (
          <Slot key={slot.characterId} teamId={team.id} slot={slot} />
        ))}
        {Array.from({ length: 4 - team.slots.length }, (_, index) => (
          <div
            key={`empty-${index}`}
            className="flex min-h-44 items-center justify-center bg-surface text-xs text-muted"
          >
            {t('emptySlot')}
          </div>
        ))}
      </div>
    </article>
  );
}

function ObjectivePicker({
  teamId,
  current,
  objectives,
}: {
  teamId: string;
  current: string | null;
  objectives: { id: string; label: string }[];
}) {
  const t = useTranslations('teams');
  const [, save, saving] = useActionState<TeamActionState, FormData>(
    setObjectiveAction, { status: 'idle' },
  );

  return (
    <form action={save} className="flex items-center gap-1">
      <input type="hidden" name="teamId" value={teamId} />
      <select
        name="objective"
        defaultValue={current ?? ''}
        disabled={saving}
        className="rounded border border-edge bg-ink px-2 py-1 text-xs"
      >
        <option value="">{t('noObjective')}</option>
        {objectives.map((objective) => (
          <option key={objective.id} value={objective.id}>{objective.label}</option>
        ))}
      </select>
      <button
        type="submit"
        className="rounded border border-edge px-1.5 py-1 text-xs hover:border-accent"
      >
        ✓
      </button>
    </form>
  );
}

/**
 * Role first, then the character.
 *
 * The order is the point: a slot's role decides which sets get suggested for
 * it, who wins a contested set, and whether a coverage rule sees the member at
 * all. Adding someone and setting the role afterwards means the first thing the
 * screen shows is an answer computed without it.
 */
function AddMember({
  teamId,
  roster,
  action,
  pending,
}: {
  teamId: string;
  roster: RosterEntry[];
  action: (form: FormData) => void;
  pending: boolean;
}) {
  const t = useTranslations('teams');
  const roleLabel = useTranslations('common.role');

  return (
    <form action={action} className="space-y-2 border-b border-edge px-4 py-3">
      <input type="hidden" name="teamId" value={teamId} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t('step1Role')}</span>
        {ROLES.map((role) => (
          <label
            key={role}
            className="cursor-pointer rounded border border-edge px-1.5 py-0.5 text-[0.65rem] text-muted hover:border-accent has-checked:border-accent has-checked:text-accent"
          >
            <input type="checkbox" name="roles" value={role} className="sr-only" />
            {roleLabel(role)}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">{t('step2Character')}</span>
        <select
          name="characterId"
          required
          defaultValue=""
          className="max-w-56 rounded border border-edge bg-ink px-2 py-1 text-xs"
        >
          <option value="" disabled>{t('fromRoster')}</option>
          {/* One team per character: whoever holds them is named and the option
              is refused here rather than at submit. */}
          {roster.map((character) => (
            <option
              key={character.id}
              value={character.id}
              disabled={character.inTeam !== null}
            >
              {character.name} · {character.detail}
              {character.inTeam &&
                (character.inTeam.id === teamId
                  ? t('alreadyInThisTeam')
                  : t('inOtherTeam', { name: character.inTeam.name }))}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="rounded border border-edge px-3 py-1 text-xs hover:border-accent disabled:opacity-50"
        >
          {t('addButton')}
        </button>
      </div>
    </form>
  );
}

function Slot({ teamId, slot }: { teamId: string; slot: SlotView }) {
  const t = useTranslations('teams');
  const roleLabel = useTranslations('common.role');
  const [, saveRoles, savingRoles] = useActionState<TeamActionState, FormData>(
    setRolesAction, { status: 'idle' },
  );
  const [, drop] = useActionState<TeamActionState, FormData>(
    removeSlotAction, { status: 'idle' },
  );
  const [, declare] = useActionState<TeamActionState, FormData>(
    setDeclarationAction, { status: 'idle' },
  );

  return (
    <div
      className="space-y-2 border-t-2 bg-surface p-3"
      style={{ borderTopColor: slot.elementColor }}
    >
      <div className="flex items-center gap-2">
        <AssetImage src={slot.icon} kind="avatar" className="h-8 w-8" sizes="32px" />
        <a href={slot.buildHref} className="min-w-0 flex-1 truncate text-sm hover:text-accent">
          {slot.name}
        </a>
        <form action={drop}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="characterId" value={slot.characterId} />
          <button
            type="submit"
            className="text-xs text-muted hover:text-accent"
            aria-label={t('removeAria', { name: slot.name })}
          >
            ×
          </button>
        </form>
      </div>

      <p className="font-mono text-[0.65rem] text-muted">
        {slot.buildName
          ? <span className="text-accent">{slot.buildName}</span>
          : t('noBuildForRole')}
        {slot.weapon && <> · {slot.weapon}</>}
      </p>

      {slot.gear.length > 0 && (
        <p className="font-mono text-[0.65rem] text-muted">{slot.gear.join(' · ')}</p>
      )}

      {slot.goals.length > 0 && (
        <ul className="flex flex-wrap gap-x-2 font-mono text-[0.65rem]">
          {slot.goals.map((goal) => (
            <li
              key={goal.label}
              className={
                goal.status === 'met'
                  ? 'text-good'
                  : goal.status === 'close'
                    ? 'text-warn'
                    : 'text-bad'
              }
            >
              {goal.label} <span className="tabular">{Math.round(goal.actual)}/{goal.min}</span>
            </li>
          ))}
        </ul>
      )}

      {/* The role is per slot, so the same character can be a support here and
          a sub-dps in another team. */}
      <form action={saveRoles} className="space-y-1">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="characterId" value={slot.characterId} />
        <div className="flex flex-wrap gap-1">
          {ROLES.map((role) => (
            <label
              key={role}
              className={`cursor-pointer rounded border px-1.5 py-0.5 text-[0.65rem] ${
                slot.roles.includes(role)
                  ? 'border-accent text-accent'
                  : 'border-edge text-muted hover:border-accent/50'
              }`}
            >
              <input
                type="checkbox"
                name="roles"
                value={role}
                defaultChecked={slot.roles.includes(role)}
                className="sr-only"
              />
              {roleLabel(role)}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={savingRoles}
          className="rounded border border-edge px-2 py-0.5 text-[0.65rem] hover:border-accent disabled:opacity-50"
        >
          {t('saveRolesButton')}
        </button>
      </form>

      {slot.needed.map((declaration) => (
        <form key={declaration.field} action={declare} className="flex items-center gap-1">
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="characterId" value={slot.characterId} />
          <input type="hidden" name="field" value={declaration.field} />
          <select
            name="value"
            defaultValue={slot.declarations[declaration.field] ?? ''}
            className="min-w-0 flex-1 rounded border border-edge bg-ink px-1 py-0.5 text-[0.65rem]"
          >
            <option value="">{t('noDeclaration')}</option>
            {declaration.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded border border-edge px-1.5 py-0.5 text-[0.65rem] hover:border-accent"
          >
            ✓
          </button>
        </form>
      ))}

      {slot.findings.length > 0 && (
        <ul>
          {slot.findings.map((finding) => (
            <Finding key={finding.id} finding={finding} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Finding({ finding }: { finding: { severity: string; message: string } }) {
  const tone =
    finding.severity === 'error'
      ? 'text-accent'
      : finding.severity === 'warning'
        ? 'text-text'
        : 'text-muted';

  return (
    <li className={`text-[0.7rem] leading-snug ${tone}`}>
      <span className="font-mono text-muted">
        {finding.severity === 'error' ? '!!' : finding.severity === 'warning' ? '!' : 'i'}
      </span>{' '}
      {finding.message}
    </li>
  );
}
