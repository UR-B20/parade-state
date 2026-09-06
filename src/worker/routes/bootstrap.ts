import { sql } from 'drizzle-orm';
import { Hono } from 'hono';
import { profiles } from '../db/schema';
import type { AppEnv, Db } from '../deps';
import { toUserDto } from '../dto';
import { demoControlsEnabled } from '../env';
import { AppError, conflict, forbidden } from '../errors';
import { bootstrapBodySchema, jsonBody } from '../validation';
import type { ConfigDto, UserDto } from '@shared/types';

/** Advisory lock key that serialises bootstrap attempts. */
const BOOTSTRAP_LOCK = 20260906;

export async function hasAnyProfile(db: Db): Promise<boolean> {
  const [row] = await db.select({ id: profiles.id }).from(profiles).limit(1);
  return row !== undefined;
}

/**
 * Public routes: the client configuration and the one-time creation of the first S1 admin.
 * Bootstrap is only possible while the profiles table is empty and the BOOTSTRAP_ADMIN_PASSWORD
 * secret is set; the secret is removed from the Worker once the admin exists.
 */
export const bootstrapRoutes = new Hono<AppEnv>()
  .get('/config', async (c) => {
    const { db } = c.get('deps');
    const body: ConfigDto = {
      supabaseUrl: c.env.SUPABASE_URL ?? '',
      anonKey: c.env.SUPABASE_ANON_KEY ?? '',
      demoControls: demoControlsEnabled(c.env),
      needsBootstrap: Boolean(c.env.BOOTSTRAP_ADMIN_PASSWORD) && !(await hasAnyProfile(db)),
    };
    return c.json(body);
  })
  .post('/bootstrap', jsonBody(bootstrapBodySchema), async (c) => {
    const { db, auth } = c.get('deps');
    const body = c.req.valid('json');
    const secret = c.env.BOOTSTRAP_ADMIN_PASSWORD;
    if (!secret) throw forbidden('Bootstrap is disabled on this deployment');
    if (body.bootstrapPassword !== secret) throw forbidden('Bootstrap password is incorrect');
    if (await hasAnyProfile(db)) throw conflict('An account already exists. Sign in instead.');

    const created = await auth.createUser({ email: body.email, password: secret, displayName: body.displayName });
    try {
      const [profile] = await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(${BOOTSTRAP_LOCK})`);
        if (await hasAnyProfile(tx)) throw conflict('An account already exists. Sign in instead.');
        return tx
          .insert(profiles)
          .values({
            id: created.id,
            email: body.email,
            displayName: body.displayName,
            role: 'ADMIN',
            unitId: null,
            mustChangePassword: true,
            isActive: true,
          })
          .returning();
      });
      if (!profile) throw new AppError('INTERNAL', 'Bootstrap did not create a profile');
      const dto: UserDto = toUserDto(profile);
      return c.json({ user: dto }, 201);
    } catch (err) {
      await auth.deleteUser(created.id).catch((e) => console.error('Could not roll back bootstrap user', e));
      throw err;
    }
  });
