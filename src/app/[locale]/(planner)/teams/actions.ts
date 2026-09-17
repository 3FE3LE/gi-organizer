'use server';

import { refresh } from 'next/cache';
import { getTranslations } from 'next-intl/server';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import {
  createTeam,
  deleteTeam,
  removeSlot,
  setDeclaration,
  setObjective,
  setRoles,
  setSlot,
} from '@/lib/player/teams';
import { TEAM_ROLES, type EndgameMode, type TeamRole } from '@/lib/rules/types';

export type TeamActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

const MODES: EndgameMode[] = ['abyss', 'theater', 'stygian', 'other'];

export async function createTeamAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  const name = String(form.get('name') ?? '').trim();
  const raw = String(form.get('mode') ?? 'other');
  const mode = (MODES as string[]).includes(raw) ? (raw as EndgameMode) : 'other';

  if (name.length === 0) return { status: 'error', message: t('nameRequired') };

  await createTeam(name, mode);
  refresh();
  return { status: 'ok', message: t('created', { name }) };
}

export async function deleteTeamAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  await deleteTeam(String(form.get('teamId') ?? ''));
  refresh();
  return { status: 'ok', message: t('deleted') };
}

/**
 * Adds a member with their role already set.
 *
 * The role comes first because everything downstream reads it: the suggestions
 * for that slot, the collision resolution when two members want one set, and
 * the coverage rules. A member added without a role is invisible to all three
 * until someone remembers to go back.
 */
export async function addSlotAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  const teamId = String(form.get('teamId') ?? '');
  const characterId = Number(form.get('characterId'));

  const roles = form.getAll('roles')
    .map(String)
    .filter((role): role is TeamRole => (TEAM_ROLES as string[]).includes(role));

  if (roles.length === 0) {
    return { status: 'error', message: t('roleRequired') };
  }

  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(characterId);
  if (!character) return { status: 'error', message: t('characterNotFound') };

  const result = await setSlot(teamId, characterId, null);
  if (result.ok) await setRoles(teamId, characterId, roles);
  refresh();

  if (result.ok) {
    return { status: 'ok', message: t('memberAdded', { name: character.name, roles: roles.join(', ') }) };
  }

  return {
    status: 'error',
    message: result.reason === 'team-full'
      ? t('teamFull')
      : result.reason === 'already-in-team'
        ? t('alreadyInTeam', { name: character.name })
        : result.reason === 'in-another-team'
          ? t('inAnotherTeam', { name: character.name, team: result.team })
          : t('teamNotFound'),
  };
}

export async function removeSlotAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  await removeSlot(String(form.get('teamId') ?? ''), Number(form.get('characterId')));
  refresh();
  return { status: 'ok', message: t('memberRemoved') };
}

export async function setRolesAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  const roles = form.getAll('roles')
    .map(String)
    .filter((role): role is TeamRole => (TEAM_ROLES as string[]).includes(role));

  await setRoles(String(form.get('teamId') ?? ''), Number(form.get('characterId')), roles);
  refresh();
  return { status: 'ok', message: roles.length > 0 ? t('rolesSaved') : t('rolesCleared') };
}

/**
 * Records what the engine cannot derive. Clearing it returns the slot to
 * "unprovable" rather than asserting something false.
 */
export async function setDeclarationAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  await setDeclaration(
    String(form.get('teamId') ?? ''),
    Number(form.get('characterId')),
    String(form.get('field') ?? ''),
    String(form.get('value') ?? ''),
  );
  refresh();
  return { status: 'ok', message: t('declarationSaved') };
}

/**
 * States what the team is for.
 *
 * Without it a build can only be recommended generically, which is how every
 * member ends up offered the same three sets. With it, a set whose own text
 * names the mechanic outranks one that is merely right for the role.
 */
export async function setObjectiveAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  const objective = String(form.get('objective') ?? '');
  await setObjective(String(form.get('teamId') ?? ''), objective === '' ? null : objective);
  refresh();

  return {
    status: 'ok',
    message: objective === '' ? t('objectiveCleared') : t('objectiveSet', { objective }),
  };
}
