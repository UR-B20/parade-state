import { Hono } from 'hono';
import { ReadNotificationsSchema } from '@shared/schemas';
import { requireAdmin, requireAuth, type AppEnv } from '../auth/middleware';
import { listNotifications, markNotificationsRead } from '../services/notifications';
import { body } from '../validate';

export const notificationRoutes = new Hono<AppEnv>();
notificationRoutes.use('*', requireAuth, requireAdmin);

notificationRoutes.get('/', async (c) => {
  const limit = Math.min(Number(c.req.query('limit') ?? 50) || 50, 200);
  return c.json(await listNotifications(c.get('db'), c.get('user').id, c.req.query('unreadOnly') === '1', limit));
});

notificationRoutes.post('/read', body(ReadNotificationsSchema), async (c) => {
  const input = c.req.valid('json');
  await markNotificationsRead(c.get('db'), c.get('user').id, 'ids' in input ? input.ids : 'all', c.get('realNow'));
  return c.json({ ok: true });
});
