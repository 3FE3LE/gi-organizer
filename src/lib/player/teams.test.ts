import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createMemoryDb } from '@/lib/db/client';

import {
  createTeam, isDraft, moveSlot, nameTeam, openDraft, readTeams, removeSlot, setRoles, setSlot,
} from './teams';

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

test('there is one draft, and naming it is what saves it', async () => {
  const database = await db();
  const draft = await openDraft(database);

  // Starting a new team again opens the one being put together.
  assert.equal(await openDraft(database), draft);
  await setSlot(draft, VENTI, 0, database);

  const [kept] = await readTeams(database);
  assert.ok(isDraft(kept));
  assert.equal(kept.slots.length, 1, 'kept as it was left');

  await nameTeam(draft, 'Congelar', database);
  const [saved] = await readTeams(database);
  assert.equal(saved.name, 'Congelar');
  assert.ok(!isDraft(saved));

  // With the draft saved, the next new team is a new draft.
  assert.notEqual(await openDraft(database), draft);
});

test('moving a member swaps with whoever holds the position, roles and all', async () => {
  const database = await db();
  const team = await createTeam('Congelar', 'other', database);
  await setSlot(team, VENTI, 0, database);
  await setSlot(team, SUCROSE, 1, database);
  await setRoles(team, VENTI, ['buffer'], database);

  assert.equal(await moveSlot(team, VENTI, 1, database), true);
  const [after] = await readTeams(database);
  const at = (id: number) => after.slots.find((slot) => slot.characterId === id);
  assert.equal(at(VENTI)?.position, 1);
  assert.equal(at(SUCROSE)?.position, 0);
  assert.deepEqual(at(VENTI)?.roles, ['buffer']);

  // Into an empty position it is a move, not a swap.
  assert.equal(await moveSlot(team, VENTI, 3, database), true);
  const [moved] = await readTeams(database);
  assert.deepEqual(moved.slots.map((slot) => [slot.characterId, slot.position]), [[SUCROSE, 0], [VENTI, 3]]);
});

test('a list of positions takes the first free one', async () => {
  const database = await db();
  const team = await createTeam('Congelar', 'other', database);
  await setSlot(team, VENTI, 1, database);
  await setSlot(team, SUCROSE, [1, 0, 2, 3], database);

  const [after] = await readTeams(database);
  assert.equal(after.slots.find((slot) => slot.characterId === SUCROSE)?.position, 0);
});
