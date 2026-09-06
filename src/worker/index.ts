import { Hono } from 'hono';
import { connect, isDatabaseConfigured } from './db/client';
import { defaultDeps, withDeps, type AppEnv, type DepsFactory } from './deps';
import type { Bindings } from './env';
import { handleError, notFound } from './errors';
import { adminRoutes } from './routes/admin';
import { bootstrapRoutes } from './routes/bootstrap';
import { meRoutes } from './routes/me';
import { unitRoutes } from './routes/units';

export type { AppEnv } from './deps';

export interface AppOptions {
  /** Builds the per-request database and auth provider. Defaults to Supabase via the Worker bindings. */
  deps?: DepsFactory;
}

export function createApp({ deps = defaultDeps }: AppOptions = {}) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError(handleError);
  app.notFound((c) => {
    throw notFound(`Route ${c.req.method} ${c.req.path}`);
  });

  /** Liveness plus a database round trip when one is configured. 503 when the database fails. */
  app.get('/health', async (c) => {
    const body = { ok: true, now: new Date().toISOString(), db: 'unconfigured' as 'unconfigured' | 'ok' | 'error' };
    if (isDatabaseConfigured(c.env)) {
      const { sql } = connect(c.env);
      try {
        await sql`select 1`;
        body.db = 'ok';
      } catch (err) {
        console.error('Database health check failed', err);
        body.ok = false;
        body.db = 'error';
      } finally {
        c.executionCtx.waitUntil(sql.end({ timeout: 5 }));
      }
    }
    return c.json(body, body.ok ? 200 : 503);
  });

  app.use('*', withDeps(deps));
  app.route('/', bootstrapRoutes);
  app.route('/', meRoutes);
  app.route('/', adminRoutes);
  app.route('/', unitRoutes);

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Bindings, _ctx: ExecutionContext) {
    // Late notifications + Supabase keep-alive are wired in a later milestone.
  },
} satisfies ExportedHandler<Bindings>;
