import 'server-only';

import { getTranslations } from 'next-intl/server';

import { propLabel, setEffects, type Catalog } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import { formatPropValue } from '@/lib/data/props';
import { isAscended } from '@/lib/data/stats';
import { ASSUMED_TARGET } from '@/lib/rules/materials';
import { wornMainStats, wornSetPlan, wornSubstats } from '@/lib/rules/worn';

import { crownBudget } from '@/lib/player/crowns';
import { getProfileId } from '@/lib/player/db';

import type { BuildContext } from './context';
import { editorOptionsFor, goalPropsFor, type EditorOptions } from './editor-options';
import type { ProgressOptions, ProgressValues } from './progress-form';
import type { SetOption } from './set-picker';

/**
 * The objective tab: where this character is, where they are going, and the
 * two forms that say so.
 *
 * The suggestion ranking used to be a separate list further down the page,
 * which made choosing a set a two-step act — read the ranking there, find the
 * name here. It is folded into the pickers instead: rank, what it costs to get
 * there, and who is wearing it, on the option itself.
 */
export type ObjectiveView = {
  values: ProgressValues;
  options: ProgressOptions;
  editor: EditorOptions;
  /**
   * The remount key.
   *
   * The form holds its fields in client state, so a change written on the
   * server — "rellenar desde el rol" fills set, main stats, substats and
   * thresholds at once — would otherwise stay invisible until a hard reload.
   * Keying the form on what the server just sent remounts it exactly when that
   * happens, and never while the player is only editing.
   */
  progressKey: string;
};

export async function objectiveViewFor(context: BuildContext): Promise<ObjectiveView> {
  const { catalog, character, characterId, gear, loadout, locale, suggestions } = context;
  const editor = await editorOptionsFor(catalog);
  const activeBuild = suggestions.build;
  // What the character is already wearing, which is what a goal nobody has
  // written down opens on. See `@/lib/rules/worn`.
  const worn = [...gear.bySlot.values()];

  // A goal that states a main stat or a substat order is the player's; only a
  // goal that states neither falls back to the gear.
  const buildMainStats = Object.fromEntries(
    Object.entries(activeBuild?.mainStats ?? {})
      .map(([slot, props]) => [slot, props?.[0] ?? '']),
  );

  const values: ProgressValues = {
    characterId,
    buildId: activeBuild?.id ?? null,
    role: activeBuild?.role ?? null,
    substats: activeBuild?.substats?.length
      ? activeBuild.substats
      : wornSubstats(character.substatType, worn),
    current: {
      level: loadout?.level ?? 1,
      ascended: isAscended(loadout?.level ?? 1, loadout?.ascension ?? 0),
      constellation: loadout?.constellation ?? 0,
      talents: loadout?.talent ?? { auto: 1, skill: 1, burst: 1 },
    },
    target: {
      // The same assumption the planner makes, and for the same reason: a
      // target nobody wrote down is still one the plan is costing out. Reading
      // it from anywhere else is how the plan came to ask for sixty-six talent
      // books while this form showed nothing to do.
      level: loadout?.target.level ?? ASSUMED_TARGET.level,
      ascended: isAscended(
        loadout?.target.level ?? ASSUMED_TARGET.level,
        loadout?.target.ascension ?? ASSUMED_TARGET.ascension,
      ),
      talents: loadout?.target.talents ?? ASSUMED_TARGET.talents,
    },
    /*
     * The weapon is the one being held, not a choice made here.
     *
     * This form used to carry a weapon picker and a refinement stepper, which
     * made the goal a place to name a weapon the account might not have — as
     * absurd as a goal for a character nobody owns. The objective for a weapon
     * is levelling the one equipped to ninety; swapping it for another is done
     * from the detail view, out of what is actually in the bag. So the goal
     * saves whatever is equipped, at the copy's own refinement.
     */
    weaponId: gear.weapon?.weaponId ?? null,
    weaponRefinement: gear.weapon?.refinement ?? null,
    setIds: activeBuild?.setPlan.flatMap((plan) => plan.setIds) ?? wornSetPlan(worn),
    mainStats: Object.values(buildMainStats).some(Boolean)
      ? buildMainStats
      : wornMainStats(worn),
    goals: activeBuild?.goals ?? [],
    crowns: await crownBudget(context.db, await getProfileId(context.db), characterId),
  };

  const [suggested, all] = await Promise.all([suggestedSets(context), allSets(catalog)]);

  const options: ProgressOptions = {
    roles: editor.roles,
    substats: editor.substats,
    sets: { suggested, all },
    mainStatsBySlot: editor.mainStatsBySlot,
    goalProps: goalPropsFor(character).map((prop) => ({
      value: prop,
      label: propLabel(catalog, prop),
      // What the character measures right now, so a threshold is typed against
      // a number rather than against a memory.
      current: formatPropValue(prop, loadout?.totals[prop] ?? 0, 'percent', locale),
      currentValue: loadout?.totals[prop] ?? 0,
    })),
  };

  return {
    values,
    options,
    editor,
    progressKey: JSON.stringify([
      values.buildId, values.role, values.substats,
      values.weaponId, values.weaponRefinement, values.setIds, values.mainStats,
      values.goals, values.current, values.target,
    ]),
  };
}

/**
 * One option per set, not per suggestion.
 *
 * A set shows up in several suggestions — as a four-piece and as half of a 2+2
 * — and each select picks a single set, so the suggestions are flattened and
 * the first (best) mention of each set wins. Keying by the suggestion's first
 * id instead produced duplicate keys the moment two plans started with the same
 * set.
 */
async function suggestedSets({ catalog, suggestions }: BuildContext): Promise<SetOption[]> {
  const t = await getTranslations('build');
  const setName = (setId: number) => catalog.artifacts.get(setId)?.name ?? `#${setId}`;

  const options: SetOption[] = [];
  const seen = new Set<number>();

  for (const suggestion of suggestions.sets.slice(0, 8)) {
    const rank = suggestion.externalRank === null ? '·' : `#${suggestion.externalRank + 1}`;
    const holders = suggestion.blocked === 'conflicts-in-team'
      ? t('heldByOne', {
          names: suggestion.conflictsWith
            .map((id) => catalog.characters.get(id)?.name ?? `#${id}`).join(', '),
        })
      : '';
    const missing = suggestion.complete
      ? ''
      : t('missingToFarm', { available: suggestion.available, needed: suggestion.needed });
    // What the ranking had in mind for it, so a 2+2 half does not read as a
    // four-piece plan.
    const pairing = suggestion.setIds.length > 1
      ? t('pairingTwoPlusTwo', {
          names: suggestion.setIds
            .filter((id) => id !== suggestion.setIds[0]).map(setName).join(' + '),
        })
      : t('pairingPieces', { pieces: suggestion.pieces });

    for (const setId of suggestion.setIds) {
      if (seen.has(setId)) continue;
      seen.add(setId);
      options.push({
        ...(await setOption(catalog, setId)),
        note: `${rank}${pairing}${missing}${holders}`,
      });
    }
  }

  return options;
}

/** Every set in the catalog, alphabetical, for when the ranking is wrong. */
function allSets(catalog: Catalog): Promise<SetOption[]> {
  return Promise.all(catalog.index.artifactsSorted.map((set) => setOption(catalog, set.id)));
}

/**
 * One set as the picker needs it: what it looks like and what it does.
 *
 * The flower stands for the set — it is the piece every set has and the one
 * the game itself leads with — falling back to whatever piece exists for the
 * circlet-only sets.
 */
async function setOption(catalog: Catalog, setId: number): Promise<SetOption> {
  const set = catalog.artifacts.get(setId);
  const icon = set?.pieces.flower?.icon
    ?? Object.values(set?.pieces ?? {}).map((piece) => piece?.icon).find(Boolean)
    ?? null;

  return {
    value: String(setId),
    name: set?.name ?? `#${setId}`,
    note: null,
    icon: await resolveIcon(icon, 'relic'),
    effects: setEffects(set),
  };
}
