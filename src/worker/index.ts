import { Hono } from 'hono';
import type { Bindings } from './env';
import { demoControlsEnabled } from './env';
import { handleError, notFound } from './errors';
import type { ConfigDto } from '@shared/types';

export type AppEnv = { Bindings: Bindings };

export function createApp() {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError(handleError);
  app.notFound((c) => {
    throw notFound(`Route ${c.req.method} ${c.req.path}`);
  });

  app.get('/health', (c) => c.json({ ok: true, now: new Date().toISOString() }));

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
