import { Hono } from 'hono';
import * as v from 'valibot';
import { applyMark, listSubmissions, loadUnitAttendance, submitUnit, type AttendanceContext } from '../attendance';
import { requireAuth } from '../auth/middleware';
import { readClock } from '../clock';
import type { AppEnv } from '../deps';
import { validation } from '../errors';
import { listEvents, toEventDto } from '../events';
import { isoDateSchema, jsonBody, markBodySchema, queryParams, submitBodySchema } from '../validation';
import { addDays, sgDateOf } from '@shared/dates';
import type { EventsDto, SubmissionsDto, UnitId } from '@shared/types';

const eventsQuerySchema = v.object({ date: v.optional(isoDateSchema) });

/** Parades are created on demand, but only within a year either side of today. */
const EVENT_WINDOW_DAYS = 366;

async function attendanceContext(c: { get(key: 'deps'): AppEnv['Variables']['deps']; env: AppEnv['Bindings'] } & { get(key: 'user'): AppEnv['Variables']['user'] }): Promise<AttendanceContext> {
  const { db } = c.get('deps');
  const clock = await readClock(db, c.env);
  return { db, user: c.get('user'), now: clock.now, sgToday: sgDateOf(clock.now) };
}

export const attendanceRoutes = new Hono<AppEnv>()
  .get('/events', requireAuth, queryParams(eventsQuerySchema), async (c) => {
    const ctx = await attendanceContext(c);
    const date = c.req.valid('query').date ?? ctx.sgToday;
    if (date < addDays(ctx.sgToday, -EVENT_WINDOW_DAYS) || date > addDays(ctx.sgToday, EVENT_WINDOW_DAYS)) {
      throw validation('Choose a date within a year of today', [{ path: 'date', message: 'Out of range' }]);
    }
    const rows = await listEvents(ctx.db, date);
    const body: EventsDto = { date, events: rows.map(toEventDto) };
    return c.json(body);
  })
  .get('/units/:unitId/events/:eventId/attendance', requireAuth, async (c) => {
    const ctx = await attendanceContext(c);
    return c.json(await loadUnitAttendance(ctx, c.req.param('unitId') as UnitId, c.req.param('eventId')));
  })
  .post('/units/:unitId/events/:eventId/persons/:personId/mark', requireAuth, jsonBody(markBodySchema), async (c) => {
    const ctx = await attendanceContext(c);
    const { unitId, eventId, personId } = c.req.param();
    return c.json(await applyMark(ctx, unitId as UnitId, eventId, personId, c.req.valid('json')));
  })
  .post('/units/:unitId/events/:eventId/submit', requireAuth, jsonBody(submitBodySchema), async (c) => {
    const ctx = await attendanceContext(c);
    const { unitId, eventId } = c.req.param();
    return c.json(await submitUnit(ctx, unitId as UnitId, eventId, c.req.valid('json')), 201);
  })
  .get('/units/:unitId/events/:eventId/submissions', requireAuth, async (c) => {
    const ctx = await attendanceContext(c);
    const { unitId, eventId } = c.req.param();
    const body: SubmissionsDto = { submissions: await listSubmissions(ctx, unitId as UnitId, eventId) };
    return c.json(body);
  });
