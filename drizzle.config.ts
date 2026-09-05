import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/worker/db/schema.ts',
  out: './migrations',
  dbCredentials: {
    url: process.env.SUPABASE_DB_URL_MIGRATIONS ?? process.env.SUPABASE_DB_URL ?? '',
  },
  strict: true,
  verbose: true,
});
