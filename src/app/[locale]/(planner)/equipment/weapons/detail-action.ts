'use server';

import { notFound } from 'next/navigation';

import { weaponGachaIcon } from '@/lib/data/assets';
import { propLabel } from '@/lib/data/catalog';
import { resolveIcon } from '@/lib/data/icon';
import { isLocale } from '@/lib/data/locales';
import { formatPropValue } from '@/lib/data/props';
import { STAT_LEVEL_KEYS } from '@/lib/data/stats';
import { weaponKey } from '@/lib/data/weapon-types';
import { getDb } from '@/lib/db/client';
import { readWeapons } from '@/lib/player/queries';
import { getAccountCatalog } from '@/lib/player/traveler';
import type { WeaponPassiveText } from '@/components/weapon-passive';

export type WeaponDetail = {
  name: string;
  description: string;
  rarity: number;
  type: string | null;
  typeText: string;
  /** The wish art, and the inventory icon to fall back on where it is missing. */
  art: string | null;
  icon: string | null;
  atkLabel: string;
  subLabel: string | null;
  /** One row per level the game shows a weapon at, 1 to the cap. */
  rows: { level: number; atk: number; sub: string | null }[];
  passive: WeaponPassiveText | null;
  copies: { id: string; holder: string | null; holderIcon: string | null; refinement: number; level: number }[];
};

/**
 * Everything the weapon dialog draws, asked for when it opens.
 *
 * A grid of two hundred weapons cannot carry each one's level table, wish art
 * and copies on the page for a dialog most of them will never open, so the
 * card only knows the weapon's id and this answers for the one tapped.
 */
export async function loadWeaponDetail(input: { locale: string; weaponId: number }): Promise<WeaponDetail | null> {
  if (!isLocale(input.locale)) notFound();

  const catalog = await getAccountCatalog(input.locale);
  const weapon = catalog.weapons.get(input.weaponId);
  if (!weapon) return null;

  // The table's levels before each ascension, the way the game lists them.
  const rows = STAT_LEVEL_KEYS
    .filter((key) => !key.endsWith('+') && weapon.stats[key])
    .map((key) => {
      const stats = weapon.stats[key];
      return {
        level: Number.parseInt(key, 10),
        atk: Math.round(stats.attack ?? 0),
        sub: weapon.mainStatType
          ? formatPropValue(weapon.mainStatType, stats.specialized ?? 0, 'ratio', input.locale)
          : null,
      };
    });

  const copies = (await readWeapons(getDb()))
    .filter((copy) => copy.weaponId === weapon.id)
    .sort((a, b) =>
      Number(b.equippedTo !== null) - Number(a.equippedTo !== null)
      || b.refinement - a.refinement || b.level - a.level);

  return {
    name: weapon.name,
    description: weapon.description,
    rarity: weapon.rarity,
    type: weaponKey(weapon.weaponType) ?? null,
    typeText: weapon.weaponText,
    art: await resolveIcon(weaponGachaIcon(weapon.icon), 'weaponGacha'),
    icon: await resolveIcon(weapon.icon, 'weapon'),
    atkLabel: propLabel(catalog, 'FIGHT_PROP_ATTACK'),
    subLabel: weapon.mainStatType ? propLabel(catalog, weapon.mainStatType) : null,
    rows,
    passive: weapon.effectName
      ? { name: weapon.effectName, refinements: weapon.refinementsRaw ?? weapon.refinements }
      : null,
    copies: await Promise.all(copies.map(async (copy) => {
      const holder = copy.equippedTo === null ? undefined : catalog.characters.get(copy.equippedTo);
      return {
        id: copy.id,
        holder: copy.equippedTo === null ? null : holder?.name ?? `#${copy.equippedTo}`,
        holderIcon: await resolveIcon(holder?.icon, 'avatar'),
        refinement: copy.refinement,
        level: copy.level,
      };
    })),
  };
}
