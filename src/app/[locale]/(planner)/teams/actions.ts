'use server';

import { refresh } from 'next/cache';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE, isLocale } from '@/lib/data/locales';
import { getCharacterDetailStrings } from '@/lib/data/registry';
import { readBuildsFor } from '@/lib/player/builds';
import {
  deleteTeam,
  moveSlot,
  nameTeam,
  openDraft,
  reorderTeams,
  removeSlot,
  setDeclaration,
  setObjective,
  setRoles,
  setSlot,
} from '@/lib/player/teams';
import { getBuildPriorities } from '@/lib/rules/assemble';
import { preferredPositions } from '@/lib/rules/slot-order';
import { suggestRoles } from '@/lib/rules/suggest-role';
import { TEAM_ROLES, type TeamRole } from '@/lib/rules/types';

export type TeamActionState =
  | { status: 'idle' }
  | { status: 'ok'; message: string }
  | { status: 'error'; message: string };

/**
 * Opens the draft — a new team, or the one already being put together — and
 * shows it. Nothing is asked first: the members and the objective come before
 * the name, which is asked for on save.
 */
export async function newTeamAction(form: FormData) {
  const locale = String(form.get('locale') ?? DEFAULT_LOCALE);
  const id = await openDraft();
  redirect(`/${isLocale(locale) ? locale : DEFAULT_LOCALE}/teams?team=${id}`);
}

/** Names the draft, which is what saving it means. */
export async function saveTeamAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  const name = String(form.get('name') ?? '').trim();
  if (name.length === 0) return { status: 'error', message: t('nameRequired') };

  await nameTeam(String(form.get('teamId') ?? ''), name);
  refresh();
  return { status: 'ok', message: t('saved', { name }) };
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
 * Everything downstream reads the role: the suggestions for that slot, the
 * collision resolution when two members want one set, and the coverage rules.
 * So a member never arrives without one when one can be found — but it is the
 * app that finds it (see `suggestRoles`), not a question put to the player
 * before they are allowed to pick a character. A form that does send roles
 * still wins.
 */
export async function addSlotAction(
  _previous: TeamActionState,
  form: FormData,
): Promise<TeamActionState> {
  const t = await getTranslations('teams.actions');
  const teamId = String(form.get('teamId') ?? '');
  const characterId = Number(form.get('characterId'));

  const requested = form.getAll('roles')
    .map(String)
    .filter((role): role is TeamRole => (TEAM_ROLES as string[]).includes(role));

  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(characterId);
  if (!character) return { status: 'error', message: t('characterNotFound') };

  const roles = requested.length > 0 ? requested : await suggestedRoles(characterId);

  // Placed by role — see `preferredPositions`; a drag moves them after.
  const result = await setSlot(teamId, characterId, preferredPositions(roles));
  if (result.ok && roles.length > 0) await setRoles(teamId, characterId, roles);
  refresh();

  if (result.ok) {
    const roleLabel = await getTranslations('common.role');
    return {
      status: 'ok',
      message: roles.length > 0
        ? t('memberAdded', { name: character.name, roles: roles.map((role) => roleLabel(role)).join(', ') })
        : t('memberAddedNoRole', { name: character.name }),
    };
  }

  return {
    status: 'error',
    message: result.reason === 'team-full'
      ? t('teamFull')
      : result.reason === 'already-in-team'
        ? t('alreadyInTeam', { name: character.name })
        : result.reason === 'in-another-team'
          ? t('inAnotherTeam', {
              name: character.name,
              team: result.team || (await getTranslations('teams'))('reserveTeam'),
            })
          : t('teamNotFound'),
  };
}

async function suggestedRoles(characterId: number): Promise<TeamRole[]> {
  const [own, community, detail] = await Promise.all([
    readBuildsFor(characterId),
    getBuildPriorities(),
    // English, whatever the page's language: the heuristic reads the game's
    // own English wording, and a translation would need a regex per locale.
    getCharacterDetailStrings('en', characterId),
  ]);

  return suggestRoles({
    ownRoles: own.map((build) => build.role),
    communityRole: community.get(characterId)?.role ?? null,
    kitText: [...(detail.talents?.combat ?? []), ...(detail.talents?.passive ?? [])]
      .map((talent) => talent.description)
      .join(' '),
  });
}

/** The team list's order, first to last, after a drag in the drawer. */
export async function reorderTeamsAction(ids: string[]) {
  await reorderTeams(ids.map(String));
  refresh();
}

/** A drag between two positions: a move into an empty one, a swap otherwise. */
export async function moveSlotAction(teamId: string, characterId: number, to: number) {
  await moveSlot(teamId, characterId, to);
  refresh();
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
