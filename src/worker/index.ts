import { Hono } from 'hono';
import type { Bindings } from './env';
import { demoControlsEnabled } from './env';
import { handleError, notFound } from './errors';
import type { ConfigDto } from '@shared/types';
import { defaultDeps, type AppDeps } from './deps';
import { withDb, type AppEnv } from './auth/middleware';
import { authRoutes } from './routes/auth';
import { adminUserRoutes } from './routes/adminUsers';
import { adminSettingsRoutes } from './routes/adminSettings';
import { eventRoutes, unitRoutes } from './routes/events';
import { rollRoutes } from './routes/roll';
import { attendanceRoutes } from './routes/attendance';
import { submissionRoutes } from './routes/submissions';
import { notificationRoutes } from './routes/notifications';
import { runScheduled } from './scheduled';
import { adminRoutes } from './routes/admin';
import { healthRoutes } from './routes/health';
import { profileCount } from './services/users';

export type { AppEnv };

export function createApp(deps: AppDeps = defaultDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError(handleError);
  app.notFound((c) => {
    throw notFound(`Route ${c.req.method} ${c.req.path}`);
  });

  app.get('/health', (c) => c.json({ ok: true, now: deps.now().toISOString() }));

  app.use('*', withDb(deps));

  app.get('/config', async (c) => {
    const body: ConfigDto = {
      supabaseUrl: c.env.SUPABASE_URL ?? '',
      anonKey: c.env.SUPABASE_ANON_KEY ?? '',
      demoControls: demoControlsEnabled(c.env),
      needsBootstrap: (await profileCount(c.get('db'))) === 0,
    };
    return c.json(body);
  });

  app.route('/auth', authRoutes);
  app.route('/events', eventRoutes);
  app.route('/units', unitRoutes);
  app.route('/units/:unitId/personnel', rollRoutes);
  app.route('/units/:unitId/attendance', attendanceRoutes);
  app.route('/units/:unitId/submissions', submissionRoutes);
  app.route('/notifications', notificationRoutes);
  app.route('/admin/users', adminUserRoutes);
  app.route('/admin/health', healthRoutes);
  app.route('/admin', adminRoutes);
  app.route('/admin', adminSettingsRoutes);

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Bindings, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env, defaultDeps).then((r) => console.log('scheduled run', JSON.stringify(r))));
  },
} satisfies ExportedHandler<Bindings>;
