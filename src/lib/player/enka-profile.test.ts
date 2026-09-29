import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';
import type { EnkaResponse } from '@/lib/enka/schema';

import { getProfileId } from './db';
import { clearAdvanced, readEnkaAccount, recordShowcase, setUid } from './enka-profile';

const payload: EnkaResponse = {
  uid: '700000001',
  playerInfo: {
    nickname: 'Viajera', level: 60, worldLevel: 8, finishAchievementNum: 900,
    towerFloorIndex: 12, towerLevelIndex: 3, profilePicture: { avatarId: 10000046 },
    showAvatarInfoList: [{ avatarId: 10000046 }, { avatarId: 10000022 }],
  },
};

test('the profile keeps who moved up until a new bag is read', async () => {
  const db = createMemoryDb();
  await getProfileId(db);
  await setUid('700000001', db);

  await recordShowcase(payload, '2026-09-20T00:00:00.000Z', [10000046], db);
  await recordShowcase(payload, '2026-09-21T00:00:00.000Z', [10000022, 10000046], db);

  const { uid, profile } = await readEnkaAccount(db);
  assert.equal(uid, '700000001');
  assert.equal(profile?.worldLevel, 8);
  assert.deepEqual(profile?.abyss, { floor: 12, chamber: 3 });
  assert.deepEqual(profile?.showcase, [10000046, 10000022]);
  assert.deepEqual(profile?.advanced?.map((entry) => entry.characterId), [10000046, 10000022], 'each once, in order');

  await clearAdvanced(db);
  assert.deepEqual((await readEnkaAccount(db)).profile?.advanced, []);
});

test('another UID is another account: its old profile goes', async () => {
  const db = createMemoryDb();
  await getProfileId(db);
  await setUid('700000001', db);
  await recordShowcase(payload, '2026-09-20T00:00:00.000Z', [], db);

  await setUid('800000001', db);
  const account = await readEnkaAccount(db);
  assert.equal(account.uid, '800000001');
  assert.equal(account.profile, null);
});
