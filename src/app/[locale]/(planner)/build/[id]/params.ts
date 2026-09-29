import { createLoader, createSerializer, parseAsString, parseAsStringLiteral } from 'nuqs/server';

/**
 * Which build is on screen, and which slice of it.
 *
 * Both live in the URL so a link goes where it says and a save comes back to
 * the same tab. Parsed and rebuilt from one definition, so a tab link cannot
 * spell a key the page then fails to read.
 */

/**
 * The tabs: the plan, alone now.
 *
 * There were four. The last to go was `Cambios`, a per-slot list of swaps: it
 * ranked pieces by a score that could barely tell a fresh piece with perfect
 * rolls from a finished one a few crit points ahead, and the gear dialog opened
 * from each slot already compares the two side by side.
 *
 * Before it, a gear tab listing every slot's candidates repeated what
 * the character panel above it already showed, so editing a piece moved onto
 * the piece. A `Ficha` tab held the reference material — talents,
 * constellations, the stat table, the material costs — under a panel that was
 * already drawing every talent and constellation as an icon.
 *
 * None of that reference is gone; all of it got smaller. The icons open their
 * own text (`abilities.tsx`). The fourteen-row stat table is one row and a
 * slider (`base-stats.tsx`). The two lists of per-phase costs are seven totals
 * with the bag and the levelled phases already subtracted (`cost-view.ts`).
 * That is the whole of what the separate catalogue page used to hold, so that
 * page is gone too and this one serves every character, owned or not.
 *
 * An old `?tab=equipo` or `?tab=sheet` link falls back to the first tab rather
 * than 404ing, which is what the literal parser buys.
 */
export const TABS = [
  { key: 'objective', label: 'Objetivo' },
] as const;

export type Tab = (typeof TABS)[number]['key'];

const TAB_KEYS = TABS.map((tab) => tab.key) as unknown as readonly [Tab, ...Tab[]];

export const buildParsers = {
  build: parseAsString,
  tab: parseAsStringLiteral(TAB_KEYS).withDefault('objective'),
};

export const loadBuildParams = createLoader(buildParsers);
export const serializeBuildParams = createSerializer(buildParsers);
