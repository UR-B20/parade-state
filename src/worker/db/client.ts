import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres, { type Sql } from 'postgres';
import type { Bindings } from '../env';
import * as schema from './schema';

export type Database = PostgresJsDatabase<typeof schema>;

type DbBindings = Pick<Bindings, 'HYPERDRIVE' | 'SUPABASE_DB_URL'>;

function connectionString(env: DbBindings): string | undefined {
  return env.HYPERDRIVE?.connectionString ?? env.SUPABASE_DB_URL;
}

export function isDatabaseConfigured(env: DbBindings): boolean {
  return Boolean(connectionString(env));
}

/**
 * Open a connection for one Worker invocation. Call `sql.end()` (via `ctx.waitUntil`) when the
 * request finishes; Workers do not keep connections between invocations.
 */
export function connect(env: DbBindings): { sql: Sql; db: Database } {
  const url = connectionString(env);
  if (!url) throw new Error('Database is not configured: bind HYPERDRIVE or set SUPABASE_DB_URL');
  const sql = postgres(url, {
    // Supabase's transaction-mode pooler (port 6543) and Hyperdrive reject prepared statements.
    prepare: false,
    // Skip the type-fetch round trip on connect; only built-in Postgres types are used.
    fetch_types: false,
    // A single invocation needs very few connections; the pooler multiplexes across isolates.
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return { sql, db: drizzle(sql, { schema }) };
}
