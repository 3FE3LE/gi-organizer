import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  createClient,
  type Client,
  type InStatement,
  type InValue,
  type ResultSet,
  type Transaction,
} from '@libsql/client';

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
 *
 * The dialect is still SQLite; the file is not. libSQL speaks the same SQL over
 * the network, which is what a serverless host requires: there is no writable
 * disk under a function, and a per-instance file would neither survive a cold
 * start nor be shared between two instances.
 */

/** Local development, when no libSQL server is configured. */
const DEFAULT_URL = 'file:data/gi-organizer.db';

export type Row = Record<string, unknown>;

export type RunResult = {
  /** `rowsAffected`, under the name the callers already use. */
  changes: number;
  lastInsertRowid: bigint | undefined;
};

/**
 * A statement, bound late.
 *
 * `prepare` stays synchronous and holds nothing but the SQL, so the callers
 * that hoist a statement out of a loop keep working unchanged. Which executor
 * runs it — the connection, or the transaction this call is inside — is decided
 * when `get`/`all`/`run` is awaited, not when the statement is made.
 */
export type Statement = {
  get<T = Row>(...args: InValue[]): Promise<T | undefined>;
  all<T = Row>(...args: InValue[]): Promise<T[]>;
  run(...args: InValue[]): Promise<RunResult>;
  /** The same statement and arguments, for `batch`, without running it. */
  bind(...args: InValue[]): InStatement;
};

export type Db = {
  prepare(sql: string): Statement;
  /** One or more statements, no parameters. */
  exec(sql: string): Promise<void>;
  /**
   * Sends many statements in one round trip, in the order given.
   *
   * This is what makes a bulk write affordable. Against a file every statement
   * cost microseconds; against a server each one is a round trip, so a loop
   * that writes a row at a time spends the whole import waiting on the network.
   *
   * Anything longer than `BATCH_LIMIT` is split across several round trips, so
   * a caller that needs all of it to land or none of it must already be inside
   * a `transaction`.
   */
  batch(statements: InStatement[]): Promise<RunResult[]>;
};

/**
 * Statements per round trip.
 *
 * A whole inventory in one request would be megabytes of SQL and arguments,
 * which servers and proxies refuse; the point is to stop paying latency per
 * row, and a few hundred rows per trip already does that.
 */
const BATCH_LIMIT = 256;

type Internals = {
  connect(): Promise<Client>;
  /**
   * The transaction this call is running inside, if any.
   *
   * A remote database has no connection-scoped write lock to lean on: `BEGIN`
   * is a property of a transaction object, not of the handle, so a statement
   * has to be routed to that object explicitly. Threading it through every
   * signature would touch every query in the app; a task-local holds it
   * instead, and `transaction` is its only writer.
   *
   * One per database, so a test holding two of them cannot route a statement
   * into the other one's transaction.
   */
  current: AsyncLocalStorage<Transaction>;
};

const internals = new WeakMap<Db, Internals>();

/** For `transaction`, which is the only thing that needs the raw connection. */
export function internalsOf(db: Db): Internals {
  const found = internals.get(db);
  if (!found) throw new Error('not a database handle from createDb');
  return found;
}

/**
 * Wraps a libSQL connection in the statement surface the queries are written
 * against.
 *
 * `open` is called once, on the first statement, and its promise — not its
 * client — is what gets held: that makes the first caller and everyone racing
 * it await one connection and one migration rather than each starting their own.
 */
export function createDb(open: () => Promise<Client>): Db {
  let opening: Promise<Client> | undefined;
  const connect = () => (opening ??= open());
  const current = new AsyncLocalStorage<Transaction>();

  const executor = async (): Promise<Client | Transaction> =>
    current.getStore() ?? (await connect());

  const db: Db = {
    prepare(sql: string): Statement {
      return {
        async get<T>(...args: InValue[]) {
          const result = await (await executor()).execute({ sql, args });
          return result.rows[0] as T | undefined;
        },
        async all<T>(...args: InValue[]) {
          const result = await (await executor()).execute({ sql, args });
          return result.rows as unknown as T[];
        },
        async run(...args: InValue[]) {
          const result = await (await executor()).execute({ sql, args });
          return toRunResult(result);
        },
        bind(...args: InValue[]) {
          return { sql, args };
        },
      };
    },

    async batch(statements: InStatement[]) {
      if (statements.length === 0) return [];

      const target = await executor();
      const results: RunResult[] = [];

      for (let at = 0; at < statements.length; at += BATCH_LIMIT) {
        const chunk = statements.slice(at, at + BATCH_LIMIT);
        // A transaction is already open in the first case, and opening a second
        // one around the chunk is what `batch` would otherwise do.
        const done = 'commit' in target
          ? await target.batch(chunk)
          : await target.batch(chunk, 'write');
        for (const result of done) results.push(toRunResult(result));
      }

      return results;
    },

    async exec(sql: string) {
      await (await executor()).executeMultiple(sql);
    },
  };

  internals.set(db, { connect, current });
  return db;
}

function toRunResult(result: ResultSet): RunResult {
  return { changes: result.rowsAffected, lastInsertRowid: result.lastInsertRowid };
}

/**
 * A fresh, empty, migrated database that outlives nothing.
 *
 * Exported for the tests, which each want their own: the invariants under test
 * are schema-level, so they have to be checked against a real one rather than a
 * stand-in.
 */
export function createMemoryDb(): Db {
  return createDb(async () => {
    const client = createClient({ url: ':memory:' });
    await migrate(client);
    return client;
  });
}

declare global {
  var __giOrganizerDb: Db | undefined;
}

/**
 * `next dev` re-evaluates modules on hot reload, so a module-scoped handle
 * leaks a connection per edit. The catalog's per-process cache gets away with
 * module scope because nothing holds an OS resource; this does not.
 *
 * Synchronous on purpose: it hands back a facade, and the connection and its
 * migration are awaited inside the first statement instead. That keeps the
 * `db = getDb()` default parameter these modules use out of async position.
 */
export function getDb(): Db {
  globalThis.__giOrganizerDb ??= createDb(async () => {
    // `GI_DB_PATH` wins over everything, and carries no token with it. The
    // browser suite sets it to a throwaway file, and a run that fell through to
    // a configured server would seed and mutate the player's real database.
    const file = process.env.GI_DB_PATH;
    const url = file
      ? `file:${file}`
      : process.env.TURSO_DATABASE_URL ?? process.env.GI_DB_URL ?? DEFAULT_URL;
    const authToken = file ? undefined : process.env.TURSO_AUTH_TOKEN;

    // A local file is the development default, and libSQL will not create the
    // directory it lives in. Never under `src/generated`, which
    // `scripts/build-data.mts` deletes.
    if (url.startsWith('file:') && !url.includes(':memory:')) {
      await mkdir(path.dirname(url.slice('file:'.length)), { recursive: true });
    }

    const client = createClient(authToken ? { url, authToken } : { url });

    // What opening costs a new instance, once, in the function log: the
    // first round trip carries the TLS handshake and the protocol probe, the
    // second is the network alone, and the migration is what is left.
    const opened = performance.now();
    await client.execute('SELECT 1');
    const first = performance.now();
    await client.execute('SELECT 1');
    const second = performance.now();

    // Foreign keys are on by default in libSQL, unlike `node:sqlite`, and the
    // journal and busy-timeout pragmas the file build set are properties of a
    // local file that the server owns instead.
    await migrate(client);
    console.log(`[timing] ${JSON.stringify({
      route: 'db-open',
      firstTripMs: Math.round(first - opened),
      secondTripMs: Math.round(second - first),
      migrateMs: Math.round(performance.now() - second),
      region: process.env.VERCEL_REGION ?? null,
    })}`);
    return client;
  });
  return globalThis.__giOrganizerDb;
}
