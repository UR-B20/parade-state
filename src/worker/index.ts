/** Cloudflare Worker entry: the API on postgres-js and Supabase, plus the scheduled handler. */
import { createApp } from './app';
import { supabaseAuthProvider } from './auth/supabase';
import { connect } from './db/client';
import type { Db, DepsFactory } from './deps';
import { isDatabaseConfigured, type Bindings } from './env';
import { AppError } from './errors';

export { createApp } from './app';

/** A database handle that fails loudly on first use when no database is configured. */
const unconfiguredDb = new Proxy({} as Db, {
  get() {
    throw new AppError('INTERNAL', 'Database is not configured: bind HYPERDRIVE or set SUPABASE_DB_URL');
  },
});

export const workerDeps: DepsFactory = (env) => {
  if (!isDatabaseConfigured(env)) {
    return { db: unconfiguredDb, auth: supabaseAuthProvider(env), release: async () => {} };
  }
  const { sql, db } = connect(env);
  return {
    db: db as unknown as Db,
    auth: supabaseAuthProvider(env),
    release: () => sql.end({ timeout: 5 }),
  };
};

const app = createApp({ deps: workerDeps });

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, _env: Bindings, _ctx: ExecutionContext) {
    // Late notifications + Supabase keep-alive are wired in a later milestone.
  },
} satisfies ExportedHandler<Bindings>;
