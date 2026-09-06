import { asc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAdmin, requireAuth } from '../auth/middleware';
import { profiles, units } from '../db/schema';
import type { AppEnv } from '../deps';
import { toUserDto } from '../dto';
import { notFound, validation } from '../errors';
import { createUserBodySchema, jsonBody, resetPasswordBodySchema } from '../validation';
import type { UnitId, UsersDto } from '@shared/types';

/** S1-only account management. Every route requires an active admin. */
export const adminRoutes = new Hono<AppEnv>()
  .use('/admin/*', requireAuth, requireAdmin)
  .get('/admin/users', async (c) => {
    const { db } = c.get('deps');
    const rows = await db.select().from(profiles).orderBy(asc(profiles.role), asc(profiles.unitId), asc(profiles.displayName));
    const body: UsersDto = { users: rows.map(toUserDto) };
    return c.json(body);
  })
  .post('/admin/users', jsonBody(createUserBodySchema), async (c) => {
    const { db, auth } = c.get('deps');
    const body = c.req.valid('json');
    const unitId = (body.unitId ?? null) as UnitId | null;
    if (body.role === 'COMMANDER') {
      if (!unitId) throw validation('Choose a unit for the commander', [{ path: 'unitId', message: 'Required for commanders' }]);
      const [unit] = await db.select({ id: units.id }).from(units).where(eq(units.id, unitId)).limit(1);
      if (!unit) throw validation('Unknown unit', [{ path: 'unitId', message: `No unit ${unitId}` }]);
    } else if (unitId) {
      throw validation('Admins do not belong to a unit', [{ path: 'unitId', message: 'Leave empty for admins' }]);
    }

    const created = await auth.createUser({ email: body.email, password: body.temporaryPassword, displayName: body.displayName });
    try {
      const [profile] = await db
        .insert(profiles)
        .values({
          id: created.id,
          email: body.email,
          displayName: body.displayName,
          role: body.role,
          unitId: body.role === 'COMMANDER' ? unitId : null,
          mustChangePassword: true,
          isActive: true,
        })
        .returning();
      return c.json({ user: toUserDto(profile!) }, 201);
    } catch (err) {
      await auth.deleteUser(created.id).catch((e) => console.error('Could not roll back new user', e));
      throw err;
    }
  })
  .post('/admin/users/:id/deactivate', async (c) => {
    const { db } = c.get('deps');
    const id = c.req.param('id');
    if (id === c.get('user').id) throw validation('You cannot deactivate your own account');
    const [updated] = await db.update(profiles).set({ isActive: false }).where(eq(profiles.id, id)).returning();
    if (!updated) throw notFound('Account');
    return c.json({ user: toUserDto(updated) });
  })
  .post('/admin/users/:id/activate', async (c) => {
    const { db } = c.get('deps');
    const [updated] = await db.update(profiles).set({ isActive: true }).where(eq(profiles.id, c.req.param('id'))).returning();
    if (!updated) throw notFound('Account');
    return c.json({ user: toUserDto(updated) });
  })
  .post('/admin/users/:id/reset-password', jsonBody(resetPasswordBodySchema), async (c) => {
    const { db, auth } = c.get('deps');
    const id = c.req.param('id');
    const [existing] = await db.select().from(profiles).where(eq(profiles.id, id)).limit(1);
    if (!existing) throw notFound('Account');
    await auth.setPassword(id, c.req.valid('json').temporaryPassword);
    const [updated] = await db.update(profiles).set({ mustChangePassword: true }).where(eq(profiles.id, id)).returning();
    return c.json({ user: toUserDto(updated ?? existing) });
  });
