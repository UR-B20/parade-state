import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { isIsoDate, sgDateOf } from '@shared/dates';
import { DemoClockSchema, SettingsSchema } from '@shared/schemas';
import { requireAdmin, requireAuth, type AppEnv } from '../auth/middleware';
import { dateUnlocks } from '../db/schema';
import { demoControlsEnabled } from '../env';
import { notFound, validation } from '../errors';
import { resolveNow, setSetting, settingsDto } from '../services/settings';
import { body } from '../validate';

export const adminSettingsRoutes = new Hono<AppEnv>();
adminSettingsRoutes.use('*', requireAuth, requireAdmin);

adminSettingsRoutes.get('/settings', async (c) => c.json(await settingsDto(c.get('db'), c.get('realNow'))));

adminSettingsRoutes.put('/settings', body(SettingsSchema), async (c) => {
  const db = c.get('db');
  const input = c.req.valid('json');
  if (input.cutoffAm) await setSetting(db, 'cutoff_am', input.cutoffAm);
  if (input.cutoffPm) await setSetting(db, 'cutoff_pm', input.cutoffPm);
  return c.json(await settingsDto(db, c.get('realNow')));
});

/** Unlock a past date for 24 hours so commanders can correct it. */
adminSettingsRoutes.post('/date-unlocks/:date', async (c) => {
  const db = c.get('db');
  const date = c.req.param('date');
  if (!isIsoDate(date)) throw validation('Enter a valid date');
  const { now } = await resolveNow(db, c.env, c.get('realNow'));
  if (date >= sgDateOf(now)) throw validation('Only past dates need unlocking');
  const expiresAt = new Date(c.get('realNow').getTime() + 24 * 3600_000);
  await db
    .insert(dateUnlocks)
    .values({ date, unlockedBy: c.get('user').id, unlockedAt: c.get('realNow'), expiresAt })
    .onConflictDoUpdate({ target: dateUnlocks.date, set: { unlockedBy: c.get('user').id, unlockedAt: c.get('realNow'), expiresAt } });
  return c.json(await settingsDto(db, c.get('realNow')));
});

adminSettingsRoutes.delete('/date-unlocks/:date', async (c) => {
  const db = c.get('db');
  await db.delete(dateUnlocks).where(eq(dateUnlocks.date, c.req.param('date')));
  return c.json(await settingsDto(db, c.get('realNow')));
});

adminSettingsRoutes.get('/demo-clock', async (c) => {
  if (!demoControlsEnabled(c.env)) throw notFound('Route');
  const { demoNow } = await resolveNow(c.get('db'), c.env, c.get('realNow'));
  return c.json({ now: demoNow });
});

adminSettingsRoutes.put('/demo-clock', body(DemoClockSchema), async (c) => {
  if (!demoControlsEnabled(c.env)) throw notFound('Route');
  await setSetting(c.get('db'), 'demo_now', c.req.valid('json').now);
  return c.json({ now: c.req.valid('json').now });
});
