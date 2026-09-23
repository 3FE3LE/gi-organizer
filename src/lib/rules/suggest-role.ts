import type { TeamRole } from './types';

/**
 * The role a member starts with when added to a team.
 *
 * Adding someone used to mean ticking a role first, from nine chips, before
 * the character could even be chosen — a question the app is in a better
 * position to answer than the player. It still matters (the slot's role picks
 * the goal it is measured against, and the sets it is offered), so it is
 * answered rather than skipped, and the answer stays one click from changing.
 *
 * In order of how much each source knows about this player:
 *
 *   1. A goal the player wrote with a role. They have said what this
 *      character is for.
 *   2. The community build's role. `Support` is too broad to act on, so it is
 *      narrowed by the kit's own English text: a support that restores HP is
 *      a healer, one that makes a shield is a shielder, anyone else buffs.
 *   3. Nothing. An empty role is a valid slot, and guessing `sub-dps` for a
 *      character nobody has classified would be a claim without a source.
 */
export function suggestRoles(input: {
  ownRoles: (TeamRole | null)[];
  communityRole: string | null;
  /** The combat talents' and passives' English descriptions, joined. */
  kitText: string;
}): TeamRole[] {
  const own = input.ownRoles.find((role): role is TeamRole => role !== null);
  if (own) return [own];

  switch (input.communityRole?.trim().toLowerCase()) {
    case 'main dps':
    case 'dps':
      return ['main-dps'];
    case 'sub dps':
      return ['sub-dps'];
    case 'support':
      if (HEALS.test(input.kitText)) return ['healer'];
      if (SHIELDS.test(input.kitText)) return ['shielder'];
      return ['buffer'];
    default:
      return [];
  }
}

/** "restores HP", "regenerate HP", "heals" — the game's words for a heal. */
const HEALS = /\b(restor\w*|regenerat\w*)\b[^.]*\bHP\b|\bheal(s|ing)?\b/i;
const SHIELDS = /\bshields?\b/i;
