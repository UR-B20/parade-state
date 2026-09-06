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

/**
 * Short-lived connections per request. Hyperdrive (when bound) pools and keeps the TLS
 * session warm; otherwise we connect straight to Supabase's transaction-mode pooler, which
 * requires prepared statements to be off.
 *
 * `max` must stay above the number of queries a request issues concurrently (Promise.all in
 * the services): with a single connection postgres.js pipelines the queries, and Supabase's
 * pooler never answers a pipelined batch, so the request hangs until the Worker times out.
 */
export function connectDb(env: Bindings): DbHandle {
  const url = env.HYPERDRIVE?.connectionString ?? env.SUPABASE_DB_URL;
  if (!url) throw new ConfigError('set the SUPABASE_DB_URL secret or bind HYPERDRIVE');
  const sql = postgres(url, { prepare: false, max: 6, fetch_types: false, idle_timeout: 10, connect_timeout: 10 });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db, close: () => sql.end({ timeout: 2 }) };
}
