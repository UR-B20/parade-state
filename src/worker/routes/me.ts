import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { requireAuth } from '../auth/middleware';
import { readClock } from '../clock';
import { profiles } from '../db/schema';
import type { AppEnv } from '../deps';
import { toUserDto } from '../dto';
import { demoControlsEnabled } from '../env';
import { changePasswordBodySchema, jsonBody } from '../validation';
import { sgDateOf } from '@shared/dates';
import type { MeDto } from '@shared/types';

export const meRoutes = new Hono<AppEnv>()
  .get('/me', requireAuth, async (c) => {
    const { db } = c.get('deps');
    const clock = await readClock(db, c.env);
    const body: MeDto = {
      user: toUserDto(c.get('user')),
      serverNow: clock.now.toISOString(),
      sgToday: sgDateOf(clock.now),
      demo: { enabled: demoControlsEnabled(c.env), now: clock.demoNow?.toISOString() ?? null },
    };
    return c.json(body);
  })
  .post('/auth/change-password', requireAuth, jsonBody(changePasswordBodySchema), async (c) => {
    const { db, auth } = c.get('deps');
    const user = c.get('user');
    const { newPassword } = c.req.valid('json');
    await auth.setPassword(user.id, newPassword);
    const [updated] = await db
      .update(profiles)
      .set({ mustChangePassword: false })
      .where(eq(profiles.id, user.id))
      .returning();
    return c.json({ user: toUserDto(updated ?? { ...user, mustChangePassword: false }) });
  });
