import { and, desc, eq, lte } from 'drizzle-orm';
import type { Db } from '../db/client';
import { eventMarks, events, submissions, units, type EventRow } from '../db/schema';
import { activePersonnelOn } from './roll';

/**
 * Pre-fill a new ad hoc event from each unit's last submitted parade state on or before its
 * date: everyone who was submitted as Present is marked Present for the new event. Absences
 * come from their spans automatically; anyone else starts unmarked.
 */
export async function prefillFromLastSubmission(db: Db, event: EventRow, createdBy: string, realNow: Date): Promise<Record<string, number>> {
  const allUnits = await db.select().from(units);
  const copied: Record<string, number> = {};
  for (const unit of allUnits) {
    const [latest] = await db
      .select({ snapshot: submissions.snapshot })
      .from(submissions)
      .innerJoin(events, eq(events.id, submissions.eventId))
      .where(and(eq(submissions.unitId, unit.id), lte(events.date, event.date), lte(submissions.submittedAt, realNow)))
      .orderBy(desc(submissions.submittedAt))
      .limit(1);
    if (!latest) continue;
    const active = new Set((await activePersonnelOn(db, unit.id, event.date)).map((p) => p.id));
    const presentIds = latest.snapshot.filter((s) => s.status === 'PRESENT' && active.has(s.personId)).map((s) => s.personId);
    if (presentIds.length === 0) continue;
    const inserted = await db
      .insert(eventMarks)
      .values(presentIds.map((personId) => ({ eventId: event.id, personId, unitId: unit.id, markedBy: createdBy, markedAt: realNow })))
      .onConflictDoNothing()
      .returning({ personId: eventMarks.personId });
    copied[unit.id] = inserted.length;
  }
  return copied;
}

