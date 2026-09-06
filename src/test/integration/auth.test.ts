/**
 * M2 exit check: an S1 admin is bootstrapped on an empty database, creates a commander, and
 * that commander is refused any other unit's data. Plus the rules around it: bootstrap is
 * one-shot and secret-gated, must-change-password gates the API, deactivation locks out.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_UNITS } from '@shared/demo/dataset';
import type { ApiErrorBody, ConfigDto, MeDto, RollDto, UnitsDto, UserDto, UsersDto } from '@shared/types';
import * as schema from '../../worker/db/schema';
import { createTestApp, type TestApp } from '../helpers/app';
import { createTestDb, type TestDb } from '../helpers/pglite';

let t: TestDb;
let api: TestApp;
let adminId: string;
let coy1Id: string;

const ADMIN = { email: 'S1.Admin@example.mil', displayName: 'CPT Ong Li Ting', bootstrapPassword: 'bootstrap-secret-1' };

beforeAll(async () => {
  t = await createTestDb();
  api = createTestApp(t);
  await t.db.insert(schema.units).values(DEMO_UNITS);
  await t.db.insert(schema.personnel).values([
    { unitId: 'COY1', rank: 'CPL', name: 'Daniel Tan', postedInDate: '2025-01-01' },
    { unitId: 'COY1', rank: '3SG', name: 'Ryan Lim', postedInDate: '2025-01-01' },
    { unitId: 'COY1', rank: 'PTE', name: 'Posted Out', postedInDate: '2025-01-01', postedOutDate: '2026-01-01' },
    { unitId: 'COY1', rank: 'PTE', name: 'Not Yet In', postedInDate: '2099-01-01' },
    { unitId: 'COY2', rank: 'CPL', name: 'Someone Else', postedInDate: '2025-01-01' },
  ]);
});

afterAll(async () => {
  await t?.close();
});

describe('bootstrap', () => {
  it('reports needsBootstrap while there are no accounts', async () => {
    const { status, body } = await api.json<ConfigDto>('GET', '/config');
    expect(status).toBe(200);
    expect(body).toMatchObject({ needsBootstrap: true, demoControls: false, supabaseUrl: 'https://test.supabase.co' });
  });

  it('does not offer bootstrap when the secret is absent', async () => {
    const { body } = await api.json<ConfigDto>('GET', '/config', { env: { BOOTSTRAP_ADMIN_PASSWORD: undefined } });
    expect(body.needsBootstrap).toBe(false);
  });

  it('rejects a wrong bootstrap password without creating anything', async () => {
    const { status, body } = await api.json<ApiErrorBody>('POST', '/bootstrap', { body: { ...ADMIN, bootstrapPassword: 'nope' } });
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(api.auth.users.size).toBe(0);
  });

  it('validates the body', async () => {
    const { status, body } = await api.json<ApiErrorBody>('POST', '/bootstrap', { body: { email: 'not-an-email', displayName: '', bootstrapPassword: 'x' } });
    expect(status).toBe(400);
    expect(body.error.code).toBe('VALIDATION');
    expect((body.error.details as { path: string }[]).map((d) => d.path).sort()).toEqual(['displayName', 'email']);
  });

  it('creates the first S1 admin, who must change the bootstrap password', async () => {
    const { status, body } = await api.json<{ user: UserDto }>('POST', '/bootstrap', { body: ADMIN });
    expect(status).toBe(201);
    expect(body.user).toMatchObject({ email: 's1.admin@example.mil', role: 'ADMIN', unitId: null, mustChangePassword: true, isActive: true });
    adminId = body.user.id;
    expect(api.auth.users.get('s1.admin@example.mil')).toEqual({ id: adminId, password: ADMIN.bootstrapPassword });
  });

  it('is one-shot: a second bootstrap is refused and config no longer asks for it', async () => {
    const { status, body } = await api.json<ApiErrorBody>('POST', '/bootstrap', { body: { ...ADMIN, email: 'second@example.mil' } });
    expect(status).toBe(409);
    expect(body.error.code).toBe('CONFLICT');
    expect(api.auth.users.size).toBe(1);
    const config = await api.json<ConfigDto>('GET', '/config');
    expect(config.body.needsBootstrap).toBe(false);
  });
});

describe('sign-in and password change', () => {
  it('refuses requests without a token or with a bad one', async () => {
    expect((await api.call('GET', '/me')).status).toBe(401);
    const res = await api.call('GET', '/me', { as: 'unknown-user' });
    expect(res.status).toBe(401);
  });

  it('serves /me but blocks other routes until the password is changed', async () => {
    const me = await api.json<MeDto>('GET', '/me', { as: adminId });
    expect(me.status).toBe(200);
    expect(me.body.user.mustChangePassword).toBe(true);
    expect(me.body.sgToday).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(me.body.demo).toEqual({ enabled: false, now: null });

    const blocked = await api.json<ApiErrorBody>('GET', '/admin/users', { as: adminId });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  it('rejects a short password', async () => {
    const { status } = await api.call('POST', '/auth/change-password', { as: adminId, body: { newPassword: 'short' } });
    expect(status).toBe(400);
  });

  it('changes the password and clears the flag', async () => {
    const { status, body } = await api.json<{ user: UserDto }>('POST', '/auth/change-password', { as: adminId, body: { newPassword: 'correct horse battery' } });
    expect(status).toBe(200);
    expect(body.user.mustChangePassword).toBe(false);
    expect(api.auth.users.get('s1.admin@example.mil')!.password).toBe('correct horse battery');
    expect((await api.call('GET', '/admin/users', { as: adminId })).status).toBe(200);
  });

  it('uses the demo clock on demo deployments', async () => {
    await t.db.update(schema.settings).set({ demoNow: new Date('2026-09-06T01:24:00.000Z') });
    const real = await api.json<MeDto>('GET', '/me', { as: adminId });
    expect(real.body.demo.now).toBeNull();
    const demo = await api.json<MeDto>('GET', '/me', { as: adminId, env: { DEMO_CONTROLS: 'true' } });
    expect(demo.body.serverNow).toBe('2026-09-06T01:24:00.000Z');
    expect(demo.body.sgToday).toBe('2026-09-06');
    expect(demo.body.demo).toEqual({ enabled: true, now: '2026-09-06T01:24:00.000Z' });
  });
});

describe('S1 account management', () => {
  it('requires a commander to have a unit that exists', async () => {
    const noUnit = await api.json<ApiErrorBody>('POST', '/admin/users', {
      as: adminId,
      body: { email: 'c@example.mil', displayName: 'C', role: 'COMMANDER', temporaryPassword: 'temporary1' },
    });
    expect(noUnit.status).toBe(400);
    const badUnit = await api.json<ApiErrorBody>('POST', '/admin/users', {
      as: adminId,
      body: { email: 'c@example.mil', displayName: 'C', role: 'COMMANDER', unitId: 'COY9', temporaryPassword: 'temporary1' },
    });
    expect(badUnit.status).toBe(400);
    expect(api.auth.users.size).toBe(1);
  });

  it('creates a commander with a temporary password', async () => {
    const { status, body } = await api.json<{ user: UserDto }>('POST', '/admin/users', {
      as: adminId,
      body: { email: 'cdr.coy1@example.mil', displayName: 'Coy 1 commander', role: 'COMMANDER', unitId: 'COY1', temporaryPassword: 'temporary1' },
    });
    expect(status).toBe(201);
    expect(body.user).toMatchObject({ role: 'COMMANDER', unitId: 'COY1', mustChangePassword: true });
    coy1Id = body.user.id;
  });

  it('refuses a duplicate email and leaves no half-created account', async () => {
    const { status } = await api.call('POST', '/admin/users', {
      as: adminId,
      body: { email: 'CDR.COY1@example.mil', displayName: 'Dup', role: 'COMMANDER', unitId: 'COY1', temporaryPassword: 'temporary1' },
    });
    expect(status).toBe(409);
    const rows = await t.client.query<{ n: string }>('select count(*)::text as n from auth.users');
    expect(rows.rows[0]!.n).toBe('2');
  });

  it('lists accounts', async () => {
    const { body } = await api.json<UsersDto>('GET', '/admin/users', { as: adminId });
    expect(body.users.map((u) => u.email)).toEqual(['s1.admin@example.mil', 'cdr.coy1@example.mil']);
  });

  it('keeps commanders out of admin routes', async () => {
    await api.call('POST', '/auth/change-password', { as: coy1Id, body: { newPassword: 'commander-pass' } });
    const { status, body } = await api.json<ApiErrorBody>('GET', '/admin/users', { as: coy1Id });
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });
});

describe('unit access', () => {
  it('lets the commander read their own roll for today only with active personnel', async () => {
    const { status, body } = await api.json<RollDto>('GET', '/units/COY1/roll', { as: coy1Id });
    expect(status).toBe(200);
    expect(body.unit.id).toBe('COY1');
    expect(body.persons.map((p) => `${p.rank} ${p.name}`)).toEqual(['3SG Ryan Lim', 'CPL Daniel Tan']);
  });

  it('honours the date parameter for the roll', async () => {
    const { body } = await api.json<RollDto>('GET', '/units/COY1/roll?date=2025-06-01', { as: coy1Id });
    expect(body.persons.map((p) => p.name)).toEqual(['Ryan Lim', 'Daniel Tan', 'Posted Out']);
    expect((await api.call('GET', '/units/COY1/roll?date=June', { as: coy1Id })).status).toBe(400);
  });

  it("refuses the commander another unit's data", async () => {
    const { status, body } = await api.json<ApiErrorBody>('GET', '/units/COY2/roll', { as: coy1Id });
    expect(status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
  });

  it('lets S1 read any unit and the unit list', async () => {
    const coy2 = await api.json<RollDto>('GET', '/units/COY2/roll', { as: adminId });
    expect(coy2.body.persons.map((p) => p.name)).toEqual(['Someone Else']);
    const list = await api.json<UnitsDto>('GET', '/units', { as: coy1Id });
    expect(list.body.units.map((u) => u.id)).toEqual(DEMO_UNITS.map((u) => u.id));
    expect((await api.call('GET', '/units/NOPE/roll', { as: adminId })).status).toBe(404);
  });
});

describe('deactivation and password reset', () => {
  it('will not let an admin deactivate themselves', async () => {
    expect((await api.call('POST', `/admin/users/${adminId}/deactivate`, { as: adminId })).status).toBe(400);
  });

  it('locks out a deactivated commander immediately and lets them back in on activation', async () => {
    expect((await api.call('POST', `/admin/users/${coy1Id}/deactivate`, { as: adminId })).status).toBe(200);
    const { status, body } = await api.json<ApiErrorBody>('GET', '/me', { as: coy1Id });
    expect(status).toBe(403);
    expect(body.error.message).toMatch(/deactivated/);
    expect((await api.call('POST', `/admin/users/${coy1Id}/activate`, { as: adminId })).status).toBe(200);
    expect((await api.call('GET', '/me', { as: coy1Id })).status).toBe(200);
  });

  it('resets a password and forces a change on next sign-in', async () => {
    const { status, body } = await api.json<{ user: UserDto }>('POST', `/admin/users/${coy1Id}/reset-password`, { as: adminId, body: { temporaryPassword: 'temporary2' } });
    expect(status).toBe(200);
    expect(body.user.mustChangePassword).toBe(true);
    expect(api.auth.users.get('cdr.coy1@example.mil')!.password).toBe('temporary2');
    expect((await api.call('GET', '/units/COY1/roll', { as: coy1Id })).status).toBe(403);
    expect((await api.call('POST', '/admin/users/00000000-0000-0000-0000-000000000000/reset-password', { as: adminId, body: { temporaryPassword: 'temporary2' } })).status).toBe(404);
  });
});
