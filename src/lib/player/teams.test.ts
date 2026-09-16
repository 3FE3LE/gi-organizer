import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';

import { createTeam, readTeams, removeSlot, setSlot } from './teams';

const VENTI = 10000022;
const SUCROSE = 10000043;

async function db() {
  const database = createMemoryDb();
  return database;
}

test('a character belongs to one team at a time', async () => {
  const database = await db();
  const first = await createTeam('Primero', 'abyss', database);
  const second = await createTeam('Segundo', 'abyss', database);

  assert.deepEqual(await setSlot(first, VENTI, 0, database), { ok: true });

  const refused = await setSlot(second, VENTI, 0, database);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, 'in-another-team');
  // The team is named so the refusal says where to go and free them.
  assert.equal(refused.ok === false && 'team' in refused && refused.team, 'Primero');

  assert.equal((await readTeams(database)).find((team) => team.id === second)?.slots.length, 0);
});

test('freeing a character makes them available again', async () => {
  const database = await db();
  const first = await createTeam('Primero', 'abyss', database);
  const second = await createTeam('Segundo', 'abyss', database);

  await setSlot(first, VENTI, 0, database);
  await removeSlot(first, VENTI, database);

  assert.deepEqual(await setSlot(second, VENTI, 0, database), { ok: true });
});

test('the same team still refuses a duplicate, with its own reason', async () => {
  const database = await db();
  const team = await createTeam('Primero', 'abyss', database);

  await setSlot(team, VENTI, 0, database);
  const again = await setSlot(team, VENTI, 1, database);

  assert.equal(again.ok === false && again.reason, 'already-in-team');
});

test('other characters are unaffected by someone else being held', async () => {
  const database = await db();
  const first = await createTeam('Primero', 'abyss', database);
  const second = await createTeam('Segundo', 'abyss', database);

  await setSlot(first, VENTI, 0, database);

  assert.deepEqual(await setSlot(second, SUCROSE, 0, database), { ok: true });
});
