import { Hono } from 'hono';
import { sgDateOf } from '@shared/dates';
import type { MeDto } from '@shared/types';
import { BootstrapSchema } from '@shared/schemas';
import { DEMO_EMAIL_DOMAIN } from '@shared/demo/dataset';
import { requireAuth, type AppEnv } from '../auth/middleware';
import { demoControlsEnabled } from '../env';
import { forbidden, notFound } from '../errors';
import { resolveNow } from '../services/settings';
import { createUser, markPasswordChanged, profileCount, toUserDto } from '../services/users';
import { body } from '../validate';

export const authRoutes = new Hono<AppEnv>();

authRoutes.get('/me', requireAuth, async (c) => {
  const { now, demoNow } = await resolveNow(c.get('db'), c.env, c.get('realNow'));
  const dto: MeDto = {
    user: toUserDto(c.get('user')),
    serverNow: c.get('realNow').toISOString(),
    sgToday: sgDateOf(now),
    demo: { enabled: demoControlsEnabled(c.env), now: demoNow },
  };
  return c.json(dto);
});

authRoutes.post('/password-changed', requireAuth, async (c) => {
  await markPasswordChanged(c.get('db'), c.get('user').id);
  return c.json({ ok: true });
});

/** One-time creation of the first S1 admin, gated by the setup key secret and an empty profiles table. */
authRoutes.post('/bootstrap', body(BootstrapSchema), async (c) => {
  const input = c.req.valid('json');
  const db = c.get('db');
  if ((await profileCount(db)) > 0) throw forbidden('Setup has already been completed');
  const key = c.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!key || input.setupKey !== key) throw forbidden('The setup key is incorrect');
  const user = await createUser(db, c.get('deps').authAdmin(c.env), {
    email: input.email,
    displayName: input.displayName,
    role: 'ADMIN',
    unitId: null,
    password: input.password,
    mustChangePassword: false,
  });
  return c.json(user, 201);
});

/** Demo accounts for one-tap sign-in on demo deployments. */
authRoutes.get('/demo-accounts', (c) => {
  if (!demoControlsEnabled(c.env)) throw notFound('Route');
  return c.json([
    { email: `cdr.coy1@${DEMO_EMAIL_DOMAIN}`, label: 'Coy 1 commander', role: 'COMMANDER' },
    { email: `s1admin@${DEMO_EMAIL_DOMAIN}`, label: 'S1 admin', role: 'ADMIN' },
  ]);
});
