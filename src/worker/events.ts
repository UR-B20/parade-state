import { asc, eq } from 'drizzle-orm';
import { events, settings, type EventRow } from './db/schema';
import type { Db } from './deps';
import { notFound } from './errors';
import { isIsoDate, sgLocalToInstant, type IsoDate } from '@shared/dates';
import type { EventDto } from '@shared/types';

const PARADE_ID_RE = /^(\d{4}-\d{2}-\d{2})-(AM|PM)$/;

export function eventLabel(e: Pick<EventRow, 'type' | 'name'>): string {
  if (e.type === 'AM') return 'AM parade';
  if (e.type === 'PM') return 'PM parade';
  return e.name ?? 'Ad hoc';
}

export const toEventDto = (e: EventRow): EventDto => ({
  id: e.id,
  date: e.date,
  type: e.type,
  name: e.name,
  cutoffAt: e.cutoffAt.toISOString(),
  label: eventLabel(e),
});

/** Make sure the AM and PM parades exist for a date, using the cutoffs in settings. */
export async function ensureParadeEvents(db: Db, date: IsoDate): Promise<void> {
  const [s] = await db.select({ am: settings.cutoffAm, pm: settings.cutoffPm }).from(settings).where(eq(settings.id, 1)).limit(1);
  const cutoffAm = s?.am ?? '10:00';
  const cutoffPm = s?.pm ?? '14:00';
  await db
    .insert(events)
    .values([
      { id: `${date}-AM`, date, type: 'AM', name: null, cutoffAt: sgLocalToInstant(date, cutoffAm) },
      { id: `${date}-PM`, date, type: 'PM', name: null, cutoffAt: sgLocalToInstant(date, cutoffPm) },
    ])
    .onConflictDoNothing();
}

const TYPE_ORDER = { AM: 0, PM: 1, ADHOC: 2 } as const;

/** All events on a date: AM, PM, then ad hoc events in creation order. */
export async function listEvents(db: Db, date: IsoDate): Promise<EventRow[]> {
  await ensureParadeEvents(db, date);
  const rows = await db.select().from(events).where(eq(events.date, date)).orderBy(asc(events.createdAt));
  return rows.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
}

/** Find an event by id, creating the day's parades on demand when the id names one. */
export async function resolveEvent(db: Db, eventId: string): Promise<EventRow> {
  let [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
  if (!row) {
    const match = PARADE_ID_RE.exec(eventId);
    if (match && isIsoDate(match[1]!)) {
      await ensureParadeEvents(db, match[1]!);
      [row] = await db.select().from(events).where(eq(events.id, eventId)).limit(1);
    }
  }
  if (!row) throw notFound(`Event ${eventId}`);
  return row;
}
