import { and, desc, eq, inArray, isNull, lte } from 'drizzle-orm';
import { eventHalf, spanCoversEvent } from '@shared/domain';
import type { HalfDay } from '@shared/statuses';
import type { Db } from '../db/client';
import { eventMarks, events, statusSpans, submissions, type EventRow } from '../db/schema';
import { activePersonnelOn } from './roll';

/**
 * Personnel of the unit who can take a copied Present mark: on strength for the date and not
 * covered by an absence for this event (a mark would otherwise override the absence).
 */
async function prefillCandidates(db: Db, unitId: string, event: EventRow): Promise<Set<string>> {
  const [people, spans] = await Promise.all([
    activePersonnelOn(db, unitId, event.date),
    db.select().from(statusSpans).where(and(eq(statusSpans.unitId, unitId), isNull(statusSpans.supersededAt))),
  ]);
  const half = eventHalf(event);
  const covered = new Set(
    spans
      .filter((s) => spanCoversEvent({ ...s, halfDay: (s.halfDay as HalfDay | null) ?? null, createdAt: s.createdAt.toISOString() }, event.date, half))
      .map((s) => s.personId),
  );
  return new Set(people.filter((p) => !covered.has(p.id)).map((p) => p.id));
}

/**
 * Pre-fill one unit's Roll Call the first time it is opened, from that unit's latest submitted
 * parade on or before the Roll Call date: the PM parade if it was submitted, else the AM parade,
 * else the last parade submitted before that day. Returns the number of Present marks copied.
 */
export async function prefillRollCallForUnit(db: Db, unitId: string, event: EventRow, markedBy: string, realNow: Date): Promise<number> {
  const [latest] = await db
    .select({ snapshot: submissions.snapshot })
    .from(submissions)
    .innerJoin(events, eq(events.id, submissions.eventId))
    .where(and(eq(submissions.unitId, unitId), inArray(events.type, ['AM', 'PM']), lte(events.date, event.date), lte(submissions.submittedAt, realNow)))
    .orderBy(desc(events.date), desc(events.type), desc(submissions.version))
    .limit(1);
  if (!latest) return 0;
  const active = await prefillCandidates(db, unitId, event);
  const presentIds = latest.snapshot.filter((s) => s.status === 'PRESENT' && active.has(s.personId)).map((s) => s.personId);
  if (presentIds.length === 0) return 0;
  const inserted = await db
    .insert(eventMarks)
    .values(presentIds.map((personId) => ({ eventId: event.id, personId, unitId, markedBy, markedAt: realNow })))
    .onConflictDoNothing()
    .returning({ personId: eventMarks.personId });
  return inserted.length;
}
