import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import { getWeaponSources } from '@/lib/data/registry';
import { ownedRefinement, plannedRefinement, type WeaponCopy } from '@/lib/rules/refinement';

import { getProfileId } from './db';

/** Every owned copy, by weapon id: its refinement and who wears it. */
export async function readWeaponCopies(db: Db = getDb()): Promise<Map<number, WeaponCopy[]>> {
  const rows = (await db
    .prepare(`SELECT weapon_id AS weaponId, refinement, assigned_character_id AS holder
              FROM weapon_instance WHERE profile_id = ?`)
    .all(await getProfileId(db))) as unknown as {
      weaponId: number; refinement: number; holder: number | null;
    }[];

  const copies = new Map<number, WeaponCopy[]>();
  for (const row of rows) {
    copies.set(row.weaponId, [
      ...(copies.get(row.weaponId) ?? []),
      { refinement: row.refinement, holder: row.holder },
    ]);
  }
  return copies;
}

/** The weapons a refinement can be planned for: the forged ones. */
export async function forgeableWeapons(): Promise<Set<number>> {
  return new Set(
    [...await getWeaponSources()]
      .filter(([, entry]) => entry.source === 'forge')
      .map(([weaponId]) => weaponId),
  );
}

/**
 * Everything `plannedRefinement` needs, loaded once, for callers that resolve
 * more than one weapon — the rules pass resolves one per character.
 */
export async function refinementResolver(db: Db = getDb()) {
  const [copies, forgeable] = await Promise.all([readWeaponCopies(db), forgeableWeapons()]);

  return {
    copies,
    forgeable,
    resolve: (characterId: number, weaponId: number, stored: number | null) =>
      plannedRefinement({
        stored,
        forgeable: forgeable.has(weaponId),
        owned: ownedRefinement(copies.get(weaponId), characterId),
      }),
  };
}
