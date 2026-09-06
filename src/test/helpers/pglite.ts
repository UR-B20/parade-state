/**
 * An in-memory Postgres (PGlite) with the real migrations applied, for integration tests.
 * Supabase-specific objects that the migrations depend on (the auth schema, auth.uid(),
 * the client roles) are stubbed the way Supabase defines them.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import { MIGRATIONS_FOLDER } from '../../worker/db/migrations';
import * as schema from '../../worker/db/schema';

export type TestDatabase = PgliteDatabase<typeof schema>;

const SUPABASE_SHIM = `
  create schema if not exists auth;
  create table if not exists auth.users (id uuid primary key, email text);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
    if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  end $$;
  grant usage on schema public to anon, authenticated, service_role;
`;

export interface TestDb {
  client: PGlite;
  db: TestDatabase;
  /** Create a stub auth user and return its id. */
  createAuthUser(email: string): Promise<string>;
  /** Run `fn` as a signed-in client (role `authenticated`, auth.uid() = userId), then restore. */
  asUser<T>(userId: string, fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createTestDb(): Promise<TestDb> {
  const client = new PGlite();
  await client.exec(SUPABASE_SHIM);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });

  return {
    client,
    db,
    async createAuthUser(email) {
      const rows = await client.query<{ id: string }>('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [email]);
      return rows.rows[0]!.id;
    },
    async asUser(userId, fn) {
      await client.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
      try {
        return await fn();
      } finally {
        await client.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
      }
    },
    close: () => client.close(),
  };
}
