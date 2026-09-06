/** Supabase access token verification: asymmetric keys via JWKS and the legacy HS256 secret. */
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { verifySupabaseAccessToken } from '../../worker/auth/supabase';

const SUPABASE_URL = 'https://abc123.supabase.co';
const ISSUER = `${SUPABASE_URL}/auth/v1`;
const SECRET = 'super-secret-jwt-token-with-at-least-32-characters';
const USER = '2f7d1a7e-4f8e-4c8e-9e6b-0b0f3d1f5a11';

let keys: ReturnType<typeof createLocalJWKSet>;
let privateKey: CryptoKey;
let otherPrivateKey: CryptoKey;

async function signEs256(key: CryptoKey, claims: Partial<{ iss: string; aud: string; exp: string }> = {}) {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'ES256', kid: 'key-1' })
    .setSubject(USER)
    .setIssuer(claims.iss ?? ISSUER)
    .setAudience(claims.aud ?? 'authenticated')
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '1h')
    .sign(key);
}

async function signHs256(secret: string, claims: Partial<{ exp: string }> = {}) {
  return new SignJWT({ role: 'authenticated' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER)
    .setIssuer(ISSUER)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '1h')
    .sign(new TextEncoder().encode(secret));
}

beforeAll(async () => {
  const pair = await generateKeyPair('ES256');
  const other = await generateKeyPair('ES256');
  privateKey = pair.privateKey;
  otherPrivateKey = other.privateKey;
  const jwk = await exportJWK(pair.publicKey);
  keys = createLocalJWKSet({ keys: [{ ...jwk, kid: 'key-1', alg: 'ES256', use: 'sig' }] });
});

describe('asymmetric (JWKS) tokens', () => {
  it('accepts a token signed by the project key', async () => {
    const token = await signEs256(privateKey);
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, token, { keys })).toBe(USER);
  });

  it('tolerates a trailing slash in SUPABASE_URL', async () => {
    const token = await signEs256(privateKey);
    expect(await verifySupabaseAccessToken({ SUPABASE_URL: `${SUPABASE_URL}/` }, token, { keys })).toBe(USER);
  });

  it('rejects a token signed by another key', async () => {
    const token = await signEs256(otherPrivateKey);
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, token, { keys })).toBeNull();
  });

  it('rejects the wrong issuer, audience or an expired token', async () => {
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, await signEs256(privateKey, { iss: 'https://evil.example/auth/v1' }), { keys })).toBeNull();
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, await signEs256(privateKey, { aud: 'anon' }), { keys })).toBeNull();
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, await signEs256(privateKey, { exp: '-1m' }), { keys })).toBeNull();
  });

  it('rejects garbage and an unconfigured project', async () => {
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, 'not.a.jwt', { keys })).toBeNull();
    expect(await verifySupabaseAccessToken({}, await signEs256(privateKey), { keys })).toBeNull();
  });
});

describe('legacy HS256 tokens', () => {
  it('accepts a token signed with the configured secret', async () => {
    const token = await signHs256(SECRET);
    expect(await verifySupabaseAccessToken({ SUPABASE_URL, SUPABASE_JWT_SECRET: SECRET }, token, { keys })).toBe(USER);
  });

  it('rejects HS256 when no secret is configured, even with a valid key set', async () => {
    const token = await signHs256(SECRET);
    expect(await verifySupabaseAccessToken({ SUPABASE_URL }, token, { keys })).toBeNull();
  });

  it('rejects a token signed with a different secret or expired', async () => {
    expect(await verifySupabaseAccessToken({ SUPABASE_URL, SUPABASE_JWT_SECRET: SECRET }, await signHs256('wrong-secret-wrong-secret-wrong-secret'), { keys })).toBeNull();
    expect(await verifySupabaseAccessToken({ SUPABASE_URL, SUPABASE_JWT_SECRET: SECRET }, await signHs256(SECRET, { exp: '-1m' }), { keys })).toBeNull();
  });
});
