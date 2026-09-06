import { Hono } from 'hono';
import { asc, eq, sql } from 'drizzle-orm';
import { requireAdmin, requireAuth, type AppEnv } from '../auth/middleware';
import { platoons, units } from '../db/schema';

/**
 * Mounted at /admin/health. Runs the database steps the dashboard needs, one after another,
 * and reports how long each took (or how it failed), so a stalled deployment can be diagnosed
 * from outside without dashboard access.
 */
export const healthRoutes = new Hono<AppEnv>();
healthRoutes.use('*', requireAuth, requireAdmin);

healthRoutes.get('/', async (c) => {
  const db = c.get('db');
  const steps: { step: string; ms: number; ok: boolean; detail?: string }[] = [];
  const run = async (step: string, fn: () => Promise<unknown>) => {
    const t = Date.now();
    try {
      const r = await fn();
      steps.push({ step, ms: Date.now() - t, ok: true, detail: Array.isArray(r) ? `${r.length} rows` : undefined });
    } catch (e) {
      steps.push({ step, ms: Date.now() - t, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  };
  await run('select 1', () => db.execute(sql`select 1`));
  await run('select 1 again (same connection)', () => db.execute(sql`select 1`));
  await run('units ordered', () => db.select().from(units).orderBy(asc(units.sortOrder)));
  await run('platoons all ordered', () => db.select().from(platoons).orderBy(asc(platoons.unitId), asc(platoons.sortOrder)));
  await run('platoons for COY1', () => db.select().from(platoons).where(eq(platoons.unitId, 'COY1')));
  await run('two concurrent selects', () => Promise.all([db.select().from(units), db.select().from(platoons)]));
  return c.json({ ok: steps.every((s) => s.ok), colo: c.req.raw.cf?.colo ?? null, steps, totalMs: steps.reduce((n, s) => n + s.ms, 0) });
});
