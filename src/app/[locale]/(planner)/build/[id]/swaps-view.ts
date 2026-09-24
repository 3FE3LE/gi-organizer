import 'server-only';

import { getTranslations } from 'next-intl/server';

import { statLabel } from '@/lib/data/catalog';

import type { BuildContext } from './context';
import type { SlotPanel, SwapRow } from './swaps';

/**
 * The changes tab: per slot, what is worn and what would beat it.
 *
 * A swap that displaces someone else has to be on the set plan, or it is a
 * trade this character cannot justify — the same rule the gear tab applies to
 * candidate lists, applied here to the argument for making the move.
 *
 * Only the verdict is built here. The pieces themselves are drawn by the box's
 * own card, from the box's own read, so a piece looks the same on this tab as
 * it does on the artifacts page.
 */
export async function swapPanelsFor(context: BuildContext): Promise<SlotPanel[]> {
  const { catalog, characterId, plannedSetIds, suggestions } = context;
  const slotLabel = await getTranslations('common.slot');

  const holderOf = (instanceId: string) => suggestions.holderOf.get(instanceId) ?? null;

  return suggestions.comparisons.map((comparison): SlotPanel => ({
    slot: comparison.slot,
    title: slotLabel.has(comparison.slot) ? slotLabel(comparison.slot) : comparison.slot,
    equippedId: comparison.equipped?.instanceId ?? null,
    swaps: comparison.swaps
      .filter((swap) => {
        const holderId = holderOf(swap.candidate.instanceId);
        return holderId === null
          || holderId === characterId
          || plannedSetIds.has(swap.candidate.setId);
      })
      .map((swap): SwapRow => ({
        instanceId: swap.candidate.instanceId,
        kind: swap.kind,
        delta: swap.delta,
        potentialDelta: swap.potentialDelta,
        bestCaseDelta: swap.bestCaseDelta,
        remainingRolls: swap.potential.remainingRolls,
        keepsSetBonus: swap.keepsSetBonus,
        holderId: holderOf(swap.candidate.instanceId),
        goalChanges: swap.goalChanges.map((change) => ({
          label: statLabel(catalog, change.prop),
          from: change.from,
          to: change.to,
        })),
      })),
  }));
}
