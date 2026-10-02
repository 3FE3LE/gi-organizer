import 'server-only';

import type { Catalog } from '@/lib/data/catalog';
import { getLevellingData } from '@/lib/data/registry';
import { talentBonusAt } from '@/lib/data/talent-bonus';
import { getDb, type Db } from '@/lib/db/client';
import { readRoster } from '@/lib/player/characters';
import { getProfileId, readInventory, readMaterialStock } from '@/lib/player/db';

import {
  characterReach,
  moved,
  talentReach,
  weaponReach,
  type CharacterReach,
  type TalentReach,
  type WeaponReach,
} from './affordable';
import { ASSUMED_TARGET, talentCostsOf } from './materials';

const MORA = 202;

export type Ready = {
  characters: CharacterReach[];
  /** With what the constellation adds to each, for drawing. See `talentBonusAt`. */
  talents: (TalentReach & { bonus: { auto: number; skill: number; burst: number } })[];
  weapons: WeaponReach[];
  /** Acquaint Fates the character rows would grant, all told. */
  fates: number;
  /** The mora in the bag. */
  mora: number;
  /**
   * The mora the cheapest next step asks for — a talent level or a phase, for
   * anyone in scope — so an empty page can say what is in the way.
   */
  cheapestStep: number | null;
};

/**
 * What the bag pays for, across the plan: whoever is in it, and the weapon
 * each of them holds. Only what moves — a character the bag cannot take a
 * level further has nothing to say here, and neither does one already at
 * their target.
 *
 * `characterIds` narrows it to some of them, for a build's own page.
 */
export async function readyToLevel(
  catalog: Catalog,
  db: Db = getDb(),
  characterIds?: ReadonlySet<number>,
): Promise<Ready> {
  const profileId = await getProfileId(db);
  const [roster, stock, inventory, data] = await Promise.all([
    readRoster(db, profileId),
    readMaterialStock(db, profileId),
    readInventory(db, profileId),
    getLevellingData(),
  ]);

  // Everyone in the plan, or — asked for by name, on a build's own page —
  // those characters whether the plan counts them or not.
  const planned = roster.filter((entry) =>
    characterIds ? characterIds.has(entry.characterId) : entry.dismissedAt === null);

  const characters: CharacterReach[] = [];
  const talents: Ready['talents'] = [];
  const moraOf = (items: readonly { id: number; count: number }[] | undefined) =>
    items?.find((item) => item.id === MORA)?.count ?? null;
  let cheapestStep: number | null = null;
  const consider = (cost: number | null) => {
    if (cost !== null && (cheapestStep === null || cost < cheapestStep)) cheapestStep = cost;
  };

  for (const entry of planned) {
    const character = catalog.characters.get(entry.characterId);
    if (!character) continue;

    // The target the plan uses, written or assumed, so what "ready" climbs to
    // and what the plan says is missing are the same goal.
    const target = {
      level: entry.target.level ?? ASSUMED_TARGET.level,
      ascension: entry.target.ascension ?? ASSUMED_TARGET.ascension,
    };
    const talentTarget = entry.target.talents ?? {
      auto: Math.max(entry.talent.auto, ASSUMED_TARGET.talents.auto),
      skill: Math.max(entry.talent.skill, ASSUMED_TARGET.talents.skill),
      burst: Math.max(entry.talent.burst, ASSUMED_TARGET.talents.burst),
    };

    if (entry.ascension < target.ascension) consider(moraOf(character.costs[`ascend${entry.ascension + 1}`]));
    for (const key of ['auto', 'skill', 'burst'] as const) {
      if (entry.talent[key] < talentTarget[key]) consider(moraOf(talentCostsOf(character, key)[`lvl${entry.talent[key] + 1}`]));
    }

    const reach = characterReach({
      characterId: entry.characterId,
      current: { level: entry.level, ascension: entry.ascension },
      target,
      ascensionCosts: character.costs,
      stock,
      data,
    });
    if (moved(reach)) characters.push(reach);

    const talent = talentReach({
      characterId: entry.characterId,
      current: entry.talent,
      target: talentTarget,
      talentCosts: character.talentCosts,
      talentCostsBy: character.talentCostsBy,
      stock,
      character: { level: entry.level, ascension: entry.ascension },
      ascensionCosts: character.costs,
      data,
    });
    if (talent.levels > 0) talents.push({ ...talent, bonus: talentBonusAt(character.talentBoosts, entry.constellation) });
  }

  const plannedIds = new Set(planned.map((entry) => entry.characterId));
  const weapons: WeaponReach[] = [];
  for (const owned of inventory.weapons) {
    if (owned.equippedTo === null || !plannedIds.has(owned.equippedTo)) continue;
    const weapon = catalog.weapons.get(owned.weaponId);
    if (!weapon) continue;

    const reach = weaponReach({
      instanceId: owned.id,
      weaponId: owned.weaponId,
      holderId: owned.equippedTo,
      rarity: weapon.rarity,
      current: { level: owned.level, ascension: owned.ascension },
      costs: weapon.costs,
      stock,
      data,
    });
    if (moved(reach)) weapons.push(reach);
  }

  // The fullest climbs first: what the bag goes furthest on is what to do first.
  characters.sort((a, b) => b.fates - a.fates || (b.to.level - b.from.level) - (a.to.level - a.from.level));
  talents.sort((a, b) => b.levels - a.levels);
  weapons.sort((a, b) => Number(b.maxed) - Number(a.maxed) || (b.to.level - b.from.level) - (a.to.level - a.from.level));

  return {
    characters,
    talents,
    weapons,
    fates: characters.reduce((sum, reach) => sum + reach.fates, 0),
    mora: stock.get(MORA) ?? 0,
    cheapestStep,
  };
}
