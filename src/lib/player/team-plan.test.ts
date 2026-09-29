import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';

import { readRoster, setDismissed, upsertCharacter } from './characters';
import { getProfileId } from './db';
import { followTeamIntoPlan } from './team-plan';
import { createTeam, removeSlot, setSlot } from './teams';

const VENTI = 10000022;
const SUCROSE = 10000043;

async function rosterOf(...ids: number[]) {
  const db = createMemoryDb();
  const profileId = await getProfileId(db);
  for (const characterId of ids) {
    await upsertCharacter(db, profileId, {
      characterId,
      travelerElement: null,
      level: 80,
      ascension: 5,
      constellation: 0,
      talent: { auto: 1, skill: 1, burst: 1 },
      talentBonus: null,
    }, { source: 'good', observedAt: '2026-09-16T00:00:00.000Z' });
  }
  // Everybody out, as a player who has trimmed the plan down would have it.
  await setDismissed(db, profileId, null, true);
  return { db, profileId };
}

const dismissed = async (db: ReturnType<typeof createMemoryDb>, profileId: string, id: number) =>
  (await readRoster(db, profileId)).find((entry) => entry.characterId === id)?.dismissedAt !== null;

test('joining a team puts a character in the plan', async () => {
  const { db, profileId } = await rosterOf(VENTI);
  const team = await createTeam('Viento', 'abyss', db);

  await setSlot(team, VENTI, 0, db);
  await followTeamIntoPlan(VENTI, true, db);

  assert.equal(await dismissed(db, profileId, VENTI), false);
});

test('swapping a member swaps who the plan is for', async () => {
  const { db, profileId } = await rosterOf(VENTI, SUCROSE);
  const team = await createTeam('Viento', 'abyss', db);
  await setSlot(team, VENTI, 0, db);
  await followTeamIntoPlan(VENTI, true, db);

  await removeSlot(team, VENTI, db);
  await followTeamIntoPlan(VENTI, false, db);
  await setSlot(team, SUCROSE, 0, db);
  await followTeamIntoPlan(SUCROSE, true, db);

  assert.equal(await dismissed(db, profileId, VENTI), true, 'the one who left is out');
  assert.equal(await dismissed(db, profileId, SUCROSE), false, 'the one who joined is in');
});

test('leaving a team keeps someone another team still fields', async () => {
  const { db, profileId } = await rosterOf(VENTI);
  const first = await createTeam('Uno', 'abyss', db);
  await setSlot(first, VENTI, 0, db);
  await followTeamIntoPlan(VENTI, true, db);

  // Still on the team: a removal that did not happen leaves them in.
  await followTeamIntoPlan(VENTI, false, db);
  assert.equal(await dismissed(db, profileId, VENTI), false);
});
