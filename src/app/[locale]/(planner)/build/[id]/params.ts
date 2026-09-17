import { createLoader, createSerializer, parseAsString, parseAsStringLiteral } from 'nuqs/server';

/**
 * Which build is on screen, and which slice of it.
 *
 * Both live in the URL so a link goes where it says and a save comes back to
 * the same tab. Parsed and rebuilt from one definition, so a tab link cannot
 * spell a key the page then fails to read.
 */

/**
 * The tabs, in the order they read: plan, decisions, reference.
 *
 * There was a fourth — a gear tab listing every slot's candidates — and it
 * repeated what the character panel above it already showed. Editing a piece
 * now happens on the piece, in that panel, so the tab had nothing left of its
 * own to say. An old `?tab=equipo` link falls back to the first tab rather than
 * 404ing, which is what the literal parser buys.
 */
export const TABS = [
  { key: 'objective', label: 'Objetivo' },
  { key: 'changes', label: 'Cambios' },
  { key: 'sheet', label: 'Ficha' },
] as const;

export type Tab = (typeof TABS)[number]['key'];

const TAB_KEYS = TABS.map((tab) => tab.key) as unknown as readonly [Tab, ...Tab[]];

export const buildParsers = {
  build: parseAsString,
  tab: parseAsStringLiteral(TAB_KEYS).withDefault('objective'),
};

export const loadBuildParams = createLoader(buildParsers);
export const serializeBuildParams = createSerializer(buildParsers);
