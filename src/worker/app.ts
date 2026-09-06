/**
 * The API as a Hono app, independent of where it runs. The Worker entry (index.ts) wires it to
 * postgres-js and Supabase; tests and the in-browser demo wire it to PGlite. Nothing imported
 * here may depend on Node or on the Cloudflare runtime.
 */
import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { withDeps, type AppEnv, type DepsFactory } from './deps';
import { isDatabaseConfigured } from './env';
import { handleError, notFound } from './errors';
import { adminRoutes } from './routes/admin';
import { attendanceRoutes } from './routes/attendance';
import { bootstrapRoutes } from './routes/bootstrap';
import { meRoutes } from './routes/me';
import { unitRoutes } from './routes/units';

export type { AppEnv } from './deps';

export interface AppOptions {
  /** Builds the per-request database and auth provider. */
  deps: DepsFactory;
}

export function createApp({ deps }: AppOptions) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError(handleError);
  app.notFound((c) => {
    throw notFound(`Route ${c.req.method} ${c.req.path}`);
  });

  app.use('*', withDeps(deps));

  /** Liveness plus a database round trip when one is configured. 503 when the database fails. */
  app.get('/health', async (c) => {
    const body = { ok: true, now: new Date().toISOString(), db: 'unconfigured' as 'unconfigured' | 'ok' | 'error' };
    if (isDatabaseConfigured(c.env)) {
      try {
        await c.get('deps').db.execute(sql`select 1`);
        body.db = 'ok';
      } catch (err) {
        console.error('Database health check failed', err);
        body.ok = false;
        body.db = 'error';
      }
    }
    return c.json(body, body.ok ? 200 : 503);
  });

  app.route('/', bootstrapRoutes);
  app.route('/', meRoutes);
  app.route('/', adminRoutes);
  app.route('/', unitRoutes);
  app.route('/', attendanceRoutes);

  return app;
}

export type App = ReturnType<typeof createApp>;
