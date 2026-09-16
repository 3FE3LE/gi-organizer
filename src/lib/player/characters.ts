import 'server-only';

import type { Db } from '@/lib/db/client';


import type { NormalizedCharacter } from '@/lib/inventory/model';

/**
 * The roster: one row per character the player owns, holding the progression
 * that gear alone does not describe.
 *
 * Written by an import when the source saw the character, and by hand when it
 * did not. Inventory Kamera scans the character screen separately from the
 * inventory, so a real export can carry a character's gear while omitting the
 * character — the Traveler being the case that actually happens.
 */

export type CharacterTarget = {
  level: number | null;
  ascension: number | null;
  talents: { auto: number; skill: number; burst: number } | null;
};

export type CharacterBuild = {
  characterId: number;
  level: number;
  ascension: number;
  constellation: number;
  talent: { auto: number; skill: number; burst: number };
  talentBonus: { auto: number; skill: number; burst: number } | null;
  skillDepotId: number | null;
  /**
   * Where the player is taking them. There is one character to ascend and one
   * set of talents to feed, so this belongs here rather than on each goal —
   * the material planner always had to reconcile it across goals anyway.
   */
  target: CharacterTarget;
  notes: string | null;
  seenFrom: string;
  seenAt: string;
};

type Row = {
  character_id: number;
  level: number;
  ascension: number;
  constellation: number;
  talent_auto: number;
  talent_skill: number;
  talent_burst: number;
  talent_bonus_json: string | null;
  skill_depot_id: number | null;
  target_level: number | null;
  target_ascension: number | null;
  target_talents_json: string | null;
  notes: string | null;
  seen_from: string;
  seen_at: string;
};

export async function readRoster(db: Db, profileId: string): Promise<CharacterBuild[]> {
  const rows = (await db
    .prepare(`SELECT character_id, level, ascension, constellation, talent_auto,
                     talent_skill, talent_burst, talent_bonus_json, skill_depot_id,
                     target_level, target_ascension, target_talents_json,
                     notes, seen_from, seen_at
              FROM character_build WHERE profile_id = ?`)
    .all(profileId)) as unknown as Row[];

  return rows.map((row) => ({
    characterId: row.character_id,
    level: row.level,
    ascension: row.ascension,
    constellation: row.constellation,
    talent: { auto: row.talent_auto, skill: row.talent_skill, burst: row.talent_burst },
    talentBonus: row.talent_bonus_json
      ? (JSON.parse(row.talent_bonus_json) as CharacterBuild['talentBonus'])
      : null,
    skillDepotId: row.skill_depot_id,
    target: {
      level: row.target_level,
      ascension: row.target_ascension,
      talents: row.target_talents_json
        ? (JSON.parse(row.target_talents_json) as CharacterTarget['talents'])
        : null,
    },
    notes: row.notes,
    seenFrom: row.seen_from,
    seenAt: row.seen_at,
  }));
}

export type UpsertOptions = {
  source: string;
  observedAt: string;
};

/**
 * Upserts a character.
 *
 * `talent_bonus_json` is only written when the incoming source can observe it.
 * GOOD cannot express the constellation +3, so a GOOD import must leave a value
 * an Enka import established rather than replacing it with nothing.
 */
export async function upsertCharacter(
  db: Db,
  profileId: string,
  character: NormalizedCharacter,
  options: UpsertOptions,
) {
  await db.prepare(`
    INSERT INTO character_build
      (profile_id, character_id, level, ascension, constellation,
       talent_auto, talent_skill, talent_burst, talent_bonus_json,
       skill_depot_id, notes, seen_at, seen_from)
    VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?)
    ON CONFLICT (profile_id, character_id) DO UPDATE SET
      level = excluded.level,
      ascension = excluded.ascension,
      constellation = excluded.constellation,
      talent_auto = excluded.talent_auto,
      talent_skill = excluded.talent_skill,
      talent_burst = excluded.talent_burst,
      talent_bonus_json = COALESCE(excluded.talent_bonus_json, character_build.talent_bonus_json),
      skill_depot_id = COALESCE(excluded.skill_depot_id, character_build.skill_depot_id),
      seen_at = excluded.seen_at,
      seen_from = excluded.seen_from
  `).run(
    profileId,
    character.characterId,
    character.level,
    character.ascension,
    character.constellation,
    character.talent.auto,
    character.talent.skill,
    character.talent.burst,
    character.talentBonus ? JSON.stringify(character.talentBonus) : null,
    null,
    options.observedAt,
    options.source,
  );
}

/**
 * Where the player is taking this character.
 *
 * Separate from `upsertCharacter` on purpose: an import observes what a
 * character *is* and must never touch what the player decided they should
 * become.
 */
export async function setCharacterTarget(
  db: Db,
  profileId: string,
  characterId: number,
  target: CharacterTarget,
) {
  return (await db
    .prepare(`UPDATE character_build
              SET target_level = ?, target_ascension = ?, target_talents_json = ?
              WHERE profile_id = ? AND character_id = ?`)
    .run(
      target.level,
      target.ascension,
      target.talents ? JSON.stringify(target.talents) : null,
      profileId,
      characterId,
    )).changes;
}

export async function deleteCharacter(db: Db, profileId: string, characterId: number) {
  return (await db
    .prepare('DELETE FROM character_build WHERE profile_id = ? AND character_id = ?')
    .run(profileId, characterId)).changes;
}

/**
 * Which characters the player actually has.
 *
 * A roster row is the record of ownership: it exists because an import saw the
 * character on the account, or because the player typed it in. Owning gear for
 * someone is not the same thing — a scan reads the inventory and the character
 * screen separately, so gear can arrive without its owner.
 */
export async function readOwnedCharacterIds(db: Db, profileId: string) {
  const rows = (await db
    .prepare('SELECT character_id FROM character_build WHERE profile_id = ?')
    .all(profileId)) as unknown as { character_id: number }[];

  return new Set(rows.map((row) => row.character_id));
}
