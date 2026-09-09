import { and, gte, inArray, lte } from 'drizzle-orm';
import { monthDates, monthlyXlsx } from '@shared/export/monthly';
import type { Db } from '../db/client';
import { events, submissions } from '../db/schema';
import { eventLabel } from './events';
import { listUnits } from './platoons';

/** The whole month as submitted, in three queries: units, the month's events, their submissions. */
export async function monthlyExportXlsx(db: Db, month: string, generatedAt: Date): Promise<Uint8Array> {
  const dates = monthDates(month);
  const [units, eventRows] = await Promise.all([
    listUnits(db),
    db.select().from(events).where(and(gte(events.date, dates[0]!), lte(events.date, dates[dates.length - 1]!))),
  ]);
  const subs = eventRows.length
    ? await db
        .select({ unitId: submissions.unitId, eventId: submissions.eventId, version: submissions.version, submittedAt: submissions.submittedAt, counts: submissions.counts, snapshot: submissions.snapshot })
        .from(submissions)
        .where(inArray(submissions.eventId, eventRows.map((e) => e.id)))
    : [];
  return monthlyXlsx({
    month,
    units: units.map((u) => ({ id: u.id, name: u.name, sortOrder: u.sortOrder })),
    events: eventRows.map((e) => ({ id: e.id, date: e.date, type: e.type, label: eventLabel(e.type, e.name), cutoffAt: e.cutoffAt?.toISOString() ?? null, createdAt: e.createdAt.toISOString() })),
    submissions: subs.map((s) => ({ ...s, submittedAt: s.submittedAt.toISOString() })),
    generatedAt,
  });
}
