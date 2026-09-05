import type { ExtractTablesWithRelations } from 'drizzle-orm';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Bindings } from '../env';
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
 * One short-lived connection per request. Hyperdrive (when bound) pools and keeps the TLS
 * session warm; otherwise we connect straight to Supabase's transaction-mode pooler, which
 * requires prepared statements to be off.
 */
export function connectDb(env: Bindings): DbHandle {
  const url = env.HYPERDRIVE?.connectionString ?? env.SUPABASE_DB_URL;
  if (!url) throw new Error('Database is not configured: set SUPABASE_DB_URL or bind HYPERDRIVE');
  const sql = postgres(url, { prepare: false, max: 1, fetch_types: false, idle_timeout: 10, connect_timeout: 10 });
  const db = drizzle(sql, { schema, casing: 'snake_case' });
  return { db, close: () => sql.end({ timeout: 2 }) };
}
