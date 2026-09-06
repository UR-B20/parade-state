import type { Bindings } from './env';
import { connectDb, type DbHandle } from './db/client';
import { verifySupabaseToken, type VerifiedToken } from './auth/jwt';
import { createSupabaseAuthAdmin, type AuthAdmin } from './auth/supabaseAdmin';

/** Swappable infrastructure so routes can be tested against PGlite with a fake identity provider. */
export interface AppDeps {
  getDb: (env: Bindings) => DbHandle;
  verifyToken: (token: string, env: Bindings) => Promise<VerifiedToken>;
  authAdmin: (env: Bindings) => AuthAdmin;
  /** Real wall clock. The demo clock is layered on top by resolveNow(). */
  now: () => Date;
}

export const defaultDeps: AppDeps = {
  getDb: connectDb,
  verifyToken: verifySupabaseToken,
  authAdmin: createSupabaseAuthAdmin,
  now: () => new Date(),
};
