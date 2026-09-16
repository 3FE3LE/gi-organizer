import 'server-only';

import type { Transaction } from '@libsql/client';

import { internalsOf, type Db } from './client';

/**
 * Runs `body` in a write transaction and rolls back on any throw.
 *
 * A libSQL write transaction takes the write lock up front rather than on the
 * first write. Every mutation here is a read-then-write — read the piece, check
 * who holds it, move it — and a deferred transaction would let two of those
 * interleave their reads before either writes.
 *
 * Reentrant, because composed operations exist: undo replays a move through the
 * same function that performs one, and SQLite rejects a nested `BEGIN`. An
 * inner call becomes a savepoint, so it still rolls back its own work on a
 * throw without committing the outer one.
 *
 * The open transaction is not passed to `body`: it is held in a task-local, and
 * every statement made from `db` inside `body` finds it there. That is what
 * lets a query deep in the call tree join the transaction its caller opened
 * without the handle being threaded through each signature.
 */
export async function transaction<T>(db: Db, body: () => Promise<T>): Promise<T> {
  const { connect, current } = internalsOf(db);

  const open = current.getStore();
  if (open) return savepoint(open, body);

  const client = await connect();
  const tx = await client.transaction('write');
  try {
    const result = await current.run(tx, body);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

const depth = new WeakMap<Transaction, number>();

async function savepoint<T>(tx: Transaction, body: () => Promise<T>): Promise<T> {
  const level = (depth.get(tx) ?? 0) + 1;
  const name = `sp_${level}`;

  await tx.execute(`SAVEPOINT ${name}`);
  depth.set(tx, level);
  try {
    const result = await body();
    await tx.execute(`RELEASE ${name}`);
    return result;
  } catch (error) {
    await tx.execute(`ROLLBACK TO ${name}`);
    await tx.execute(`RELEASE ${name}`);
    throw error;
  } finally {
    depth.set(tx, level - 1);
  }
}
