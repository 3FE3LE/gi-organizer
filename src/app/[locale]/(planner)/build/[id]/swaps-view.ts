import 'server-only';

import { getTranslations } from 'next-intl/server';

import { propLabel } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';

import type { BuildContext } from './context';
import type { SlotPanel, SwapRow } from './swaps';

/**
 * The changes tab: per slot, what is worn and what would beat it.
 *
 * A swap that displaces someone else has to be on the set plan, or it is a
 * trade this character cannot justify — the same rule the gear tab applies to
 * candidate lists, applied here to the argument for making the move.
 */
export async function swapPanelsFor(context: BuildContext): Promise<SlotPanel[]> {
  const { catalog, characterId, plannedSetIds, suggestions, format } = context;
  const slotLabel = await getTranslations('common.slot');

  const setName = (setId: number) => catalog.artifacts.get(setId)?.name ?? `#${setId}`;
  const holderOf = (instanceId: string) => suggestions.holderOf.get(instanceId) ?? null;

  return Promise.all(suggestions.comparisons.map(async (comparison): Promise<SlotPanel> => ({
    slot: comparison.slot,
    title: slotLabel.has(comparison.slot) ? slotLabel(comparison.slot) : comparison.slot,
    equipped: comparison.equipped
      ? {
          setName: setName(comparison.equipped.setId),
          icon: await resolveIcon(
            catalog.artifacts.get(comparison.equipped.setId)?.pieces[comparison.slot]?.icon,
            'relic',
          ),
          level: comparison.equipped.level,
          mainStat: propLabel(catalog, comparison.equipped.mainProp),
          stats: format.artifactStats(comparison.equipped),
        }
      : null,
    swaps: await Promise.all(
      comparison.swaps
        .filter((swap) => {
          const holderId = holderOf(swap.candidate.instanceId);
          return holderId === null
            || holderId === characterId
            || plannedSetIds.has(swap.candidate.setId);
        })
        .map(async (swap): Promise<SwapRow> => {
          const holderId = holderOf(swap.candidate.instanceId);

          return {
            instanceId: swap.candidate.instanceId,
            setName: setName(swap.candidate.setId),
            icon: await resolveIcon(
              catalog.artifacts.get(swap.candidate.setId)?.pieces[swap.candidate.slot]?.icon,
              'relic',
            ),
            level: swap.candidate.level,
            mainStat: propLabel(catalog, swap.candidate.mainProp),
            substats: swap.candidate.substats.map((substat) => propLabel(catalog, substat.prop)),
            kind: swap.kind,
            delta: swap.delta,
            potentialDelta: swap.potentialDelta,
            bestCaseDelta: swap.bestCaseDelta,
            remainingRolls: swap.potential.remainingRolls,
            keepsSetBonus: swap.keepsSetBonus,
            holder: format.holderName(holderId),
            holderId,
            goalChanges: swap.goalChanges.map((change) => ({
              label: propLabel(catalog, change.prop),
              from: change.from,
              to: change.to,
            })),
            stats: format.artifactStats(swap.candidate),
          };
        }),
    ),
  })));
}
