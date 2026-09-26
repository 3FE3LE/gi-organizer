'use server';

import '@/lib/forms/zod-messages';
import { getTranslations } from 'next-intl/server';
import { redirect } from 'next/navigation';

import { getCatalog } from '@/lib/data/catalog';
import { DEFAULT_LOCALE } from '@/lib/data/locales';
import type { ArtifactSlot } from '@/lib/data/types';
import { firstIssue, templateSchema } from '@/lib/forms/build';
import { deleteBuild, readBuild, readBuildsFor, saveBuild } from '@/lib/player/builds';
import { getDb } from '@/lib/db/client';
import { getBuildPriorities, suggestionsFor } from '@/lib/rules/assemble';
import { refinementResolver } from '@/lib/player/weapon-copies';
import { templateFor } from '@/lib/rules/role-templates';
import { CHOOSABLE_SLOTS } from '@/lib/rules/piece-score';
import { refreshEverywhere } from '@/lib/refresh';

export type BuildFormState =
  | { status: 'idle' }
  | { status: 'ok'; message: string; buildId?: string }
  | { status: 'error'; message: string };

/**
 * Starts a build from nothing.
 *
 * Named rather than blank so the tab strip has something to show, and every
 * field of it is editable straight away.
 */
export async function createBuildAction(
  _previous: BuildFormState,
  form: FormData,
): Promise<BuildFormState> {
  const t = await getTranslations('build.actions');
  const characterId = Number(form.get('characterId'));
  const catalog = await getCatalog(DEFAULT_LOCALE);
  if (!catalog.characters.get(characterId)) {
    return { status: 'error', message: t('characterNotFound') };
  }

  // A goal with no role is the character's plain target; declaring a role is
  // what makes a second one. The first roleless goal is therefore the only one
  // this can create, and creating a second would violate `ux_build_role`.
  const existing = await readBuildsFor(characterId);
  const roleless = existing.find((build) => build.role === null);
  if (roleless) {
    return { status: 'error', message: t('roleAlreadyHasGoal') };
  }

  const buildId = await saveBuild({
    characterId,
    role: null,
    objective: null,
    weaponId: null,
    weaponRefinement: null,
    setPlan: [],
    mainStats: {},
    substats: [],
    goals: [],
    notes: null,
  });

  // Filled in rather than blank. A form with a dozen empty fields is a form
  // nobody finishes, and the community's main stats and substat order for this
  // character are a better starting point than nothing — every number of it
  // stays editable, and nothing about it is binding.
  await applyTemplateAction({ characterId, buildId, role: '' });

  // Land on the build that was just created, otherwise the tab strip grows an
  // entry the player then has to go and click. The redirect re-renders the
  // route on its own, so there is nothing to refresh first.
  const returnTo = String(form.get('returnTo') ?? '');
  if (returnTo.startsWith('/')) redirect(`${returnTo}?build=${buildId}&tab=objective`);

  refreshEverywhere();
  return { status: 'ok', message: t('buildCreated'), buildId };
}

export async function deleteBuildAction(buildId: string): Promise<BuildFormState> {
  const t = await getTranslations('build.actions');
  const removed = await deleteBuild(buildId);
  refreshEverywhere();

  return removed > 0
    ? { status: 'ok', message: t('buildDeleted') }
    : { status: 'error', message: t('buildNotFound') };
}

/**
 * Fills the goal in hand from its role.
 *
 * A blank form with a dozen fields is a form nobody finishes. This gives
 * something to disagree with: generic thresholds for the role, the community's
 * main stats and substat order for this character, their best reachable set,
 * and a weapon they can actually equip. Everything stays editable, and nothing
 * about it is binding.
 */
export async function applyTemplateAction(
  input: { characterId: number; buildId: string; role: string },
): Promise<BuildFormState> {
  const t = await getTranslations('build.actions');
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 'error', message: firstIssue(parsed.error, await getTranslations('forms')) };
  }

  const { characterId, buildId, role } = parsed.data;
  const catalog = await getCatalog(DEFAULT_LOCALE);
  const character = catalog.characters.get(characterId);
  if (!character) return { status: 'error', message: t('characterNotFound') };

  const existing = buildId ? await readBuild(buildId, getDb()) : null;
  if (!existing) return { status: 'error', message: t('openObjectiveFirst') };

  // The role on screen wins over the one on disk, so picking a role and
  // filling from it is one gesture rather than two saves.
  const priority = (await getBuildPriorities()).get(characterId);
  const template = templateFor(
    (role || existing.role) as typeof existing.role,
    character.elementType,
    priority,
    CHOOSABLE_SLOTS,
  );

  const suggestions = await suggestionsFor(characterId, catalog, getDb(), existing.id);

  // Only what the player can reach: the suggestion lists are already filtered
  // by ownership for weapons and by feasibility for sets.
  const set = suggestions.sets.find((entry) => entry.feasible) ?? suggestions.sets[0];
  const weapon = suggestions.weapons.find((entry) => entry.feasible) ?? suggestions.weapons[0];

  const plannedWeaponId = weapon?.weaponId ?? existing.weaponId;

  const mainStats: Partial<Record<ArtifactSlot, string[]>> = {};
  for (const [slot, prop] of Object.entries(template.mainStats)) {
    if (prop) mainStats[slot as ArtifactSlot] = [prop];
  }

  await saveBuild({
    ...existing,
    id: existing.id,
    weaponId: plannedWeaponId,
    // The community's minimum only where a copy can be forged towards it; a
    // five-star is at the refinement the account holds. See
    // `rules/refinement.ts`.
    weaponRefinement: plannedWeaponId === null
      ? null
      : (await refinementResolver()).resolve(
          characterId, plannedWeaponId, weapon?.minRefinement ?? existing.weaponRefinement,
        ),
    setPlan: set ? [{ setIds: set.setIds, pieces: set.pieces }] : existing.setPlan,
    mainStats,
    substats: template.substats,
    // Thresholds the player already typed are theirs; the template only fills
    // a goal that has none.
    goals: existing.goals.length > 0 ? existing.goals : template.goals,
  });

  refreshEverywhere();
  return { status: 'ok', message: t('objectiveFilledFromRole'), buildId: existing.id };
}
