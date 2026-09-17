import type { TeamRole } from './types';

/**
 * Reader-facing names for the roles.
 *
 * The enum is the contract between a team slot and a goal, so it stays in
 * English inside the data; only the label changes with the language. The
 * `common.role` messages carry the words; this just knows a goal with no role
 * reads as "no role" rather than as nothing.
 */
export function roleLabel(t: (key: string) => string, role: TeamRole | null) {
  return role === null ? t('none') : t(role);
}
