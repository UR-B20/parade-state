import { Hono } from 'hono';
import * as v from 'valibot';
import { firstIssue, MarkBodySchema, MarkRemainingSchema } from '@shared/schemas';
import { requireAuth, requireUnitAccess, type AppEnv } from '../auth/middleware';
import { applyMark, assertEventDateEditable, loadUnitState, markRemainingPresent } from '../services/attendance';
import { assertEventVisible, getEvent } from '../services/events';
import { getSettings } from '../services/settings';
import { unitTrends } from '../services/trends';
import { validation } from '../errors';
import { body } from '../validate';

/** Mounted at /units/:unitId/attendance. */
export const attendanceRoutes = new Hono<AppEnv>();
attendanceRoutes.use('*', requireAuth);

attendanceRoutes.get('/:eventId', requireUnitAccess('read'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  assertEventVisible(event, c.get('user'));
  return c.json(await loadUnitState(db, c.env, c.req.param('unitId')!, event, c.get('user'), c.get('realNow')));
});

attendanceRoutes.get('/:eventId/trends', requireUnitAccess('read'), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  assertEventVisible(event, c.get('user'));
  const requested = Number(c.req.query('days') ?? 14);
  const days = Number.isFinite(requested) ? Math.min(60, Math.max(2, Math.round(requested))) : 14;
  return c.json(await unitTrends(db, c.env, c.req.param('unitId')!, event, days, c.get('realNow')));
});

attendanceRoutes.post('/:eventId/mark-remaining-present', requireUnitAccess('write'), async (c) => {
  const db = c.get('db');
  // The body is optional: no body (or {}) marks the whole unit; { platoonId } narrows it to one platoon.
  const raw = (await c.req.text()).trim();
  const parsed = v.safeParse(MarkRemainingSchema, raw ? JSON.parse(raw) : {});
  if (!parsed.success) throw validation('Choose a platoon of this unit', { fields: firstIssue(parsed.issues) });
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  assertEventVisible(event, c.get('user'));
  await assertEventDateEditable(db, c.env, event, c.get('user'), c.get('realNow'));
  return c.json(await markRemainingPresent(db, c.env, c.req.param('unitId')!, event, c.get('user'), c.get('realNow'), parsed.output.platoonId));
});

attendanceRoutes.put('/:eventId/persons/:personId', requireUnitAccess('write'), body(MarkBodySchema), async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  assertEventVisible(event, c.get('user'));
  await assertEventDateEditable(db, c.env, event, c.get('user'), c.get('realNow'));
  return c.json(await applyMark(db, c.env, c.req.param('unitId')!, event, c.req.param('personId'), c.req.valid('json'), c.get('user'), c.get('realNow')));
});
