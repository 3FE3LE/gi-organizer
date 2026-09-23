'use client';

import { Menu } from '@base-ui/react/menu';
import { Check, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { startTransition, useActionState, useOptimistic, useState } from 'react';

import { Button, buttonVariants } from '@/components/ui/button';
import { ActionStatus } from '@/components/action-status';
import { AssetImage } from '@/components/asset-image';
import { Hint } from '@/components/hint';
import { StatIcon } from '@/components/stat-icon';
import { FieldSelect } from '@/components/field-select';
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { TEAM_ROLES, type TeamRole } from '@/lib/rules/types';

import { SynergyPanel, type SynergyView } from './synergy-panel';

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
  /** Equipped weapon, if any. */
  weapon: { name: string; icon: string | null; level: number; refinement: number } | null;
  /** Sets worn at two pieces or more: the effects actually switched on. */
  sets: { setId: number; name: string; icon: string | null; pieces: number; effect: string | null }[];
  /** Sands, goblet and circlet: the three main stats that are a choice. */
  mainStats: { slot: string; slotLabel: string; prop: string | null; label: string | null }[];
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
  /** What the team is, as opposed to what is wrong with it. */
  synergy: SynergyView;
};

/** A character the player owns, and the team that already holds them. */
export type RosterEntry = {
  id: number;
  name: string;
  icon: string | null;
  rarity: number;
  /** The element's name in this locale, which is also the picker's group. */
  element: string;
  elementColor: string;
  inTeam: { id: string; name: string } | null;
};

const ROLES = TEAM_ROLES;

/** Sends one form's worth of fields to an action, outside a `<form>`. */
function send(action: (form: FormData) => void, fields: Record<string, string | string[]>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const entry of Array.isArray(value) ? value : [value]) form.append(key, entry);
  }
  startTransition(() => action(form));
}

/**
 * One team: four slots, and what the rules say about them.
 *
 * Every control on it writes the moment it changes. The board used to carry
 * three save buttons — objective, roles, declarations — each a ✓ next to a
 * choice already made, and a role picked but not saved looked exactly like one
 * that was. A choice here is the save.
 */
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
    <article className="card">
      <header className="flex flex-wrap items-center gap-3 border-b border-edge px-4 py-2">
        <h2 className="text-sm font-medium">{team.name}</h2>
        <span className="font-mono text-xs uppercase text-muted">{team.mode}</span>
        <span className="font-mono text-xs text-muted">{team.slots.length}/4</span>
        <ObjectivePicker teamId={team.id} current={team.objective} objectives={objectives} />
        <div className="ml-auto flex items-center gap-2">
          <form action={remove}>
            <input type="hidden" name="teamId" value={team.id} />
            <Button variant="outline" size="sm" type="submit">
              {t('deleteButton')}
            </Button>
          </form>
        </div>
      </header>

      <ActionStatus state={state} className="border-b border-edge px-4 py-1.5 font-mono text-xs" />

      {team.findings.length > 0 && (
        <ul className="border-b border-edge px-4 py-2">
          {team.findings.map((finding) => (
            <Finding key={finding.id} finding={finding} />
          ))}
        </ul>
      )}

      {/* Above the slots, because it is about all four of them: the resonance
          the elements buy, the reactions they enable, and the auras one
          member's gear hangs over the rest. */}
      <SynergyPanel synergy={team.synergy} />

      <div className="grid gap-px bg-edge sm:grid-cols-2 xl:grid-cols-4">
        {team.slots.map((slot) => (
          <Slot key={slot.characterId} teamId={team.id} slot={slot} />
        ))}
        {/* An empty slot is the way in. The add form used to be a strip above
            the four slots, which put "add someone" in a different place from
            "where they go". */}
        {Array.from({ length: 4 - team.slots.length }, (_, index) => (
          <MemberPicker
            key={`empty-${index}`}
            teamId={team.id}
            roster={roster}
            action={add}
            pending={adding}
            lastAdded={addState}
          />
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
    <FieldSelect
      label={t('objectiveLabel')}
      defaultValue={current ?? ''}
      disabled={saving}
      placeholder={t('noObjective')}
      onValueChange={(objective) => send(save, { teamId, objective })}
      groups={[{ options: objectives.map((objective) => ({
        value: objective.id, label: objective.label,
      })) }]}
      triggerClassName="w-auto px-2 py-1 text-xs"
    />
  );
}

/**
 * An empty slot, and the roster behind it.
 *
 * Faces rather than a dropdown of names: the party screen this replaces in the
 * player's head is a grid of portraits by element, and a name list of eighty
 * rows with the element spelled out on each is the slow way to find one. A
 * character who is already on a team is shown, dimmed and named, because
 * "where did they go" is the next question when someone is missing.
 */
function MemberPicker({
  teamId,
  roster,
  action,
  pending,
  lastAdded,
}: {
  teamId: string;
  roster: RosterEntry[];
  action: (form: FormData) => void;
  pending: boolean;
  lastAdded: TeamActionState;
}) {
  const t = useTranslations('teams');
  // The add state the dialog was opened on. It closes once a newer success
  // lands, and stays open on a refusal so the reason is read where the choice
  // was made — derived rather than set from an effect.
  const [openedOn, setOpenedOn] = useState<TeamActionState | null>(null);
  const [query, setQuery] = useState('');
  const open = openedOn !== null && !(lastAdded !== openedOn && lastAdded.status === 'ok');
  const setOpen = (next: boolean) => setOpenedOn(next ? lastAdded : null);

  const needle = query.trim().toLocaleLowerCase();
  const shown = needle
    ? roster.filter((character) => character.name.toLocaleLowerCase().includes(needle))
    : roster;

  const groups = new Map<string, RosterEntry[]>();
  for (const character of shown) {
    groups.set(character.element, [...(groups.get(character.element) ?? []), character]);
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { setOpen(next); if (!next) setQuery(''); }}>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-h-44 flex-col items-center justify-center gap-2 bg-surface text-xs text-muted transition-colors hover:bg-ink/40 hover:text-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full border border-dashed border-edge-strong transition-colors group-hover:border-accent">
          <Plus size={16} aria-hidden />
        </span>
        {t('addMember')}
      </button>

      {open && (
        <DialogContent
          showCloseButton={false}
          className="w-full max-w-2xl gap-0 overflow-hidden rounded-xl border border-edge-strong bg-surface p-0 ring-0 sm:max-w-2xl"
        >
          <div className="flex max-h-[80vh] flex-col">
            <header className="flex items-center gap-3 border-b border-edge px-4 py-3">
              <DialogTitle className="font-mono text-xs font-normal uppercase tracking-wide text-accent">
                {t('addMember')}
              </DialogTitle>
              <label className="field ml-auto flex min-w-0 flex-1 items-center gap-2 px-2 py-1 sm:max-w-64">
                <Search size={14} className="shrink-0 text-muted" aria-hidden />
                <span className="sr-only">{t('searchRoster')}</span>
                <input
                  autoFocus
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t('searchRoster')}
                  className="min-w-0 flex-1 bg-transparent text-xs outline-none"
                />
              </label>
              <DialogClose
                aria-label={t('closeAria')}
                className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'shrink-0' })}
              >
                <X size={16} />
              </DialogClose>
            </header>

            {lastAdded !== openedOn && lastAdded.status === 'error' && (
              <p className="border-b border-edge px-4 py-1.5 font-mono text-xs text-accent">
                {lastAdded.message}
              </p>
            )}

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3">
              {groups.size === 0 && (
                <p className="py-6 text-center text-xs text-muted">{t('noRosterMatch')}</p>
              )}
              {[...groups].map(([element, characters]) => (
                <section key={element}>
                  <h3 className="mb-2 font-mono text-2xs uppercase tracking-wide text-muted">{element}</h3>
                  <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {characters.map((character) => {
                      const here = character.inTeam?.id === teamId;
                      const busy = character.inTeam !== null;

                      return (
                        <li key={character.id}>
                          <button
                            type="button"
                            disabled={busy || pending}
                            onClick={() => send(action, { teamId, characterId: String(character.id) })}
                            title={busy
                              ? here
                                ? t('alreadyInThisTeam')
                                : t('inOtherTeam', { name: character.inTeam!.name })
                              : character.name}
                            className="flex w-full flex-col items-center gap-1 rounded-lg p-1 text-center transition-colors hover:bg-ink/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-accent"
                          >
                            <span
                              className="rounded-full border-2 bg-icon-bed"
                              style={{ borderColor: character.elementColor }}
                            >
                              <AssetImage
                                src={character.icon}
                                kind="avatar"
                                className="h-12 w-12 rounded-full"
                                sizes="48px"
                              />
                            </span>
                            <span className="w-full truncate text-2xs">{character.name}</span>
                            <span className="w-full truncate font-mono text-2xs text-muted">
                              {busy
                                ? here ? t('alreadyInThisTeam') : character.inTeam!.name
                                : '★'.repeat(character.rarity)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}

/**
 * The roles a slot plays, as one control.
 *
 * Nine chips on every slot were nine controls saying one thing, and a
 * separate "save roles" button made the chips a draft nobody could tell from
 * the saved state. It is a menu now: the trigger states the roles, each tick
 * writes, and the optimistic value keeps the trigger honest while it does.
 */
function RolesMenu({ teamId, characterId, roles }: {
  teamId: string;
  characterId: number;
  roles: TeamRole[];
}) {
  const t = useTranslations('teams');
  const roleLabel = useTranslations('common.role');
  const [, save] = useActionState<TeamActionState, FormData>(setRolesAction, { status: 'idle' });
  const [shown, setShown] = useOptimistic(roles);

  const toggle = (role: TeamRole, checked: boolean) => {
    const next = checked ? [...shown, role] : shown.filter((current) => current !== role);
    // Kept in the enum's order, so the label reads the same however it was built.
    const ordered = ROLES.filter((candidate) => next.includes(candidate));
    startTransition(() => {
      setShown(ordered);
      const form = new FormData();
      form.append('teamId', teamId);
      form.append('characterId', String(characterId));
      for (const entry of ordered) form.append('roles', entry);
      save(form);
    });
  };

  return (
    <Menu.Root>
      <Menu.Trigger
        className={`mx-auto flex max-w-full items-center justify-center gap-0.5 rounded font-mono text-2xs underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent ${
          shown.length === 0 ? 'text-muted' : 'text-accent'
        }`}
        aria-label={t('rolesLabel')}
      >
        <span className="min-w-0 truncate">
          {shown.length === 0 ? t('noRole') : shown.map((role) => roleLabel(role)).join(' · ')}
        </span>
        <ChevronDown size={10} className="shrink-0 opacity-60" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={4} align="center" className="isolate z-50">
          <Menu.Popup className="min-w-44 origin-(--transform-origin) rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95">
            {ROLES.map((role) => (
              <Menu.CheckboxItem
                key={role}
                checked={shown.includes(role)}
                onCheckedChange={(checked) => toggle(role, checked)}
                closeOnClick={false}
                className="flex cursor-default items-center gap-2 rounded-md py-1 pr-2 pl-1.5 text-xs outline-none select-none data-highlighted:bg-accent/15 data-checked:text-accent"
              >
                <span className="flex size-4 items-center justify-center">
                  <Menu.CheckboxItemIndicator>
                    <Check size={12} />
                  </Menu.CheckboxItemIndicator>
                </span>
                {roleLabel(role)}
              </Menu.CheckboxItem>
            ))}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/**
 * One member, drawn as what they are built as.
 *
 * The card used to spell its gear out — a weapon name, sets as `name ×4`, a
 * role picker — which read as a form about the character rather than the
 * character. It is a portrait now, with the build as a row of marks under it:
 * the weapon with its level and refinement, the set effects switched on, and
 * the three main stats that were a choice. Everything else — thresholds,
 * declarations, findings — follows, only where there is something to say.
 */
function Slot({ teamId, slot }: { teamId: string; slot: SlotView }) {
  const t = useTranslations('teams');
  const [, drop] = useActionState<TeamActionState, FormData>(
    removeSlotAction, { status: 'idle' },
  );
  const [, declare] = useActionState<TeamActionState, FormData>(
    setDeclarationAction, { status: 'idle' },
  );

  return (
    <div className="relative flex flex-col items-center gap-3 bg-surface px-3 pb-3 pt-4">
      <form action={drop} className="absolute right-1.5 top-1.5">
        <input type="hidden" name="teamId" value={teamId} />
        <input type="hidden" name="characterId" value={slot.characterId} />
        <button
          type="submit"
          className={buttonVariants({ variant: 'ghost', size: 'icon-sm', className: 'text-muted hover:text-accent' })}
          aria-label={t('removeAria', { name: slot.name })}
          title={t('removeAria', { name: slot.name })}
        >
          <X size={14} aria-hidden />
        </button>
      </form>

      <div className="w-full min-w-0 px-6 text-center">
        <Link href={slot.buildHref} className="block truncate text-sm hover:text-accent">
          {slot.name}
        </Link>
        {/* The role reads as a line of text, not a field. It still opens on a
            click, because a suggested role is a guess and a guess has to be
            correctable where it is shown. */}
        <RolesMenu teamId={teamId} characterId={slot.characterId} roles={slot.roles} />
      </div>

      <Link href={slot.buildHref} aria-hidden tabIndex={-1} className="rounded-full">
        <span
          className="block rounded-full p-0.5"
          style={{ background: slot.elementColor }}
        >
          <AssetImage
            src={slot.icon}
            kind="avatar"
            className="block h-20 w-20 rounded-full bg-icon-bed"
            sizes="80px"
          />
        </span>
      </Link>

      <ul className="flex flex-wrap items-start justify-center gap-1.5" aria-label={t('buildMarksLabel')}>
        <li>
          <Mark
            label={slot.weapon
              ? t('weaponMark', { name: slot.weapon.name, level: slot.weapon.level, refinement: slot.weapon.refinement })
              : t('noWeapon')}
            badge={slot.weapon ? `${slot.weapon.level}·R${slot.weapon.refinement}` : null}
          >
            {slot.weapon && (
              <AssetImage src={slot.weapon.icon} kind="weapon" className="h-7 w-7" sizes="28px" />
            )}
          </Mark>
        </li>
        {slot.sets.map((set) => (
          <li key={set.setId}>
            <Mark
              label={`${set.name} · ${set.pieces >= 4 ? 4 : 2}pc${set.effect ? ` — ${set.effect}` : ''}`}
              // The effect tier, not the piece count: a fifth piece of one
              // set switches nothing further on.
              badge={set.pieces >= 4 ? '4' : '2'}
            >
              <AssetImage src={set.icon} kind="relic" className="h-7 w-7" sizes="28px" />
            </Mark>
          </li>
        ))}
        {slot.sets.length === 0 && (
          <li><Mark label={t('noSetEffect')} badge={null} /></li>
        )}
        {slot.mainStats.map((main) => (
          <li key={main.slot}>
            <Mark
              label={main.prop && main.label
                ? `${main.slotLabel} · ${main.label}`
                : t('emptyPiece', { slot: main.slotLabel })}
              badge={null}
            >
              {main.prop && main.label && (
                <StatIcon prop={main.prop} label={main.label} size={15} />
              )}
            </Mark>
          </li>
        ))}
      </ul>

      {slot.buildName === null && (
        <p className="font-mono text-2xs text-muted">{t('noBuildForRole')}</p>
      )}

      {slot.goals.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-x-2 font-mono text-2xs">
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

      {slot.needed.map((declaration) => (
        <FieldSelect
          key={declaration.field}
          label={t('declarationLabel')}
          defaultValue={slot.declarations[declaration.field] ?? ''}
          placeholder={t('noDeclaration')}
          onValueChange={(value) => send(declare, {
            teamId,
            characterId: String(slot.characterId),
            field: declaration.field,
            value,
          })}
          groups={[{ options: declaration.options.map((option) => ({
            value: option.value, label: option.label,
          })) }]}
          triggerClassName="w-full px-2 py-1 text-2xs"
        />
      ))}

      {slot.findings.length > 0 && (
        <ul className="w-full">
          {slot.findings.map((finding) => (
            <Finding key={finding.id} finding={finding} />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One mark of the build: a round bed, what fills it, and a badge under it.
 * An empty mark is drawn too — a missing weapon or a bare slot is part of
 * what the character is built as.
 */
function Mark({
  label,
  badge,
  children,
}: {
  label: string;
  badge: string | null;
  children?: React.ReactNode;
}) {
  return (
    <Hint text={label}>
      <span
        tabIndex={0}
        aria-label={label}
        className="relative flex h-9 w-9 items-center justify-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {/* Light glyphs on the dark bed in both themes: a stat drawn in the
            text colour vanished into it on the light one. */}
        <span className={`disc flex h-9 w-9 items-center justify-center text-white/85 ${children ? '' : 'opacity-40'}`}>
          {children}
        </span>
        {badge && (
          <span className="tabular absolute -bottom-1.5 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-edge bg-surface px-1 font-mono text-[0.6rem] leading-tight text-muted">
            {badge}
          </span>
        )}
      </span>
    </Hint>
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
    <li className={`text-2xs leading-snug ${tone}`}>
      <span className="font-mono text-muted">
        {finding.severity === 'error' ? '!!' : finding.severity === 'warning' ? '!' : 'i'}
      </span>{' '}
      {finding.message}
    </li>
  );
}
