import type { TeamRole } from './types';

/**
 * Reader-facing names for the roles.
 *
 * The enum is the contract between a team slot and a goal, so it stays in
 * English inside the data; only the label changes with the language. Shared
 * because both the team board and the goal picker name the same nine things.
 */
export const ROLE_LABELS: Record<TeamRole, string> = {
  'main-dps': 'DPS principal',
  'sub-dps': 'Sub-DPS',
  healer: 'Sanador',
  shielder: 'Escudero',
  buffer: 'Potenciador',
  debuffer: 'Debilitador',
  battery: 'Batería',
  driver: 'Conductor',
  enabler: 'Habilitador',
};

/** A goal has no name: what it is for is its identity. */
export function roleLabel(role: TeamRole | null) {
  return role === null ? 'Sin rol' : ROLE_LABELS[role];
}
