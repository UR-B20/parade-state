import { createApp } from '../../worker/index';
import type { AppDeps } from '../../worker/deps';
import type { Bindings } from '../../worker/env';
import type { AuthAdmin } from '../../worker/auth/supabaseAdmin';
import { profiles } from '../../worker/db/schema';
import { createTestDb } from './setup';
import { unauthorized } from '../../worker/errors';
import type { Db } from '../../worker/db/client';

export interface FakeAuthAdmin extends AuthAdmin {
  created: { id: string; email: string; password: string }[];
  passwords: Record<string, string>;
  banned: Record<string, boolean>;
  deleted: string[];
}

export function fakeAuthAdmin(): FakeAuthAdmin {
  let seq = 1;
  const admin: FakeAuthAdmin = {
    created: [], passwords: {}, banned: {}, deleted: [],
    async createUser({ email, password }) {
      const id = `00000000-0000-4000-8000-${String(seq++).padStart(12, '0')}`;
      admin.created.push({ id, email, password });
      admin.passwords[id] = password;
      return { id };
    },
    async updatePassword(id, password) { admin.passwords[id] = password; },
    async setBanned(id, banned) { admin.banned[id] = banned; },
    async deleteUser(id) { admin.deleted.push(id); },
  };
  return admin;
}

export interface Harness {
  db: Db;
  auth: FakeAuthAdmin;
  env: Bindings;
  clock: { now: Date };
  /** Bearer token accepted by the fake verifier for this user id. */
  tokenFor: (userId: string) => string;
  request: (path: string, init?: RequestInit & { as?: string; json?: unknown }) => Promise<Response>;
  json: <T = unknown>(path: string, init?: RequestInit & { as?: string; json?: unknown }) => Promise<{ status: number; body: T }>;
  seedUser: (input: { id?: string; email: string; role: 'ADMIN' | 'COMMANDER'; unitId?: string | null; displayName?: string; isActive?: boolean }) => Promise<string>;
  close: () => Promise<void>;
}

export async function createHarness(envOverrides: Partial<Bindings> = {}): Promise<Harness> {
  const t = await createTestDb();
  const auth = fakeAuthAdmin();
  const clock = { now: new Date('2026-09-06T01:24:00.000Z') }; // 09:24 SGT
  const env = {
    DEMO_CONTROLS: 'false',
    ASSETS: {} as Fetcher,
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
    BOOTSTRAP_ADMIN_PASSWORD: 'setup-key-123',
    ...envOverrides,
  } as unknown as Bindings;
  const deps: AppDeps = {
    getDb: () => ({ db: t.db, close: async () => undefined }),
    verifyToken: async (token) => {
      if (!token.startsWith('test:')) throw unauthorized('Your session has expired. Sign in again.');
      return { sub: token.slice(5), email: null };
    },
    authAdmin: () => auth,
    now: () => clock.now,
  };
  const app = createApp(deps);
  let userSeq = 100;

  const request: Harness['request'] = (path, init = {}) => {
    const headers = new Headers(init.headers);
    if (init.as) headers.set('authorization', `Bearer test:${init.as}`);
    let bodyInit = init.body;
    if (init.json !== undefined) {
      headers.set('content-type', 'application/json');
      bodyInit = JSON.stringify(init.json);
    }
    return Promise.resolve(app.request(`http://localhost/api${path}`, { ...init, headers, body: bodyInit }, env));
  };

  return {
    db: t.db,
    auth,
    env,
    clock,
    tokenFor: (id) => `test:${id}`,
    request,
    json: async (path, init) => {
      const res = await request(path, init);
      const text = await res.text();
      return { status: res.status, body: text ? JSON.parse(text) : null };
    },
    seedUser: async ({ id, email, role, unitId = null, displayName, isActive = true }) => {
      const uid = id ?? `00000000-0000-4000-8000-${String(userSeq++).padStart(12, '0')}`;
      await t.raw.insert(profiles).values({ id: uid, email, displayName: displayName ?? email, role, unitId: role === 'COMMANDER' ? unitId : null, isActive });
      return uid;
    },
    close: t.close,
  };
}
