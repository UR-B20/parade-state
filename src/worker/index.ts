import { Hono } from 'hono';
import type { Bindings } from './env';
import { demoControlsEnabled } from './env';
import { connect, isDatabaseConfigured } from './db/client';
import { handleError, notFound } from './errors';
import type { ConfigDto } from '@shared/types';

export type AppEnv = { Bindings: Bindings };

export function createApp() {
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

  app.get('/config', (c) => {
    const body: ConfigDto = {
      supabaseUrl: c.env.SUPABASE_URL ?? '',
      anonKey: c.env.SUPABASE_ANON_KEY ?? '',
      demoControls: demoControlsEnabled(c.env),
      needsBootstrap: false,
    };
    return c.json(body);
  });

  return app;
}

const app = createApp();

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Bindings, _ctx: ExecutionContext) {
    // Late notifications + Supabase keep-alive are wired in a later milestone.
  },
} satisfies ExportedHandler<Bindings>;
