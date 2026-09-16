import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate } from '@/lib/db/migrations';

import { createTeam, readTeams, removeSlot, setSlot } from './teams';

const VENTI = 10000022;
const SUCROSE = 10000043;

function db() {
  const database = new DatabaseSync(':memory:');
  database.exec('PRAGMA foreign_keys = ON');
  migrate(database);
  return database;
}

test('a character belongs to one team at a time', () => {
  const database = db();
  const first = createTeam('Primero', 'abyss', database);
  const second = createTeam('Segundo', 'abyss', database);

  assert.deepEqual(setSlot(first, VENTI, 0, database), { ok: true });

  const refused = setSlot(second, VENTI, 0, database);
  assert.equal(refused.ok, false);
  assert.equal(refused.ok === false && refused.reason, 'in-another-team');
  // The team is named so the refusal says where to go and free them.
  assert.equal(refused.ok === false && 'team' in refused && refused.team, 'Primero');

  assert.equal(readTeams(database).find((team) => team.id === second)?.slots.length, 0);
});

test('freeing a character makes them available again', () => {
  const database = db();
  const first = createTeam('Primero', 'abyss', database);
  const second = createTeam('Segundo', 'abyss', database);

  setSlot(first, VENTI, 0, database);
  removeSlot(first, VENTI, database);

  assert.deepEqual(setSlot(second, VENTI, 0, database), { ok: true });
});

test('the same team still refuses a duplicate, with its own reason', () => {
  const database = db();
  const team = createTeam('Primero', 'abyss', database);

  setSlot(team, VENTI, 0, database);
  const again = setSlot(team, VENTI, 1, database);

  assert.equal(again.ok === false && again.reason, 'already-in-team');
});

test('other characters are unaffected by someone else being held', () => {
  const database = db();
  const first = createTeam('Primero', 'abyss', database);
  const second = createTeam('Segundo', 'abyss', database);

  setSlot(first, VENTI, 0, database);

  assert.deepEqual(setSlot(second, SUCROSE, 0, database), { ok: true });
});
