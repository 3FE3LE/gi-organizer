'use client';

import { createContext, use, useOptimistic } from 'react';

/**
 * Who is in the plan, as the player has just said — before the server agrees.
 *
 * Dismissing or restoring somebody is a write, a re-render of the whole plan
 * and a round trip, and the chip, the counts and the trigger used to wait for
 * all three before changing: a second or two in which the click looked
 * ignored. Each click is recorded here as a patch the moment it happens;
 * every reader applies the patches over what the server last said, and React
 * drops them when the action settles and the server's answer takes over.
 */

type Patch = { ids: readonly number[] | 'all'; dismissed: boolean };

type Optimism = {
  /** Whether `characterId` reads as dismissed, given what the server said. */
  isDismissed: (characterId: number, fromServer: boolean) => boolean;
  /** Records a click. Only callable inside an action or a transition. */
  apply: (patch: Patch) => void;
};

const RosterOptimismContext = createContext<Optimism | null>(null);

export function RosterOptimismProvider({ children }: { children: React.ReactNode }) {
  const [patches, addPatch] = useOptimistic<Patch[], Patch>([], (state, patch) => [...state, patch]);

  const isDismissed = (characterId: number, fromServer: boolean) =>
    patches.reduce(
      (dismissed, patch) =>
        patch.ids === 'all' || patch.ids.includes(characterId) ? patch.dismissed : dismissed,
      fromServer,
    );

  return (
    <RosterOptimismContext value={{ isDismissed, apply: addPatch }}>
      {children}
    </RosterOptimismContext>
  );
}

/** Outside the provider nothing is pending, and the server's word stands. */
export function useRosterOptimism(): Optimism {
  return use(RosterOptimismContext) ?? { isDismissed: (_, fromServer) => fromServer, apply: () => {} };
}

/** How many of `entries` read as in the plan right now. */
export function usePlannedCount(entries: readonly { characterId: number; dismissed: boolean }[]) {
  const { isDismissed } = useRosterOptimism();
  return entries.filter((entry) => !isDismissed(entry.characterId, entry.dismissed)).length;
}
