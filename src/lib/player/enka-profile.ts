import 'server-only';

import { getDb, type Db } from '@/lib/db/client';
import type { EnkaResponse } from '@/lib/enka/schema';

import { getProfileId } from './db';

/**
 * The account's UID and what Enka last showed for it.
 *
 * GOOD carries no UID, so the app asks for it once — in the settings, or by
 * remembering the one a showcase import was run with — and from then on reads
 * the showcase on its own. What is kept here is the profile the game shows to
 * anyone (nickname, adventure rank, world level, the abyss), who is in the
 * showcase, and when it was read. The characters themselves go through the
 * import, like any other source.
 */
export type EnkaProfile = {
  nickname: string | null;
  adventureRank: number | null;
  worldLevel: number | null;
  signature: string | null;
  achievements: number | null;
  /** Floor and chamber reached, as the game counts them. */
  abyss: { floor: number; chamber: number } | null;
  /** The character on the profile picture, for its face. */
  avatarId: number | null;
  /** Character ids in the showcase. */
  showcase: number[];
  fetchedAt: string;
  /**
   * Characters the showcase moved up since the bag was last read — a GOOD
   * import with materials. Their levels cost materials the bag still counts,
   * so while this is not empty the bag is stale. Cleared by the next import
   * that brings materials.
   */
  advanced?: { characterId: number; at: string }[];
};

export type EnkaAccount = { uid: string | null; profile: EnkaProfile | null };

const UID = /^[1-9]\d{8,9}$/;

export function isUid(value: unknown): value is string {
  return typeof value === 'string' && UID.test(value);
}

export async function readEnkaAccount(db: Db = getDb()): Promise<EnkaAccount> {
  const row = (await db
    .prepare('SELECT uid, enka_json FROM profile WHERE id = ?')
    .get(await getProfileId(db))) as { uid: string | null; enka_json: string | null } | undefined;

  let profile: EnkaProfile | null = null;
  if (row?.enka_json) {
    try {
      profile = JSON.parse(row.enka_json) as EnkaProfile;
    } catch {
      // A row nobody can read is as good as none; the next read replaces it.
    }
  }
  return { uid: isUid(row?.uid) ? row.uid : null, profile };
}

/** `null` forgets the UID, and what Enka said with it. */
export async function setUid(uid: string | null, db: Db = getDb()) {
  const profileId = await getProfileId(db);
  const current = await readEnkaAccount(db);
  // A different UID is a different account: its profile is not this one's.
  const keepProfile = uid !== null && uid === current.uid;
  await db.prepare('UPDATE profile SET uid = ?, enka_json = ? WHERE id = ?')
    .run(uid, keepProfile ? JSON.stringify(current.profile) : null, profileId);
}

export function profileFrom(payload: EnkaResponse, fetchedAt: string): EnkaProfile {
  const info = payload.playerInfo;
  const floor = info.towerFloorIndex;
  const chamber = info.towerLevelIndex;
  return {
    nickname: info.nickname ?? null,
    adventureRank: info.level ?? null,
    worldLevel: info.worldLevel ?? null,
    signature: info.signature ?? null,
    achievements: info.finishAchievementNum ?? null,
    abyss: floor ? { floor, chamber: chamber ?? 0 } : null,
    avatarId: info.profilePicture?.avatarId ?? null,
    showcase: (info.showAvatarInfoList ?? payload.avatarInfoList ?? []).map((entry) => entry.avatarId),
    fetchedAt,
  };
}

export async function recordShowcase(
  payload: EnkaResponse,
  fetchedAt: string,
  /** Who this read moved up, added to those still waiting for a new bag. */
  advancedNow: number[],
  db: Db = getDb(),
) {
  const { profile: previous } = await readEnkaAccount(db);
  const kept = previous?.advanced ?? [];
  const known = new Set(kept.map((entry) => entry.characterId));
  const advanced = [
    ...kept,
    ...advancedNow.filter((id) => !known.has(id)).map((characterId) => ({ characterId, at: fetchedAt })),
  ];
  await db.prepare('UPDATE profile SET enka_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...profileFrom(payload, fetchedAt), advanced }), await getProfileId(db));
}

/** A new bag has been read: nothing is ahead of it any more. */
export async function clearAdvanced(db: Db = getDb()) {
  const { profile } = await readEnkaAccount(db);
  if (!profile?.advanced?.length) return;
  await db.prepare('UPDATE profile SET enka_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...profile, advanced: [] }), await getProfileId(db));
}
