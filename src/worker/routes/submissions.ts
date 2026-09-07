import { Hono } from 'hono';
import { requireAuth, requireUnitAccess, type AppEnv } from '../auth/middleware';
import { assertEventDateEditable } from '../services/attendance';
import { assertEventVisible, getEvent } from '../services/events';
import { getSettings } from '../services/settings';
import { listSubmissions, submit } from '../services/submissions';

/** Mounted at /units/:unitId/submissions. */
export const submissionRoutes = new Hono<AppEnv>();
submissionRoutes.use('*', requireAuth);

submissionRoutes.post('/:eventId', requireUnitAccess('write'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  assertEventVisible(event, c.get('user'));
  await assertEventDateEditable(db, c.env, event, c.get('user'), c.get('realNow'));
  return c.json(await submit(db, c.env, c.req.param('unitId')!, event, c.get('user'), c.get('realNow')), 201);
});

submissionRoutes.get('/:eventId', requireUnitAccess('read'), async (c) => {
  return c.json(await listSubmissions(c.get('db'), c.req.param('unitId')!, c.req.param('eventId')));
});
