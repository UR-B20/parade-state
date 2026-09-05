/**
 * Applies pending migrations to the Supabase database. Uses the session-mode pooler URL
 * (SUPABASE_DB_URL_MIGRATIONS), falling back to SUPABASE_DB_URL.
 * Run: pnpm db:migrate
 */
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.SUPABASE_DB_URL_MIGRATIONS ?? process.env.SUPABASE_DB_URL;
if (!url) {
  console.error('Set SUPABASE_DB_URL_MIGRATIONS (session-mode pooler) before running migrations.');
  process.exit(1);
}
const sql = postgres(url, { max: 1, prepare: false });
try {
  await migrate(drizzle(sql), { migrationsFolder: 'migrations' });
  console.log('Migrations applied.');
} finally {
  await sql.end({ timeout: 5 });
}
