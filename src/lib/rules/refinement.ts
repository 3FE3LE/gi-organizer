/**
 * The refinement a planned weapon is at, which is the weapon's, not the plan's.
 *
 * It used to be a field of its own beside the weapon, stored twice — on the
 * build and on the scarcity target — and nothing re-derived it when the weapon
 * changed. Swap a Skyward Blade R2 for a Black Sword R1 and the plan kept
 * asking for a Black Sword *R2*, which the account does not own, so the rules
 * reported a weapon missing that was sitting in the bag. Filling a goal from
 * the role did the same with the community's minimum: R5 on a five-star.
 *
 * So it is read off the copy, and a stored number only counts where it can be
 * a plan at all:
 *
 *   - **Not forgeable:** refinement is copies you have or wish for, so it is
 *     the copy's. Nothing the player does changes it, and a stored R5 on a
 *     banner weapon is a wish the planner would otherwise cost out.
 *   - **Forgeable:** a billet makes another copy on demand, so a higher
 *     refinement is a real target — but never one below what is already held.
 *
 * "The copy" is the one the character wears when it is this weapon, and the
 * best one owned otherwise. With none owned it is R1, which is what makes the
 * missing-weapon report say the right thing.
 */
export type WeaponCopy = { refinement: number; holder: number | null };

export function ownedRefinement(
  copies: readonly WeaponCopy[] | undefined,
  characterId: number,
): number | null {
  if (!copies || copies.length === 0) return null;
  const worn = copies.find((copy) => copy.holder === characterId);
  return worn?.refinement ?? Math.max(...copies.map((copy) => copy.refinement));
}

export function plannedRefinement(input: {
  stored: number | null;
  forgeable: boolean;
  owned: number | null;
}): number {
  const floor = input.owned ?? 1;
  if (!input.forgeable) return floor;
  return Math.min(5, Math.max(input.stored ?? floor, floor));
}
