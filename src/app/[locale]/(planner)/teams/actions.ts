'use server';

import { refresh } from 'next/cache';

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
  const name = String(form.get('name') ?? '').trim();
  const raw = String(form.get('mode') ?? 'other');
  const mode = (MODES as string[]).includes(raw) ? (raw as EndgameMode) : 'other';

  if (name.length === 0) return { status: 'error', message: 'ponle un nombre' };

  await createTeam(name, mode);
  refresh();
  return { status: 'ok', message: `equipo "${name}" creado` };
}

export async function deleteTeamAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  await deleteTeam(String(form.get('teamId') ?? ''));
  refresh();
  return { status: 'ok', message: 'equipo borrado' };
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
  const teamId = String(form.get('teamId') ?? '');
  const characterId = Number(form.get('characterId'));

  const roles = form.getAll('roles')
    .map(String)
    .filter((role): role is TeamRole => (TEAM_ROLES as string[]).includes(role));

  if (roles.length === 0) {
    return { status: 'error', message: 'elige el rol antes de añadir' };
  }

  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(characterId);
  if (!character) return { status: 'error', message: 'ese personaje no existe' };

  const result = await setSlot(teamId, characterId, null);
  if (result.ok) await setRoles(teamId, characterId, roles);
  refresh();

  if (result.ok) {
    return { status: 'ok', message: `${character.name} añadido como ${roles.join(', ')}` };
  }

  return {
    status: 'error',
    message: result.reason === 'team-full'
      ? 'el equipo ya tiene cuatro'
      : result.reason === 'already-in-team'
        ? `${character.name} ya está en este equipo`
        : result.reason === 'in-another-team'
          ? `${character.name} está en «${result.team}»; quítalo de ahí primero`
          : 'ese equipo no existe',
  };
}

export async function removeSlotAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  await removeSlot(String(form.get('teamId') ?? ''), Number(form.get('characterId')));
  refresh();
  return { status: 'ok', message: 'quitado del equipo' };
}

export async function setRolesAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const roles = form.getAll('roles')
    .map(String)
    .filter((role): role is TeamRole => (TEAM_ROLES as string[]).includes(role));

  await setRoles(String(form.get('teamId') ?? ''), Number(form.get('characterId')), roles);
  refresh();
  return { status: 'ok', message: roles.length > 0 ? 'roles guardados' : 'roles vaciados' };
}

/**
 * Records what the engine cannot derive. Clearing it returns the slot to
 * "unprovable" rather than asserting something false.
 */
export async function setDeclarationAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  await setDeclaration(
    String(form.get('teamId') ?? ''),
    Number(form.get('characterId')),
    String(form.get('field') ?? ''),
    String(form.get('value') ?? ''),
  );
  refresh();
  return { status: 'ok', message: 'declaración guardada' };
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
  const objective = String(form.get('objective') ?? '');
  await setObjective(String(form.get('teamId') ?? ''), objective === '' ? null : objective);
  refresh();

  return {
    status: 'ok',
    message: objective === '' ? 'objetivo quitado' : `objetivo: ${objective}`,
  };
}
