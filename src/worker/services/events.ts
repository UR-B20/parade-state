import { and, asc, eq } from 'drizzle-orm';
import { sgLocalToInstant, type IsoDate } from '@shared/dates';
import type { EventDto } from '@shared/types';
import type { Db } from '../db/client';
import { events, type EventRow } from '../db/schema';
import { notFound } from '../errors';
import type { Settings } from './settings';
import { prefillFromLastSubmission } from './prefill';

export const EVENT_TYPE_ORDER = { AM: 0, PM: 1, ROLLCALL: 2, ADHOC: 3 } as const;

export function eventLabel(type: EventRow['type'], name: string | null): string {
  switch (type) {
    case 'AM': return 'AM parade';
    case 'PM': return 'PM parade';
    case 'ROLLCALL': return 'Roll call';
    case 'ADHOC': return name ?? 'Ad hoc';
  }
}

export function toEventDto(e: EventRow): EventDto {
  return {
    id: e.id,
    date: e.date,
    type: e.type,
    name: e.name,
    cutoffAt: e.cutoffAt?.toISOString() ?? null,
    label: eventLabel(e.type, e.name),
  };
}

/**
 * The AM parade, PM parade and Roll Call exist for every date on first request; ad hoc events
 * are created by S1. The Roll Call has no cut-off and is optional.
 */
export async function ensureStandardEvents(db: Db, date: IsoDate, settings: Settings): Promise<void> {
  await db
    .insert(events)
    .values([
      { id: `${date}-AM`, date, type: 'AM', cutoffAt: sgLocalToInstant(date, settings.cutoffAm) },
      { id: `${date}-PM`, date, type: 'PM', cutoffAt: sgLocalToInstant(date, settings.cutoffPm) },
      { id: `${date}-RC`, date, type: 'ROLLCALL', cutoffAt: null },
    ])
    .onConflictDoNothing();
}

export async function listEvents(db: Db, date: IsoDate, settings: Settings): Promise<EventDto[]> {
  await ensureStandardEvents(db, date, settings);
  const rows = await db.select().from(events).where(eq(events.date, date)).orderBy(asc(events.type), asc(events.createdAt));
  return rows.sort((a, b) => EVENT_TYPE_ORDER[a.type] - EVENT_TYPE_ORDER[b.type] || a.createdAt.getTime() - b.createdAt.getTime()).map(toEventDto);
}

export async function getEvent(db: Db, id: string, settings: Settings): Promise<EventRow> {
  const m = /^(\d{4}-\d{2}-\d{2})-(AM|PM|RC)$/.exec(id);
  if (m) await ensureStandardEvents(db, m[1]!, settings);
  const [row] = await db.select().from(events).where(eq(events.id, id));
  if (!row) throw notFound('Event');
  return row;
}

export async function createAdhocEvent(db: Db, input: { date: IsoDate; name: string; cutoffTime: string }, createdBy: string, realNow: Date): Promise<EventDto> {
  const id = `${input.date}-X-${crypto.randomUUID().slice(0, 8)}`;
  const [row] = await db
    .insert(events)
    .values({ id, date: input.date, type: 'ADHOC', name: input.name, cutoffAt: sgLocalToInstant(input.date, input.cutoffTime), createdBy })
    .returning();
  await prefillFromLastSubmission(db, row!, createdBy, realNow);
  return toEventDto(row!);
}

export async function eventsOnDate(db: Db, date: IsoDate): Promise<EventRow[]> {
  return db.select().from(events).where(and(eq(events.date, date)));
}
