import { createMiddleware } from 'hono/factory';
import type { Db } from '../db/client';
import type { ProfileRow } from '../db/schema';
import type { Bindings } from '../env';
import type { AppDeps } from '../deps';
import { forbidden, unauthorized } from '../errors';
import { getProfile } from '../services/users';

export type Variables = {
  db: Db;
  user: ProfileRow;
  deps: AppDeps;
  /** Real wall clock for this request. */
  realNow: Date;
};

export type AppEnv = { Bindings: Bindings; Variables: Variables };

/** Opens one database connection per request and releases it when the response is done. */
export function withDb(deps: AppDeps) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const handle = deps.getDb(c.env);
    c.set('db', handle.db);
    c.set('deps', deps);
    c.set('realNow', deps.now());
    try {
      await next();
    } finally {
      let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
      try {
        ctx = c.executionCtx;
      } catch {
        ctx = undefined; // Hono throws outside a Workers runtime (tests)
      }
      if (ctx) ctx.waitUntil(handle.close().catch(() => undefined));
      else await handle.close().catch(() => undefined);
    }
  });
}

/** Verifies the bearer token and loads the active profile. */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) throw unauthorized();
  const verified = await c.get('deps').verifyToken(token, c.env);
  const profile = await getProfile(c.get('db'), verified.sub);
  if (!profile) throw unauthorized('Your account is not set up yet. Ask S1 to create it.');
  if (!profile.isActive) throw forbidden('This account has been deactivated');
  c.set('user', profile);
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'ADMIN') throw forbidden('Only S1 can do this');
  await next();
});

/**
 * Commanders may only touch their own unit. Admins may read any unit and manage any roll,
 * but marking attendance ('write') is the commander's alone.
 */
export function requireUnitAccess(mode: 'read' | 'manage' | 'write') {
  return createMiddleware<AppEnv>(async (c, next) => {
    const user = c.get('user');
    const unitId = c.req.param('unitId');
    if (user.role === 'ADMIN') {
      if (mode === 'write') throw forbidden('Only the unit commander can mark attendance');
      await next();
      return;
    }
    if (!unitId || user.unitId !== unitId) throw forbidden();
    await next();
  });
}
