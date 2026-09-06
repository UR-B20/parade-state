import { eq } from 'drizzle-orm';
import { settings } from './db/schema';
import type { Db } from './deps';
import { demoControlsEnabled, type Bindings } from './env';

export interface Clock {
  /** The instant the API treats as now: the demo override on demo deployments, otherwise real time. */
  now: Date;
  /** The demo override when demo controls are on and one is set. */
  demoNow: Date | null;
}

export async function readClock(db: Db, env: Pick<Bindings, 'DEMO_CONTROLS'>): Promise<Clock> {
  if (!demoControlsEnabled(env)) return { now: new Date(), demoNow: null };
  const [row] = await db.select({ demoNow: settings.demoNow }).from(settings).where(eq(settings.id, 1)).limit(1);
  const demoNow = row?.demoNow ?? null;
  return { now: demoNow ?? new Date(), demoNow };
}
