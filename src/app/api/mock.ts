/**
 * Demo backend: the real API running in the browser on PGlite, seeded with the fictional
 * battalion. Enabled by VITE_MOCK_API=1 (pnpm dev:mock, the e2e suite). Nothing here ships in
 * production builds because the import is behind a dead branch there.
 *
 * Accounts live in memory; the demo password signs in any demo user. Data persists in
 * IndexedDB between reloads until "Reset demo data" is used.
 */
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { buildDemoDataset, DEMO_PASSWORD } from '@shared/demo/dataset';
import { loadDemoDataset } from '../../../seed/load';
import { createApp } from '../../worker/app';
import type { AuthProvider } from '../../worker/auth/provider';
import type { Db } from '../../worker/deps';
import type { Bindings } from '../../worker/env';
import { conflict } from '../../worker/errors';
import * as schema from '../../worker/db/schema';
import type { AuthSession, DemoAccount } from '../auth/session';
import type { Fetcher } from './client';

const migrationFiles = import.meta.glob('../../../migrations/*.sql', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

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

const DATA_DIR = 'idb://parade-state-demo';
const SESSION_KEY = 'parade-state:demo-user';

interface Account {
  id: string;
  email: string;
  password: string;
  displayName: string;
  label: string;
}

export interface DemoControls {
  /** Make every API call fail as if the phone had no signal. */
  setOffline(offline: boolean): void;
  isOffline(): boolean;
  subscribe(listener: () => void): () => void;
  /** Drop the demo database and reload the page. */
  reset(): Promise<void>;
}

export interface MockBackend {
  fetcher: Fetcher;
  session: AuthSession;
  demo: DemoControls;
}

async function applyMigrations(client: PGlite): Promise<void> {
  const files = Object.entries(migrationFiles).sort(([a], [b]) => a.localeCompare(b));
  for (const [, sql] of files) {
    for (const statement of sql.split('--> statement-breakpoint')) {
      if (statement.trim()) await client.exec(statement);
    }
  }
}

export async function createMockBackend(): Promise<MockBackend> {
  const client = new PGlite(DATA_DIR);
  await client.exec(SUPABASE_SHIM);
  const db = drizzle(client, { schema });
  const accounts = new Map<string, Account>();

  const seeded = await client.query<{ present: string | null }>("select to_regclass('public.units')::text as present");
  const dataset = await buildDemoDataset();
  if (!seeded.rows[0]?.present) {
    await applyMigrations(client);
    const userIds = new Map<string, string>();
    for (const u of dataset.users) {
      const row = await client.query<{ id: string }>('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [u.email]);
      userIds.set(u.id, row.rows[0]!.id);
    }
    await loadDemoDataset(db as unknown as Db, dataset, { userIds });
  }
  // Accounts come from the stored auth users so ids stay stable across reloads.
  const stored = await client.query<{ id: string; email: string }>('select id, email from auth.users');
  for (const row of stored.rows) {
    const demoUser = dataset.users.find((u) => u.email === row.email);
    accounts.set(row.email, {
      id: row.id,
      email: row.email,
      password: DEMO_PASSWORD,
      displayName: demoUser?.displayName ?? row.email,
      label: demoUser ? (demoUser.role === 'ADMIN' ? 'S1 admin' : `${demoUser.unitId} commander`) : row.email,
    });
  }

  const provider: AuthProvider = {
    async verifyAccessToken(token) {
      return token.startsWith('demo:') ? token.slice(5) : null;
    },
    async createUser({ email, password, displayName }) {
      if (accounts.has(email)) throw conflict('An account with that email already exists');
      const row = await client.query<{ id: string }>('insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id', [email]);
      const id = row.rows[0]!.id;
      accounts.set(email, { id, email, password, displayName, label: email });
      return { id };
    },
    async deleteUser(id) {
      for (const [email, a] of accounts) if (a.id === id) accounts.delete(email);
      await client.query('delete from auth.users where id = $1', [id]);
    },
    async setPassword(id, password) {
      for (const a of accounts.values()) if (a.id === id) a.password = password;
    },
  };

  const app = createApp({ deps: () => ({ db: db as unknown as Db, auth: provider, release: async () => {} }) });
  const env: Bindings = {
    DEMO_CONTROLS: 'true',
    SUPABASE_URL: 'https://demo.invalid',
    SUPABASE_ANON_KEY: 'demo',
  };

  let offline = false;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((l) => l());

  const fetcher: Fetcher = async (input, init) => {
    if (offline) throw new TypeError('Failed to fetch');
    // Small delay so the UI's pending states are visible, as on a real network.
    await new Promise((r) => setTimeout(r, 40));
    return app.request(input, init, env);
  };

  const sessionListeners = new Set<() => void>();
  const currentId = () => localStorage.getItem(SESSION_KEY);
  const session: AuthSession = {
    async getAccessToken() {
      const id = currentId();
      return id ? `demo:${id}` : null;
    },
    async isSignedIn() {
      return currentId() !== null;
    },
    async signIn(email, password) {
      const account = accounts.get(email.trim().toLowerCase());
      if (!account || account.password !== password) throw new Error('Email or password is wrong');
      localStorage.setItem(SESSION_KEY, account.id);
      sessionListeners.forEach((l) => l());
    },
    async signOut() {
      localStorage.removeItem(SESSION_KEY);
      sessionListeners.forEach((l) => l());
    },
    subscribe(listener) {
      sessionListeners.add(listener);
      return () => sessionListeners.delete(listener);
    },
    demoAccounts: dataset.users.map<DemoAccount>((u) => ({
      email: u.email,
      label: u.role === 'ADMIN' ? `${u.displayName} (S1)` : u.displayName,
      password: DEMO_PASSWORD,
    })),
  };

  const demo: DemoControls = {
    setOffline(value) {
      if (offline === value) return;
      offline = value;
      notify();
      if (!value) window.dispatchEvent(new Event('parade-state:online'));
    },
    isOffline: () => offline,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async reset() {
      localStorage.removeItem(SESSION_KEY);
      await client.close();
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase('/pglite/parade-state-demo');
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
        req.onblocked = () => resolve();
      });
      location.reload();
    },
  };

  return { fetcher, session, demo };
}
