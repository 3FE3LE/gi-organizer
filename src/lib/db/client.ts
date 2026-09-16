import 'server-only';

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

import { migrate } from './migrations';

/**
 * The player's own data: what they own, what they have assigned, and the teams
 * they are planning. The catalog stays where it is — generated, frozen and read
 * from disk — and this database references it only by the game's numeric ids.
 *
 * SQLite is here for one reason above the others: the single-assignment
 * invariant is expressed as a column and two partial unique indexes, so a piece
 * equipped on two characters is not a rule that can be forgotten, it is a state
 * the schema cannot hold.
 */

/** Never under `src/generated`, which `scripts/build-data.mts` deletes. */
const DEFAULT_PATH = path.join(process.cwd(), 'data', 'gi-organizer.db');

declare global {
  var __giOrganizerDb: DatabaseSync | undefined;
}

function open() {
  const file = process.env.GI_DB_PATH ?? DEFAULT_PATH;
  mkdirSync(path.dirname(file), { recursive: true });

  const db = new DatabaseSync(file);

  // All three are per-connection and none of them default the way this app
  // needs: foreign keys are off, the rollback journal serializes readers
  // against a writer, and a busy database throws immediately.
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA busy_timeout = 5000');
  db.exec('PRAGMA synchronous = NORMAL');

  migrate(db);
  return db;
}

/**
 * `next dev` re-evaluates modules on hot reload, so a module-scoped handle
 * leaks a file descriptor per edit. The catalog's per-process cache gets away
 * with module scope because nothing holds an OS resource; this does not.
 */
export function getDb(): DatabaseSync {
  globalThis.__giOrganizerDb ??= open();
  return globalThis.__giOrganizerDb;
}
