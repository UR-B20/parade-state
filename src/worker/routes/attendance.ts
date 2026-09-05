import { Hono } from 'hono';
import { MarkBodySchema } from '@shared/schemas';
import { requireAuth, requireUnitAccess, type AppEnv } from '../auth/middleware';
import { applyMark, assertEventDateEditable, loadUnitState } from '../services/attendance';
import { getEvent } from '../services/events';
import { getSettings } from '../services/settings';
import { body } from '../validate';

/** Mounted at /units/:unitId/attendance. */
export const attendanceRoutes = new Hono<AppEnv>();
attendanceRoutes.use('*', requireAuth);

attendanceRoutes.get('/:eventId', requireUnitAccess('read'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  return c.json(await loadUnitState(db, c.env, c.req.param('unitId')!, event, c.get('user'), c.get('realNow')));
});

attendanceRoutes.put('/:eventId/persons/:personId', requireUnitAccess('write'), body(MarkBodySchema), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  await assertEventDateEditable(db, c.env, event, c.get('user'), c.get('realNow'));
  return c.json(await applyMark(db, c.env, c.req.param('unitId')!, event, c.req.param('personId'), c.req.valid('json'), c.get('user'), c.get('realNow')));
});
