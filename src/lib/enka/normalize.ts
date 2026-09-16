import type { ArtifactSlot, EnkaStore } from '@/lib/data/types';
import { IssueLog } from '@/lib/inventory/guards';
import type {
  NormalizedArtifact,
  NormalizedCharacter,
  NormalizedImport,
  NormalizedStat,
  NormalizedWeapon,
} from '@/lib/inventory/model';

import {
  type EnkaAvatarInfo,
  type EnkaResponse,
  isReliquary,
  isWeapon,
  propNumber,
} from './schema';
import { SLOT_BY_EQUIP_TYPE } from './slots';

/**
 * Turns an Enka showcase into the same normalized shape a GOOD file produces.
 *
 * Two scales differ from GOOD and are converted here rather than downstream:
 * `reliquary.level` is 1-based, and `affixMap`'s value is a zero-based
 * refinement. Both are off-by-one bugs that still look plausible in a UI, so
 * they are fixed once, at the boundary, with the reason written down.
 */

export type NormalizeOptions = {
  store: EnkaStore;
  observedAt?: string;
};

export function normalizeEnka(
  response: EnkaResponse,
  options: NormalizeOptions,
): NormalizedImport {
  const log = new IssueLog();
  const observedAt = options.observedAt ?? new Date().toISOString();

  const characters: NormalizedCharacter[] = [];
  const weapons: NormalizedWeapon[] = [];
  const artifacts: NormalizedArtifact[] = [];

  const shown = response.avatarInfoList ?? [];
  if (shown.length === 0) {
    log.add('envelope', 'avatarInfoList', 'the showcase is hidden or empty', {
      severity: 'warning',
    });
  }

  shown.forEach((avatar, index) => {
    const path = `avatarInfoList[${index}]`;
    characters.push(normalizeCharacter(avatar, options.store, path, log));

    for (const equip of avatar.equipList ?? []) {
      if (isWeapon(equip)) {
        weapons.push({
          weaponId: equip.itemId,
          level: equip.weapon.level,
          ascension: equip.weapon.promoteLevel ?? 0,
          // `affixMap` counts refinements from zero.
          refinement: 1 + (Object.values(equip.weapon.affixMap ?? {})[0] ?? 0),
          // Enka does not report locks, and unknown is not the same as false.
          lock: null,
          equippedTo: avatar.avatarId,
        });
        continue;
      }

      if (!isReliquary(equip)) continue;

      const slot = SLOT_BY_EQUIP_TYPE[equip.flat.equipType];
      if (!slot) {
        log.add('unknown-slot', `${path}.equipList`, `unknown slot ${equip.flat.equipType}`, {
          raw: equip.flat.equipType,
        });
        continue;
      }

      artifacts.push({
        setId: equip.flat.setId,
        slot: slot as ArtifactSlot,
        rarity: equip.flat.rankLevel,
        // 1-based upstream: a `+20` piece reports 21.
        level: Math.max(0, equip.reliquary.level - 1),
        mainProp: equip.flat.reliquaryMainstat.mainPropId,
        substats: (equip.flat.reliquarySubstats ?? []).map(toStat),
        // Enka reports the roll history instead, which is strictly better.
        unactivatedSubstats: [],
        lock: null,
        rollHistory: equip.reliquary.appendPropIdList ?? null,
        equippedTo: avatar.avatarId,
      });
    }
  });

  return {
    source: 'enka',
    // Eight characters at most. Its silence about the rest is not evidence,
    // which is what keeps a seed from ever deleting a collection.
    coverage: 'partial',
    observedAt,
    origin: `enka:${response.uid}`,
    characters,
    weapons,
    artifacts,
    // A showcase says nothing about the material bag.
    materials: [],
    issues: log.issues,
  };
}

function toStat(stat: { appendPropId: string; statValue: number }): NormalizedStat {
  return { prop: stat.appendPropId, value: stat.statValue };
}

function normalizeCharacter(
  avatar: EnkaAvatarInfo,
  store: EnkaStore,
  path: string,
  log: IssueLog,
): NormalizedCharacter {
  // Only the Traveler is keyed by depot, because only the Traveler's skills
  // change with the element. Everyone else is keyed by avatar id alone.
  const depotKey = `${avatar.avatarId}-${avatar.skillDepotId}`;
  const depotEntry = avatar.skillDepotId === undefined ? undefined : store[depotKey];
  const entry = depotEntry ?? store[String(avatar.avatarId)];

  const talent = { auto: 1, skill: 1, burst: 1 };
  const bonus = { auto: 0, skill: 0, burst: 0 };
  const slots = ['auto', 'skill', 'burst'] as const;

  if (!entry || entry.skillOrder.length < 3) {
    // Without the ordering table the levels are keyed by an id with no meaning,
    // so reporting nothing beats guessing which talent they belong to.
    log.add('missing-field', `${path}.skillLevelMap`, 'no skill order for this avatar', {
      raw: avatar.avatarId,
      severity: 'warning',
    });
  } else {
    entry.skillOrder.slice(0, 3).forEach((skillId, index) => {
      const slot = slots[index];
      talent[slot] = avatar.skillLevelMap[String(skillId)] ?? 1;

      // The +3 from C3/C5 is keyed by proud-skill group, not by skill.
      const proudId = entry.proudMap[String(skillId)];
      bonus[slot] = avatar.proudSkillExtraLevelMap?.[String(proudId)] ?? 0;
    });
  }

  return {
    characterId: avatar.avatarId,
    // Set only when the depot form matched, which is the one case where the
    // element is a property of the build rather than of the character.
    travelerElement: depotEntry?.element ?? null,
    level: propNumber(avatar.propMap, 'level'),
    ascension: propNumber(avatar.propMap, 'ascension'),
    // One entry per unlocked constellation.
    constellation: avatar.talentIdList?.length ?? 0,
    talent,
    talentBonus: bonus,
  };
}
