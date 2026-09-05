import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from '../../worker/db/schema';
import type { Db } from '../../worker/db/client';

export type TestDb = PgliteDatabase<typeof schema>;

/** Fresh in-memory Postgres with all migrations applied. */
export async function createTestDb(): Promise<{ db: Db; raw: TestDb; close: () => Promise<void> }> {
  const client = new PGlite();
  const raw = drizzle(client, { schema });
  await migrate(raw, { migrationsFolder: fileURLToPath(new URL('../../../migrations', import.meta.url)) });
  return { db: raw as unknown as Db, raw, close: () => client.close() };
}
