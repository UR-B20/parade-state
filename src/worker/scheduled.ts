import { sgDateOf } from '@shared/dates';
import type { AppDeps } from './deps';
import type { Bindings } from './env';
import { ensureStandardEvents, eventsOnDate } from './services/events';
import { ensureLateNotifications } from './services/notifications';
import { resolveNow } from './services/settings';

/**
 * Runs shortly after each cut-off: marks unsubmitted units Late for every event today.
 * The database round trip also keeps a free Supabase project from pausing.
 */
export async function runScheduled(env: Bindings, deps: AppDeps): Promise<{ date: string; lateNotifications: number }> {
  const handle = deps.getDb(env);
  try {
    const { now, settings } = await resolveNow(handle.db, env, deps.now());
    const date = sgDateOf(now);
    await ensureStandardEvents(handle.db, date, settings);
    let total = 0;
    for (const event of await eventsOnDate(handle.db, date)) {
      total += await ensureLateNotifications(handle.db, event, now);
    }
    return { date, lateNotifications: total };
  } finally {
    await handle.close().catch(() => undefined);
  }
}
