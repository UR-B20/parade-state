/** The Supabase Auth admin calls the Worker makes, against a stubbed fetch. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { supabaseAuthProvider } from '../../worker/auth/supabase';
import { AppError } from '../../worker/errors';

const env = { SUPABASE_URL: 'https://abc123.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: 'service-role-key' };

type Call = { url: string; init: RequestInit };

function stubFetch(responses: { status: number; body?: unknown }[]): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 500, body: { msg: 'no stub' } };
    return new Response(next.body === undefined ? '' : JSON.stringify(next.body), { status: next.status });
  });
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe('Supabase admin API', () => {
  it('creates a confirmed user with the service role key', async () => {
    const calls = stubFetch([{ status: 200, body: { id: 'u-1', email: 'a@b.c' } }]);
    const result = await supabaseAuthProvider(env).createUser({ email: 'a@b.c', password: 'pw-12345678', displayName: 'A' });
    expect(result).toEqual({ id: 'u-1' });
    expect(calls[0]!.url).toBe('https://abc123.supabase.co/auth/v1/admin/users');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.headers).toMatchObject({ apikey: 'service-role-key', Authorization: 'Bearer service-role-key' });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({
      email: 'a@b.c',
      password: 'pw-12345678',
      email_confirm: true,
      user_metadata: { display_name: 'A' },
    });
  });

  it('maps a duplicate email to CONFLICT', async () => {
    stubFetch([{ status: 422, body: { code: 422, error_code: 'email_exists', msg: 'Email address already registered by another user' } }]);
    const err = await supabaseAuthProvider(env).createUser({ email: 'a@b.c', password: 'pw-12345678', displayName: 'A' }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe('CONFLICT');
  });

  it('sets a password with PUT and swallows a missing user on delete', async () => {
    const calls = stubFetch([{ status: 200, body: { id: 'u-1' } }, { status: 404, body: { error_code: 'user_not_found', msg: 'User not found' } }]);
    const provider = supabaseAuthProvider(env);
    await provider.setPassword('u-1', 'new-password-1');
    await provider.deleteUser('u-gone');
    expect(calls[0]).toMatchObject({ url: 'https://abc123.supabase.co/auth/v1/admin/users/u-1', init: { method: 'PUT' } });
    expect(JSON.parse(calls[0]!.init.body as string)).toEqual({ password: 'new-password-1' });
    expect(calls[1]).toMatchObject({ url: 'https://abc123.supabase.co/auth/v1/admin/users/u-gone', init: { method: 'DELETE' } });
  });

  it('turns other failures into INTERNAL without leaking the response', async () => {
    stubFetch([{ status: 500, body: { msg: 'boom' } }]);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = await supabaseAuthProvider(env).setPassword('u-1', 'x'.repeat(10)).catch((e) => e);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toBe('Could not set the password');
    spy.mockRestore();
  });

  it('fails clearly when the Worker has no Supabase secrets', async () => {
    const err = await supabaseAuthProvider({ SUPABASE_URL: env.SUPABASE_URL }).deleteUser('u-1').catch((e) => e);
    expect(err.code).toBe('INTERNAL');
    expect(err.message).toMatch(/not configured/);
  });
});
