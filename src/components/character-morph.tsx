import { ViewTransition } from 'react';

/**
 * A character's face that grows into the splash of the build page it opens.
 *
 * The build page names its splash `character-<id>`, and any element under the
 * same name on the page being left pairs with it: the browser moves one object
 * instead of swapping two. The roster did this on its own; every other face
 * that opens a build — the plan, the day card, the teams, what the bag pays
 * for, where to invest — goes through here so the gesture is the same from
 * wherever the click came.
 *
 * A name has to be unique on the page, or the browser drops the transition
 * altogether, so a list that can show one character twice passes `morph`
 * false on every face after the first (see `lib/morph-claim.ts`).
 */
export function CharacterMorph({
  id,
  morph = true,
  children,
}: {
  id: number;
  morph?: boolean;
  children: React.ReactNode;
}) {
  if (!morph) return children;
  return (
    <ViewTransition name={`character-${id}`} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}
