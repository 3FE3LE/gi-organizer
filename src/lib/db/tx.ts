import type { DatabaseSync } from 'node:sqlite';

/**
 * Runs `body` in a write transaction and rolls back on any throw.
 *
 * `BEGIN IMMEDIATE` takes the write lock up front rather than on the first
 * write. Every mutation here is a read-then-write — read the piece, check who
 * holds it, move it — and a deferred transaction would let two of those
 * interleave their reads before either writes.
 *
 * Reentrant, because composed operations exist: undo replays a move through the
 * same function that performs one, and SQLite rejects a nested `BEGIN`. An
 * inner call becomes a savepoint, so it still rolls back its own work on a
 * throw without committing the outer one.
 */
export function transaction<T>(db: DatabaseSync, body: () => T): T {
  if (depth.get(db)) return savepoint(db, body);

  db.exec('BEGIN IMMEDIATE');
  depth.set(db, 1);
  try {
    const result = body();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  } finally {
    depth.set(db, 0);
  }
}

const depth = new WeakMap<DatabaseSync, number>();

function savepoint<T>(db: DatabaseSync, body: () => T): T {
  const level = (depth.get(db) ?? 0) + 1;
  const name = `sp_${level}`;

  db.exec(`SAVEPOINT ${name}`);
  depth.set(db, level);
  try {
    const result = body();
    db.exec(`RELEASE ${name}`);
    return result;
  } catch (error) {
    db.exec(`ROLLBACK TO ${name}`);
    db.exec(`RELEASE ${name}`);
    throw error;
  } finally {
    depth.set(db, level - 1);
  }
}
