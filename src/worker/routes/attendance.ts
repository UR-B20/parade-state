import { Hono } from 'hono';
import { MarkBodySchema } from '@shared/schemas';
import { requireAuth, requireUnitAccess, type AppEnv } from '../auth/middleware';
import { applyMark, assertEventDateEditable, loadUnitState, markRemainingPresent } from '../services/attendance';
import { getEvent } from '../services/events';
import { getSettings } from '../services/settings';
import { unitTrends } from '../services/trends';
import { body } from '../validate';

/** Mounted at /units/:unitId/attendance. */
export const attendanceRoutes = new Hono<AppEnv>();
attendanceRoutes.use('*', requireAuth);

attendanceRoutes.get('/:eventId', requireUnitAccess('read'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  return c.json(await loadUnitState(db, c.env, c.req.param('unitId')!, event, c.get('user'), c.get('realNow')));
});

attendanceRoutes.get('/:eventId/trends', requireUnitAccess('read'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  const requested = Number(c.req.query('days') ?? 14);
  const days = Number.isFinite(requested) ? Math.min(60, Math.max(2, Math.round(requested))) : 14;
  return c.json(await unitTrends(db, c.env, c.req.param('unitId')!, event, days, c.get('realNow')));
});

attendanceRoutes.post('/:eventId/mark-remaining-present', requireUnitAccess('write'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  await assertEventDateEditable(db, c.env, event, c.get('user'), c.get('realNow'));
  return c.json(await markRemainingPresent(db, c.env, c.req.param('unitId')!, event, c.get('user'), c.get('realNow')));
});

attendanceRoutes.put('/:eventId/persons/:personId', requireUnitAccess('write'), body(MarkBodySchema), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  await assertEventDateEditable(db, c.env, event, c.get('user'), c.get('realNow'));
  return c.json(await applyMark(db, c.env, c.req.param('unitId')!, event, c.req.param('personId'), c.req.valid('json'), c.get('user'), c.get('realNow')));
});
