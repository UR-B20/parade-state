import { Hono } from 'hono';
import { CreateUserSchema, ResetPasswordSchema, UpdateUserSchema } from '@shared/schemas';
import type { UnitId } from '@shared/types';
import { requireAdmin, requireAuth, type AppEnv } from '../auth/middleware';
import { validation } from '../errors';
import { createUser, listUsers, resetPassword, updateUser } from '../services/users';
import { body } from '../validate';

export const adminUserRoutes = new Hono<AppEnv>();
adminUserRoutes.use('*', requireAuth, requireAdmin);

adminUserRoutes.get('/', async (c) => c.json(await listUsers(c.get('db'))));

adminUserRoutes.post('/', body(CreateUserSchema), async (c) => {
  const input = c.req.valid('json');
  const user = await createUser(c.get('db'), c.get('deps').authAdmin(c.env), {
    email: input.email,
    displayName: input.displayName,
    role: input.role,
    unitId: (input.unitId as UnitId | null) ?? null,
    password: input.password,
    mustChangePassword: true,
  });
  return c.json(user, 201);
});

adminUserRoutes.patch('/:id', body(UpdateUserSchema), async (c) => {
  const id = c.req.param('id');
  const patch = c.req.valid('json');
  if (id === c.get('user').id && patch.isActive === false) throw validation('You cannot deactivate your own account');
  return c.json(await updateUser(c.get('db'), c.get('deps').authAdmin(c.env), id, { ...patch, unitId: patch.unitId as UnitId | null | undefined }));
});

adminUserRoutes.post('/:id/reset-password', body(ResetPasswordSchema), async (c) => {
  await resetPassword(c.get('db'), c.get('deps').authAdmin(c.env), c.req.param('id'), c.req.valid('json').newPassword);
  return c.json({ ok: true });
});
