import { fold } from '@/app/[locale]/characters/filters';
import { weaponKey } from '@/lib/data/weapon-types';

import type { WeaponFilters } from './filters';

/** What narrowing reads off a catalogue weapon. */
export type Narrowable = {
  id: number;
  name: string;
  rarity: number;
  weaponType: string;
  /** Empty on the one- and two-star weapons, which have no passive. */
  effectName: string;
};

/** What it reads off one owned copy. */
export type Copy = { weaponId: number; level: number; refinement: number; equippedTo: number | null };

export type OwnedWeapon<W, C> = { weapon: W; copies: C[] };

/**
 * The tab's two lists after the search, the chips and the order: the weapons
 * the account holds, one entry per weapon with every copy under it, and the
 * ones it does not, for their passives.
 *
 * One entry per weapon rather than per copy, because the bag is mostly the
 * same three-star five times over and a card each was five identical passives
 * in a row. The copies are what differ, so they are listed on the card — worn
 * first, then by refinement and level.
 *
 * Values within one filter widen (a sword or a bow), filters together narrow
 * (a bow, and five stars). Who holds a copy narrows the copies rather than the
 * weapons, and with it on the weapons nobody owns drop out: no copy of them is
 * free or worn.
 */
export function narrowWeapons<W extends Narrowable, C extends Copy>(
  catalogue: readonly W[],
  copies: readonly C[],
  filters: Pick<WeaponFilters, 'q' | 'type' | 'rarity' | 'held' | 'sort'>,
  locale: string,
): { owned: OwnedWeapon<W, C>[]; missing: W[]; ownedTotal: number } {
  const query = fold(filters.q.trim());
  const types = new Set<string>(filters.type);
  const rarities = new Set(filters.rarity);
  const matches = (weapon: W) =>
    (!query || fold(weapon.name).includes(query))
    && (types.size === 0 || types.has(weaponKey(weapon.weaponType) ?? ''))
    && (rarities.size === 0 || rarities.has(weapon.rarity));

  const byWeapon = new Map<number, C[]>();
  for (const copy of copies) {
    byWeapon.set(copy.weaponId, [...(byWeapon.get(copy.weaponId) ?? []), copy]);
  }

  const held = (copy: C) =>
    filters.held === null || (filters.held === 'worn') === (copy.equippedTo !== null);
  const byCopy = (a: C, b: C) =>
    Number(b.equippedTo !== null) - Number(a.equippedTo !== null)
    || b.refinement - a.refinement
    || b.level - a.level;

  const owned = catalogue.flatMap((weapon) => {
    const kept = (byWeapon.get(weapon.id) ?? []).filter(held).sort(byCopy);
    return kept.length > 0 && matches(weapon) ? [{ weapon, copies: kept }] : [];
  });

  const best = (entry: OwnedWeapon<W, C>, key: 'level' | 'refinement') =>
    Math.max(...entry.copies.map((copy) => copy[key]));
  const byName = (a: W, b: W) => a.name.localeCompare(b.name, locale);

  owned.sort((a, b) => {
    switch (filters.sort) {
      case 'name':
        return byName(a.weapon, b.weapon);
      case 'level':
        return best(b, 'level') - best(a, 'level') || b.weapon.rarity - a.weapon.rarity
          || byName(a.weapon, b.weapon);
      case 'refinement':
        return best(b, 'refinement') - best(a, 'refinement') || b.weapon.rarity - a.weapon.rarity
          || byName(a.weapon, b.weapon);
      default:
        return b.weapon.rarity - a.weapon.rarity || best(b, 'level') - best(a, 'level')
          || byName(a.weapon, b.weapon);
    }
  });

  // Only weapons with a passive to read: that is what this list is for.
  const missing = filters.held !== null ? [] : catalogue
    .filter((weapon) => !byWeapon.has(weapon.id) && weapon.effectName !== '' && matches(weapon))
    .sort((a, b) => (filters.sort === 'name' ? 0 : b.rarity - a.rarity) || byName(a, b));

  return { owned, missing, ownedTotal: catalogue.filter((weapon) => byWeapon.has(weapon.id)).length };
}
