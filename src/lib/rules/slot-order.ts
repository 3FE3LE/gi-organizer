import type { TeamRole } from './types';

/**
 * Where a new member sits, by what they do.
 *
 * The party order is the rotation's, and it has a shape most teams share: the
 * one on the field goes second, the one keeping everyone alive goes last, and
 * the off-field damage and buffs fill the first and third. Opening the second
 * slot for the carry is the point — so everyone else takes it only when there
 * is nowhere else to go, and a carry added last still finds it free.
 *
 * Positions are 0-based: 1 is the second slot.
 */
const ORDER: { roles: TeamRole[]; positions: number[] }[] = [
  { roles: ['main-dps', 'driver'], positions: [1, 0, 2, 3] },
  { roles: ['healer', 'shielder', 'debuffer'], positions: [3, 2, 0, 1] },
  { roles: ['sub-dps'], positions: [0, 2, 3, 1] },
  { roles: ['buffer', 'battery', 'enabler'], positions: [2, 0, 3, 1] },
];

const UNROLED = [0, 2, 3, 1];

/**
 * The positions to try, best first. A member with several roles is placed by
 * the one that pins them hardest: a carry who also batteries is still the
 * carry, so the list is read top to bottom and the first match wins.
 */
export function preferredPositions(roles: readonly TeamRole[]): number[] {
  return ORDER.find((entry) => entry.roles.some((role) => roles.includes(role)))?.positions
    ?? UNROLED;
}
