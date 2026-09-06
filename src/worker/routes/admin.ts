import { Hono } from 'hono';
import { requireAdmin, requireAuth, type AppEnv } from '../auth/middleware';
import { notFound } from '../errors';
import { absenteesCsv, paradeStateXlsx } from '../export/paradeState';
import { getEvent } from '../services/events';
import { getSettings } from '../services/settings';
import { absentees, battalionSummary } from '../services/summary';
import { battalionTrends } from '../services/trends';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAuth, requireAdmin);

adminRoutes.get('/summary/:eventId', async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  return c.json(await battalionSummary(db, c.env, event, c.get('realNow')));
});

adminRoutes.get('/trends/:eventId', async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  const requested = Number(c.req.query('days') ?? 14);
  const days = Number.isFinite(requested) ? Math.min(60, Math.max(2, Math.round(requested))) : 14;
  return c.json(await battalionTrends(db, c.env, event, days, c.get('realNow')));
});

adminRoutes.get('/absentees/:eventId', async (c) => {
  const db = c.get('db');
  const event = await getEvent(db, c.req.param('eventId'), await getSettings(db));
  return c.json(await absentees(db, c.env, event, c.get('realNow')));
});

adminRoutes.get('/export/:file', async (c) => {
  const db = c.get('db');
  const m = /^(.+)\.(xlsx|csv)$/.exec(c.req.param('file'));
  if (!m) throw notFound('Export');
  const event = await getEvent(db, m[1]!, await getSettings(db));
  const stem = `parade-state-${event.date}-${event.type === 'ADHOC' ? 'adhoc' : event.type}`;
  const abs = await absentees(db, c.env, event, c.get('realNow'));
  if (m[2] === 'csv') {
    return c.body(absenteesCsv(abs), 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${stem}.csv"`,
    });
  }
  const summary = await battalionSummary(db, c.env, event, c.get('realNow'));
  const bytes = paradeStateXlsx(summary, abs, c.get('realNow'));
  return c.body(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, 200, {
    'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'content-disposition': `attachment; filename="${stem}.xlsx"`,
  });
});
