import { Hono } from 'hono';
import { isIsoDate, sgDateOf } from '@shared/dates';
import { CreateAdhocEventSchema } from '@shared/schemas';
import { requireAdmin, requireAuth, type AppEnv } from '../auth/middleware';
import { validation } from '../errors';
import { createAdhocEvent, listEvents } from '../services/events';
import { getSettings, resolveNow } from '../services/settings';
import { body } from '../validate';
import { listUnits } from '../services/platoons';

export const eventRoutes = new Hono<AppEnv>();
eventRoutes.use('*', requireAuth);

eventRoutes.get('/', async (c) => {
  const db = c.get('db');
  const { now, settings } = await resolveNow(db, c.env, c.get('realNow'));
  const date = c.req.query('date') ?? sgDateOf(now);
  if (!isIsoDate(date)) throw validation('Enter a valid date', { field: 'date' });
  return c.json(await listEvents(db, date, settings));
});

eventRoutes.post('/', requireAdmin, body(CreateAdhocEventSchema), async (c) => {
  const db = c.get('db');
  const input = c.req.valid('json');
  await getSettings(db);
  return c.json(await createAdhocEvent(db, input, c.get('user').id, c.get('realNow')), 201);
});

export const unitRoutes = new Hono<AppEnv>();
unitRoutes.use('*', requireAuth);
unitRoutes.get('/', async (c) => c.json(await listUnits(c.get('db'))));
