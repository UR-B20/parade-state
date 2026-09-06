import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Bindings } from '../env';
import { ConfigError } from '../errors';
import * as schema from './schema';

export { schema };

/** Any Drizzle Postgres database (postgres.js in the Worker, PGlite in tests) or a transaction on one. */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema, ExtractTablesWithRelations<typeof schema>>;

export interface DbHandle {
  db: Db;
  /** Release the connection at the end of the request. */
  close: () => Promise<void>;
}

type Thenable<T> = { then: Promise<T>['then'] };

/**
 * Runs the client's queries strictly one at a time, in call order, including inside
 * transactions. Supabase's transaction-mode pooler does not answer pipelined queries, and
 * Workers allow only six open sockets per request, so a `Promise.all` of queries in the
 * services must neither share a connection nor fan out into many. Drizzle only calls
 * `client.unsafe(query, params)` (optionally `.values()`) and `client.begin(fn)`.
 */
export function serialQueries<C extends object>(client: C): C {
  let chain: Promise<unknown> = Promise.resolve();
  const run = <T>(work: () => Promise<T> | Thenable<T>): Promise<T> => {
    const next = chain.then(() => work());
    chain = next.catch(() => undefined);
    return next;
  };
  return new Proxy(client, {
    get(target, prop, receiver) {
      if (prop === 'unsafe') {
        return (...args: unknown[]) => {
          const modes: string[] = [];
          const pending = {
            values() { modes.push('values'); return pending; },
            raw() { modes.push('raw'); return pending; },
            then<R1, R2>(onFulfilled?: ((v: unknown) => R1 | PromiseLike<R1>) | null, onRejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null) {
              return run(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                let q = (target as any).unsafe(...args);
                for (const m of modes) q = q[m]();
                return q as Thenable<unknown>;
              }).then(onFulfilled, onRejected);
            },
            catch<R>(onRejected?: ((e: unknown) => R | PromiseLike<R>) | null) { return pending.then(undefined, onRejected); },
            finally(onFinally?: (() => void) | null) { return pending.then((v) => { onFinally?.(); return v; }, (e) => { onFinally?.(); throw e; }); },
          };
          return pending;
        };
      }
      if (prop === 'begin') {
        return (...args: unknown[]) => {
          const fn = args[args.length - 1] as (tx: object) => Promise<unknown>;
          const head = args.slice(0, -1);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return run(() => (target as any).begin(...head, (tx: object) => fn(serialQueries(tx))));
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

/**
 * One short-lived connection per request, queries strictly sequential (see `serialQueries`).
 * Hyperdrive (when bound) keeps the TLS session warm; otherwise we connect straight to
 * Supabase's transaction-mode pooler, which requires prepared statements to be off.
 */
export function connectDb(env: Bindings): DbHandle {
  const url = env.HYPERDRIVE?.connectionString ?? env.SUPABASE_DB_URL;
  if (!url) throw new ConfigError('set the SUPABASE_DB_URL secret or bind HYPERDRIVE');
  const sql = postgres(url, { prepare: false, max: 1, fetch_types: false, idle_timeout: 10, connect_timeout: 10 });
  const db = drizzle(serialQueries(sql), { schema, casing: 'snake_case' });
  return { db, close: () => sql.end({ timeout: 2 }) };
}
