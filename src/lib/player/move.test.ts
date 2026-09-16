import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';

import { migrate } from '@/lib/db/migrations';

import { readHistory, redo, undo } from './history';
import { applyMove, UnknownItem, type MoveState } from './move';
import { performMove } from './mutations';

/* --------------------------------------------------- the pure reducer --- */

function state(): MoveState {
  return {
    artifacts: [
      { id: 'goblet-a', slot: 'goblet', equippedTo: 10000021 },
      { id: 'goblet-b', slot: 'goblet', equippedTo: null },
      { id: 'flower-a', slot: 'flower', equippedTo: 10000021 },
    ],
    weapons: [
      { id: 'bow-a', equippedTo: 10000021 },
      { id: 'bow-b', equippedTo: null },
    ],
  };
}

test('equipping into an occupied slot displaces the occupant', () => {
  const outcome = applyMove(state(), {
    kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021,
  });

  const byId = new Map(outcome.state.artifacts.map((piece) => [piece.id, piece.equippedTo]));
  assert.equal(byId.get('goblet-b'), 10000021);
  assert.equal(byId.get('goblet-a'), null, 'the previous goblet must leave');
  // A different slot on the same character is untouched.
  assert.equal(byId.get('flower-a'), 10000021);

  assert.deepEqual(outcome.displaced, [
    { kind: 'artifact', instanceId: 'goblet-a', fromCharacterId: 10000021, slot: 'goblet' },
  ]);
});

test('the inverse restores both sides of a displacement', () => {
  const before = state();
  const move = { kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021 } as const;
  const outcome = applyMove(before, move);

  let reverted = outcome.state;
  for (const step of outcome.inverse) reverted = applyMove(reverted, step).state;

  assert.deepEqual(
    [...reverted.artifacts].sort((a, b) => a.id.localeCompare(b.id)),
    [...before.artifacts].sort((a, b) => a.id.localeCompare(b.id)),
  );
});

test('equipping where it already is changes nothing and needs no undo', () => {
  const outcome = applyMove(state(), {
    kind: 'equip-artifact', instanceId: 'goblet-a', toCharacterId: 10000021,
  });

  assert.deepEqual(outcome.displaced, []);
  assert.deepEqual(outcome.inverse, []);
});

test('one weapon per character, so equipping displaces the held one', () => {
  const outcome = applyMove(state(), {
    kind: 'equip-weapon', instanceId: 'bow-b', toCharacterId: 10000021,
  });

  const byId = new Map(outcome.state.weapons.map((weapon) => [weapon.id, weapon.equippedTo]));
  assert.equal(byId.get('bow-b'), 10000021);
  assert.equal(byId.get('bow-a'), null);
});

test('moving an item the state does not contain is an error, not a no-op', () => {
  assert.throws(
    () => applyMove(state(), { kind: 'unequip-artifact', instanceId: 'ghost' }),
    UnknownItem,
  );
});

/* ------------------------------------------------ against the database --- */

function seeded() {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);

  const now = '2026-09-09T00:00:00.000Z';
  db.prepare('INSERT INTO profile (id, name, created_at) VALUES (?,?,?)')
    .run('local', 'test', now);

  const artifact = db.prepare(`INSERT INTO artifact_instance
    (id, profile_id, set_id, slot, rarity, level, main_prop, substats_json,
     unactivated_json, roll_history_json, locked, fingerprint, source,
     assigned_character_id, seen_at, created_at)
    VALUES (?,'local',15001,?,5,20,'FIGHT_PROP_HP','[]','[]',NULL,NULL,'fp','good',?,?,?)`);

  artifact.run('goblet-a', 'goblet', 10000021, now, now);
  artifact.run('goblet-b', 'goblet', null, now, now);
  artifact.run('flower-a', 'flower', 10000021, now, now);

  const weapon = db.prepare(`INSERT INTO weapon_instance
    (id, profile_id, weapon_id, level, ascension, refinement, locked, fingerprint,
     source, assigned_character_id, seen_at, created_at)
    VALUES (?,'local',?,90,6,1,NULL,'wfp','good',?,?,?)`);

  weapon.run('bow-a', 15501, 10000021, now, now);
  weapon.run('bow-b', 15502, null, now, now);

  return db;
}

const holderOf = (db: DatabaseSync, table: string, id: string) =>
  (db.prepare(`SELECT assigned_character_id FROM ${table} WHERE id = ?`).get(id) as
    { assigned_character_id: number | null }).assigned_character_id;

test('a move is one transaction: the displaced piece is freed, not duplicated', () => {
  const db = seeded();

  const result = performMove(
    { kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021 }, {}, db,
  );

  assert.equal(result.ok, true);
  assert.equal(holderOf(db, 'artifact_instance', 'goblet-b'), 10000021);
  assert.equal(holderOf(db, 'artifact_instance', 'goblet-a'), null);

  // The schema is the real guarantee, so assert against it rather than the code.
  const occupants = db
    .prepare(`SELECT COUNT(*) c FROM artifact_instance
              WHERE assigned_character_id = 10000021 AND slot = 'goblet'`)
    .get() as { c: number };
  assert.equal(occupants.c, 1);
});

test('the schema refuses a double assignment even if the mutation layer is bypassed', () => {
  const db = seeded();

  assert.throws(
    () => db.prepare(
      'UPDATE artifact_instance SET assigned_character_id = 10000021 WHERE id = ?',
    ).run('goblet-b'),
    /UNIQUE constraint failed/,
  );
});

test('a stale expected holder is a conflict, and nothing is written', () => {
  const db = seeded();

  const result = performMove(
    { kind: 'equip-artifact', instanceId: 'goblet-a', toCharacterId: 10000022 },
    // The UI thought nobody held it; the database says otherwise.
    { expectedHolderId: null },
    db,
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok === false ? result.reason : '', 'conflict');
  assert.equal(
    result.ok === false && result.reason === 'conflict' ? result.actualHolderId : undefined,
    10000021,
  );
  assert.equal(holderOf(db, 'artifact_instance', 'goblet-a'), 10000021);
});

test('a weapon the character cannot hold is refused before any write', () => {
  const db = seeded();

  const result = performMove(
    { kind: 'equip-weapon', instanceId: 'bow-b', toCharacterId: 10000002 },
    {
      weaponTypes: {
        ofWeapon: () => 'WEAPON_BOW',
        ofCharacter: () => 'WEAPON_SWORD_ONE_HAND',
      },
    },
    db,
  );

  assert.equal(result.ok, false);
  assert.equal(result.ok === false ? result.reason : '', 'wrong-weapon-type');
  assert.equal(holderOf(db, 'weapon_instance', 'bow-b'), null);
});

/* --------------------------------------------------------- undo, redo --- */

test('undo restores the displaced piece too', () => {
  const db = seeded();

  performMove({ kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021 }, {}, db);
  assert.equal(undo(db).ok, true);

  assert.equal(holderOf(db, 'artifact_instance', 'goblet-a'), 10000021);
  assert.equal(holderOf(db, 'artifact_instance', 'goblet-b'), null);
});

test('undo walks back several moves and redo replays them', () => {
  const db = seeded();

  performMove({ kind: 'unequip-artifact', instanceId: 'flower-a' }, {}, db);
  performMove({ kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021 }, {}, db);

  assert.equal(undo(db).ok, true);
  assert.equal(undo(db).ok, true);
  assert.equal(undo(db).ok, false, 'the stack is empty');

  assert.equal(holderOf(db, 'artifact_instance', 'flower-a'), 10000021);
  assert.equal(holderOf(db, 'artifact_instance', 'goblet-a'), 10000021);

  assert.equal(redo(db).ok, true);
  assert.equal(redo(db).ok, true);
  assert.equal(holderOf(db, 'artifact_instance', 'flower-a'), null);
  assert.equal(holderOf(db, 'artifact_instance', 'goblet-b'), 10000021);
});

test('a new move discards the redo stack', () => {
  const db = seeded();

  performMove({ kind: 'unequip-artifact', instanceId: 'flower-a' }, {}, db);
  undo(db);
  performMove({ kind: 'unequip-weapon', instanceId: 'bow-a' }, {}, db);

  assert.equal(redo(db).ok, false);
  assert.equal(readHistory(db).filter((entry) => entry.undone).length, 0);
});

test('history records ids, never names', () => {
  const db = seeded();
  performMove(
    { kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021 },
    { label: 'probe' }, db,
  );

  const [entry] = readHistory(db);
  assert.equal(entry.op, 'equip-artifact');
  assert.equal(entry.summary.label, 'probe');
  assert.deepEqual(entry.summary.move, {
    kind: 'equip-artifact', instanceId: 'goblet-b', toCharacterId: 10000021,
  });
});
