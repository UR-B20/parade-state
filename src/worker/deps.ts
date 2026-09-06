/**
 * Per-request dependencies. The default factory opens a database connection and builds the
 * Supabase auth provider from the Worker's bindings; tests supply PGlite and a fake provider.
 */
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { createMiddleware } from 'hono/factory';
import type { AuthProvider } from './auth/provider';
import { supabaseAuthProvider } from './auth/supabase';
import { connect } from './db/client';
import * as schema from './db/schema';
import type { Bindings } from './env';

/** Any Drizzle Postgres driver (postgres-js in the Worker, PGlite in tests). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

export interface RequestDeps {
  db: Db;
  auth: AuthProvider;
  /** Called once the response is sent. */
  release(): Promise<void>;
}

export type DepsFactory = (env: Bindings) => RequestDeps;

export const defaultDeps: DepsFactory = (env) => {
  const { sql, db } = connect(env);
  return {
    db: db as unknown as Db,
    auth: supabaseAuthProvider(env),
    release: () => sql.end({ timeout: 5 }),
  };
};

export type AppEnv = {
  Bindings: Bindings;
  Variables: {
    deps: RequestDeps;
    user: schema.ProfileRow;
  };
};

/** Attach dependencies to the request and release them after the response is sent. */
export function withDeps(factory: DepsFactory) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const deps = factory(c.env);
    c.set('deps', deps);
    try {
      await next();
    } finally {
      let ctx: { waitUntil(promise: Promise<unknown>): void } | undefined;
      try {
        ctx = c.executionCtx;
      } catch {
        ctx = undefined;
      }
      if (ctx) ctx.waitUntil(deps.release());
      else await deps.release();
    }
  });
}
