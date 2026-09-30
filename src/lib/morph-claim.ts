import 'server-only';

import { cache } from 'react';

/**
 * Which characters already carry the morph name on the page being rendered.
 *
 * One set per request, shared by every server component that draws a face:
 * the plan's day card and its list, the two lists of what the bag pays for,
 * the steps of where to invest. The first face of a character claims the name
 * and the rest render plain, so the page never carries a name twice — which
 * the browser answers by skipping the transition entirely.
 */
const claimed = cache(() => new Set<number>());

export function claimMorph(characterId: number) {
  const set = claimed();
  if (set.has(characterId)) return false;
  set.add(characterId);
  return true;
}
