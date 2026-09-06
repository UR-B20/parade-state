import { eq } from 'drizzle-orm';
import { createMiddleware } from 'hono/factory';
import { profiles, type ProfileRow } from '../db/schema';
import type { AppEnv } from '../deps';
import { forbidden, passwordChangeRequired, unauthorized } from '../errors';
import type { UnitId } from '@shared/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * Require a signed-in, active user. Sets `user` on the context.
 * A user who must change their password may only reach the routes that let them do so.
 */
export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = bearerToken(c.req.header('Authorization'));
  if (!token) throw unauthorized();
  const { db, auth } = c.get('deps');
  const userId = await auth.verifyAccessToken(token);
  if (!userId || !UUID_RE.test(userId)) throw unauthorized('Your session has expired. Sign in again.');
  const [profile] = await db.select().from(profiles).where(eq(profiles.id, userId)).limit(1);
  if (!profile) throw unauthorized('No account for this sign-in. Ask S1 to create one.');
  if (!profile.isActive) throw forbidden('This account has been deactivated');
  if (profile.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(c.req.routePath)) {
    throw passwordChangeRequired();
  }
  c.set('user', profile);
  await next();
});

const PASSWORD_CHANGE_ALLOWED = new Set(['/api/me', '/api/auth/change-password']);

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.get('user').role !== 'ADMIN') throw forbidden('Only S1 can do this');
  await next();
});

/** Admins reach every unit; commanders only their own. */
export function assertUnitAccess(user: ProfileRow, unitId: UnitId): void {
  if (user.role === 'ADMIN') return;
  if (user.unitId !== unitId) throw forbidden();
}
