import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from 'jose';
import type { Bindings } from '../env';
import { unauthorized } from '../errors';

export interface VerifiedToken {
  sub: string;
  email: string | null;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Verify a Supabase access token. New projects sign with asymmetric keys published at the
 * JWKS endpoint; legacy projects use a shared HS256 secret (SUPABASE_JWT_SECRET).
 */
export async function verifySupabaseToken(token: string, env: Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_JWT_SECRET'>): Promise<VerifiedToken> {
  if (!env.SUPABASE_URL) throw new Error('SUPABASE_URL is not configured');
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  let payload: JWTPayload;
  try {
    const header = decodeProtectedHeader(token);
    if (header.alg === 'HS256') {
      if (!env.SUPABASE_JWT_SECRET) throw unauthorized('Token signed with a shared secret but SUPABASE_JWT_SECRET is not set');
      ({ payload } = await jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), { issuer, audience: 'authenticated' }));
    } else {
      let jwks = jwksCache.get(issuer);
      if (!jwks) {
        jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), { cacheMaxAge: 10 * 60_000 });
        jwksCache.set(issuer, jwks);
      }
      ({ payload } = await jwtVerify(token, jwks, { issuer, audience: 'authenticated' }));
    }
  } catch (err) {
    if (err instanceof Error && err.name === 'AppError') throw err;
    throw unauthorized('Your session has expired. Sign in again.');
  }
  if (!payload.sub) throw unauthorized();
  return { sub: payload.sub, email: typeof payload.email === 'string' ? payload.email : null };
}
