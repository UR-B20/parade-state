import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { Bindings } from '../env';
import { AppError, conflict } from '../errors';
import type { AuthProvider, NewAuthUser } from './provider';

type TokenEnv = Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_JWT_SECRET'>;

/** One remote key set per project, shared across requests in the isolate (jose caches the keys). */
const remoteKeySets = new Map<string, JWTVerifyGetKey>();

function keySetFor(issuer: string): JWTVerifyGetKey {
  let keys = remoteKeySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`), {
      cacheMaxAge: 10 * 60_000,
      cooldownDuration: 30_000,
    });
    remoteKeySets.set(issuer, keys);
  }
  return keys;
}

export interface VerifyOptions {
  /** Override the key set (tests supply a local one). */
  keys?: JWTVerifyGetKey;
}

/**
 * Verify a Supabase access token and return its subject (the auth user id).
 * Current projects sign with an asymmetric key published at /auth/v1/.well-known/jwks.json;
 * legacy projects sign HS256 with the shared JWT secret, which must then be set as a Worker secret.
 */
export async function verifySupabaseAccessToken(env: TokenEnv, token: string, options: VerifyOptions = {}): Promise<string | null> {
  if (!env.SUPABASE_URL) return null;
  const issuer = `${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1`;
  try {
    const { alg } = decodeProtectedHeader(token);
    const verifyOptions = { issuer, audience: 'authenticated', algorithms: alg ? [alg] : undefined };
    if (alg === 'HS256') {
      if (!env.SUPABASE_JWT_SECRET) return null;
      const { payload } = await jwtVerify(token, new TextEncoder().encode(env.SUPABASE_JWT_SECRET), verifyOptions);
      return payload.sub ?? null;
    }
    const { payload } = await jwtVerify(token, options.keys ?? keySetFor(issuer), verifyOptions);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

type AdminEnv = Pick<Bindings, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY' | 'SUPABASE_JWT_SECRET'>;

interface GoTrueError {
  error_code?: string;
  msg?: string;
  message?: string;
}

function adminError(action: string, status: number, body: GoTrueError): AppError {
  const code = body.error_code;
  if (code === 'email_exists' || code === 'user_already_exists' || status === 422 && /already/i.test(body.msg ?? '')) {
    return conflict('An account with that email already exists');
  }
  if (code === 'weak_password') return new AppError('VALIDATION', body.msg ?? 'Password is too weak');
  if (code === 'user_not_found' || status === 404) return new AppError('NOT_FOUND', 'Account not found');
  console.error(`Supabase admin ${action} failed`, status, body);
  return new AppError('INTERNAL', `Could not ${action}`);
}

/**
 * Supabase Auth through its admin REST API (GoTrue). A direct fetch keeps supabase-js, and the
 * realtime, storage and PostgREST clients it bundles, out of the Worker.
 */
export function supabaseAuthProvider(env: AdminEnv): AuthProvider {
  const request = async (action: string, method: string, path: string, body?: unknown): Promise<unknown> => {
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new AppError('INTERNAL', 'Supabase is not configured on this Worker');
    }
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin${path}`, {
      method,
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    const json: unknown = text ? JSON.parse(text) : {};
    if (!res.ok) throw adminError(action, res.status, json as GoTrueError);
    return json;
  };

  return {
    verifyAccessToken: (token) => verifySupabaseAccessToken(env, token),
    async createUser({ email, password, displayName }: NewAuthUser) {
      const user = (await request('create the account', 'POST', '/users', {
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: displayName },
      })) as { id: string };
      return { id: user.id };
    },
    async deleteUser(id) {
      try {
        await request('delete the account', 'DELETE', `/users/${id}`);
      } catch (err) {
        if (!(err instanceof AppError && err.code === 'NOT_FOUND')) throw err;
      }
    },
    async setPassword(id, password) {
      await request('set the password', 'PUT', `/users/${id}`, { password });
    },
  };
}
