import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createHarness, type Harness } from './harness';
import type { MeDto, UserDto } from '@shared/types';

let h: Harness;
beforeAll(async () => { h = await createHarness(); });
afterAll(async () => { await h.close(); });

describe('config and bootstrap', () => {
  it('reports that setup is needed while no profiles exist', async () => {
    const { status, body } = await h.json<{ needsBootstrap: boolean; supabaseUrl: string }>('/config');
    expect(status).toBe(200);
    expect(body.needsBootstrap).toBe(true);
    expect(body.supabaseUrl).toBe('https://test.supabase.co');
  });

  it('rejects a wrong setup key and validates the body', async () => {
    const bad = await h.json('/auth/bootstrap', { method: 'POST', json: { email: 's1@bn.sg', displayName: 'CPT Ong', password: 'longenough1', setupKey: 'nope' } });
    expect(bad.status).toBe(403);
    const invalid = await h.json<{ error: { code: string; details: { fields: Record<string, string> } } }>('/auth/bootstrap', { method: 'POST', json: { email: 'not-an-email', displayName: 'X', password: 'short', setupKey: 'setup-key-123' } });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION');
    expect(Object.keys(invalid.body.error.details.fields).sort()).toEqual(['displayName', 'email', 'password']);
  });

  it('creates the first admin once, then refuses', async () => {
    const ok = await h.json<UserDto>('/auth/bootstrap', { method: 'POST', json: { email: 'S1@bn.sg', displayName: 'CPT Ong Li Ting', password: 'longenough1', setupKey: 'setup-key-123' } });
    expect(ok.status).toBe(201);
    expect(ok.body).toMatchObject({ email: 's1@bn.sg', role: 'ADMIN', mustChangePassword: false });
    expect(h.auth.created[0]).toMatchObject({ email: 's1@bn.sg', password: 'longenough1' });
    const again = await h.json('/auth/bootstrap', { method: 'POST', json: { email: 'x@bn.sg', displayName: 'Someone', password: 'longenough1', setupKey: 'setup-key-123' } });
    expect(again.status).toBe(403);
    expect((await h.json<{ needsBootstrap: boolean }>('/config')).body.needsBootstrap).toBe(false);
  });
});

describe('me and guards', () => {
  it('rejects missing, malformed and unknown tokens', async () => {
    expect((await h.request('/auth/me')).status).toBe(401);
    expect((await h.request('/auth/me', { headers: { authorization: 'Bearer garbage' } })).status).toBe(401);
    expect((await h.request('/auth/me', { as: '00000000-0000-4000-8000-00000000dead' })).status).toBe(401);
  });

  it('returns the profile with server time and Singapore date', async () => {
    const adminId = h.auth.created[0]!.id;
    const { status, body } = await h.json<MeDto>('/auth/me', { as: adminId });
    expect(status).toBe(200);
    expect(body.user.email).toBe('s1@bn.sg');
    expect(body.sgToday).toBe('2026-09-06');
    expect(body.demo).toEqual({ enabled: false, now: null });
  });

  it('blocks deactivated accounts', async () => {
    const id = await h.seedUser({ email: 'gone@bn.sg', role: 'COMMANDER', unitId: 'S2', isActive: false });
    expect((await h.request('/auth/me', { as: id })).status).toBe(403);
  });

  it('hides demo accounts unless demo controls are on', async () => {
    expect((await h.request('/auth/demo-accounts')).status).toBe(404);
  });
});

describe('S1 user administration', () => {
  let adminId: string;
  let cdrId: string;
  beforeAll(async () => {
    adminId = h.auth.created[0]!.id;
    cdrId = await h.seedUser({ email: 'cdr.coy1@bn.sg', role: 'COMMANDER', unitId: 'COY1', displayName: 'MAJ Lim' });
  });

  it('is admin only', async () => {
    expect((await h.request('/admin/users', { as: cdrId })).status).toBe(403);
    expect((await h.request('/admin/users', { as: adminId })).status).toBe(200);
  });

  it('creates a commander who must change their password, and rejects duplicates and unit-less commanders', async () => {
    const created = await h.json<UserDto>('/admin/users', { method: 'POST', as: adminId, json: { email: 'cdr.s3@bn.sg', displayName: 'CPT Tan', role: 'COMMANDER', unitId: 'S3', password: 'welcome123' } });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ role: 'COMMANDER', unitId: 'S3', mustChangePassword: true });
    const dup = await h.json('/admin/users', { method: 'POST', as: adminId, json: { email: 'cdr.s3@bn.sg', displayName: 'CPT Tan', role: 'COMMANDER', unitId: 'S3', password: 'welcome123' } });
    expect(dup.status).toBe(409);
    const noUnit = await h.json('/admin/users', { method: 'POST', as: adminId, json: { email: 'cdr.s4@bn.sg', displayName: 'CPT Goh', role: 'COMMANDER', unitId: null, password: 'welcome123' } });
    expect(noUnit.status).toBe(400);
  });

  it('resets passwords and forces a change on next sign-in', async () => {
    const res = await h.json('/admin/users/' + cdrId + '/reset-password', { method: 'POST', as: adminId, json: { newPassword: 'newpass123' } });
    expect(res.status).toBe(200);
    expect(h.auth.passwords[cdrId]).toBe('newpass123');
    const me = await h.json<MeDto>('/auth/me', { as: cdrId });
    expect(me.body.user.mustChangePassword).toBe(true);
    await h.request('/auth/password-changed', { method: 'POST', as: cdrId });
    expect((await h.json<MeDto>('/auth/me', { as: cdrId })).body.user.mustChangePassword).toBe(false);
  });

  it('deactivates and reactivates accounts, banning them in Supabase Auth, but never itself', async () => {
    const off = await h.json<UserDto>('/admin/users/' + cdrId, { method: 'PATCH', as: adminId, json: { isActive: false } });
    expect(off.body.isActive).toBe(false);
    expect(h.auth.banned[cdrId]).toBe(true);
    expect((await h.request('/auth/me', { as: cdrId })).status).toBe(403);
    const on = await h.json<UserDto>('/admin/users/' + cdrId, { method: 'PATCH', as: adminId, json: { isActive: true, unitId: 'COY2' } });
    expect(on.body).toMatchObject({ isActive: true, unitId: 'COY2' });
    expect(h.auth.banned[cdrId]).toBe(false);
    expect((await h.json('/admin/users/' + adminId, { method: 'PATCH', as: adminId, json: { isActive: false } })).status).toBe(400);
  });
});
