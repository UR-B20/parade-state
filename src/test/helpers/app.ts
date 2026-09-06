/**
 * The API mounted on a PGlite database with an in-memory auth provider.
 * Tokens are `test:<userId>`; accounts live in the stubbed auth.users table.
 */
import type { AuthProvider } from '../../worker/auth/provider';
import type { Db } from '../../worker/deps';
import type { Bindings } from '../../worker/env';
import { conflict } from '../../worker/errors';
import { createApp } from '../../worker/app';
import type { TestDb } from './pglite';

export interface FakeAuth extends AuthProvider {
  /** email -> { id, password } */
  users: Map<string, { id: string; password: string }>;
  tokenFor(userId: string): string;
}

export function fakeAuth(t: TestDb): FakeAuth {
  const users = new Map<string, { id: string; password: string }>();
  return {
    users,
    tokenFor: (userId) => `test:${userId}`,
    async verifyAccessToken(token) {
      return token.startsWith('test:') ? token.slice('test:'.length) : null;
    },
    async createUser({ email, password }) {
      if (users.has(email)) throw conflict('An account with that email already exists');
      const id = await t.createAuthUser(email);
      users.set(email, { id, password });
      return { id };
    },
    async deleteUser(id) {
      for (const [email, u] of users) if (u.id === id) users.delete(email);
      await t.client.query('delete from auth.users where id = $1', [id]);
    },
    async setPassword(id, password) {
      for (const u of users.values()) if (u.id === id) u.password = password;
    },
  };
}

export const TEST_ENV: Bindings = {
  DEMO_CONTROLS: 'false',
  ASSETS: undefined as unknown as Fetcher,
  SUPABASE_URL: 'https://test.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  BOOTSTRAP_ADMIN_PASSWORD: 'bootstrap-secret-1',
};

export interface TestApp {
  auth: FakeAuth;
  /** Perform a request against the API with optional bearer user and JSON body. */
  call(method: string, path: string, opts?: { as?: string; body?: unknown; env?: Partial<Bindings> }): Promise<Response>;
  json<T = unknown>(method: string, path: string, opts?: { as?: string; body?: unknown; env?: Partial<Bindings> }): Promise<{ status: number; body: T }>;
}

export function createTestApp(t: TestDb, envOverrides: Partial<Bindings> = {}): TestApp {
  const auth = fakeAuth(t);
  const app = createApp({ deps: () => ({ db: t.db as unknown as Db, auth, release: async () => {} }) });
  const call: TestApp['call'] = async (method, path, opts = {}) => {
    const headers: Record<string, string> = {};
    if (opts.as) headers.Authorization = `Bearer ${auth.tokenFor(opts.as)}`;
    if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
    return app.request(
      `/api${path}`,
      { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) },
      { ...TEST_ENV, ...envOverrides, ...opts.env },
    );
  };
  return {
    auth,
    call,
    async json(method, path, opts) {
      const res = await call(method, path, opts);
      return { status: res.status, body: (await res.json()) as never };
    },
  };
}
