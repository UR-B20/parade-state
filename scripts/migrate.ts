/**
 * Apply pending migrations from ./migrations to the Supabase database.
 * Uses the session-mode pooler (SUPABASE_DB_URL_MIGRATIONS, port 5432).
 *
 *   pnpm db:migrate
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { MIGRATIONS_FOLDER } from '../src/worker/db/migrations';
import { loadDevVars, migrationsDatabaseUrl } from './lib/env';

loadDevVars();
const url = migrationsDatabaseUrl();
const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });

try {
  const started = Date.now();
  await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
  const rows = await sql<{ count: string }[]>`
    select count(*)::text as count from drizzle.__drizzle_migrations`;
  console.log(`Migrations up to date (${rows[0]?.count ?? '?'} applied) in ${Date.now() - started} ms`);
} finally {
  await sql.end();
}
