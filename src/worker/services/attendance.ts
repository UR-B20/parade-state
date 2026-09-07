import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { IsoDate } from '@shared/dates';
import {
  contentHash, deriveSubmissionState, diffAgainstSnapshot, effectiveStatuses, eventHalf, MarkValidationError, planMark, planMarkRemainingPresent, platoonBreakdown, unitCounts,
  type SpanRow,
} from '@shared/domain';
import type { HalfDay } from '@shared/statuses';
import type { ChangeDiff, EffectiveStatus, MarkBody, MarkResultDto, SubmissionState, UnitAttendanceDto, UnitCounts, UnitDto } from '@shared/types';
import type { Db } from '../db/client';
import { eventMarks, events, personnel, statusSpans, submissions, unitEventState, type EventRow, type ProfileRow } from '../db/schema';
import type { Bindings } from '../env';
import { AppError, notFound, validation } from '../errors';
import { toEventDto } from './events';
import { activePersonnelOn } from './roll';
import { isLockedForCommander, resolveNow } from './settings';
import { getUnitWithPlatoons } from './platoons';
import { prefillRollCallForUnit } from './prefill';

export async function getUnit(db: Db, unitId: string): Promise<UnitDto> {
  return getUnitWithPlatoons(db, unitId);
}

export function toSpanRow(s: typeof statusSpans.$inferSelect): SpanRow {
  return { id: s.id, personId: s.personId, status: s.status, subType: s.subType, halfDay: (s.halfDay as HalfDay | null) ?? null, startDate: s.startDate, endDate: s.endDate, remark: s.remark, createdAt: s.createdAt.toISOString() };
}

export async function activeSpansForUnit(db: Db, unitId: string): Promise<SpanRow[]> {
  const rows = await db.select().from(statusSpans).where(and(eq(statusSpans.unitId, unitId), isNull(statusSpans.supersededAt)));
  return rows.map(toSpanRow);
}

export async function presentMarksFor(db: Db, unitId: string, eventId: string): Promise<Set<string>> {
  const rows = await db.select({ personId: eventMarks.personId }).from(eventMarks).where(and(eq(eventMarks.eventId, eventId), eq(eventMarks.unitId, unitId)));
  return new Set(rows.map((r) => r.personId));
}

export interface UnitComputation {
  statuses: EffectiveStatus[];
  counts: UnitCounts;
  hash: string;
  /** Present marks found for this event (used to decide whether a Roll Call still needs pre-filling). */
  markCount: number;
}

export async function computeUnit(db: Db, unitId: string, event: EventRow): Promise<UnitComputation> {
  const [people, spans, marks] = await Promise.all([activePersonnelOn(db, unitId, event.date), activeSpansForUnit(db, unitId), presentMarksFor(db, unitId, event.id)]);
  const statuses = effectiveStatuses(people, spans, marks, event.date, eventHalf(event));
  return { statuses, counts: unitCounts(statuses), hash: await contentHash(statuses), markCount: marks.size };
}

export async function latestSubmission(db: Db, unitId: string, eventId: string) {
  const [row] = await db.select().from(submissions).where(and(eq(submissions.unitId, unitId), eq(submissions.eventId, eventId))).orderBy(desc(submissions.version)).limit(1);
  return row ?? null;
}

export async function unitActivity(db: Db, unitId: string, eventId: string) {
  const [row] = await db.select().from(unitEventState).where(and(eq(unitEventState.unitId, unitId), eq(unitEventState.eventId, eventId)));
  return row ?? null;
}

export async function submissionStateFor(db: Db, unitId: string, event: EventRow, hash: string, now: Date, statuses?: EffectiveStatus[]): Promise<{ state: SubmissionState; changes: ChangeDiff[]; updatedAt: string | null }> {
  const [latest, activity] = await Promise.all([latestSubmission(db, unitId, event.id), unitActivity(db, unitId, event.id)]);
  const state = deriveSubmissionState({
    latest: latest ? { version: latest.version, submittedAt: latest.submittedAt.toISOString(), submittedBy: latest.submittedBy, contentHash: latest.contentHash } : null,
    activity: activity ? { lastChangedAt: activity.lastChangedAt.toISOString() } : null,
    cutoffAt: event.cutoffAt?.toISOString() ?? null,
    now,
    currentHash: hash,
  });
  let changes: ChangeDiff[] = [];
  if (latest && (state.kind === 'SUBMITTED' || state.kind === 'RESUBMITTED') && state.hasChanges && statuses) {
    changes = diffAgainstSnapshot(latest.snapshot, statuses);
  }
  return { state, changes, updatedAt: activity?.lastChangedAt.toISOString() ?? null };
}

export async function loadUnitState(db: Db, env: Bindings, unitId: string, event: EventRow, user: ProfileRow, realNow: Date): Promise<UnitAttendanceDto> {
  const [unit, { now }] = await Promise.all([getUnit(db, unitId), resolveNow(db, env, realNow)]);
  let { statuses, counts, hash, markCount } = await computeUnit(db, unitId, event);
  let sub = await submissionStateFor(db, unitId, event, hash, now, statuses);
  // A Roll Call nobody has touched yet starts from the unit's last submitted parade.
  if (event.type === 'ROLLCALL' && markCount === 0 && sub.state.kind === 'NOT_MARKED') {
    const copied = await prefillRollCallForUnit(db, unitId, event, user.id, realNow);
    if (copied > 0) {
      ({ statuses, counts, hash } = await computeUnit(db, unitId, event));
      sub = await submissionStateFor(db, unitId, event, hash, now, statuses);
    }
  }
  const locked = user.role === 'ADMIN' ? false : await isLockedForCommander(db, event.date, now);
  return { unit, event: toEventDto(event), persons: statuses, counts, platoons: platoonBreakdown(statuses, unit.platoons), submission: sub.state, changes: sub.changes, updatedAt: sub.updatedAt, locked, contentHash: hash };
}

/** Records that the unit touched this event; drives Pending and the footer's Updated time. */
export async function touchUnitEvent(db: Db, unitId: string, eventId: string, userId: string, at: Date): Promise<void> {
  await db
    .insert(unitEventState)
    .values({ unitId, eventId, firstChangedAt: at, lastChangedAt: at, lastChangedBy: userId })
    .onConflictDoUpdate({ target: [unitEventState.unitId, unitEventState.eventId], set: { lastChangedAt: at, lastChangedBy: userId } });
}

/** Applies one mark atomically and returns the recomputed view. Date-lock and role checks happen in the route. */
export async function applyMark(db: Db, env: Bindings, unitId: string, event: EventRow, personId: string, action: MarkBody, user: ProfileRow, realNow: Date): Promise<MarkResultDto> {
  const [person] = await db.select().from(personnel).where(and(eq(personnel.id, personId), eq(personnel.unitId, unitId)));
  if (!person) throw notFound('Person');
  if (!(person.postedInDate <= event.date && (person.postedOutDate === null || person.postedOutDate > event.date))) {
    throw validation('This person is not on strength for the selected date');
  }

  await db.transaction(async (tx) => {
    const mine = (await tx.select().from(statusSpans).where(and(eq(statusSpans.personId, personId), isNull(statusSpans.supersededAt)))).map(toSpanRow);
    let plan;
    try {
      plan = planMark(action, personId, mine, event.date);
    } catch (e) {
      if (e instanceof MarkValidationError) throw validation(e.message, { field: e.field });
      throw e;
    }
    if (plan.supersedeSpanIds.length) {
      await tx.update(statusSpans).set({ supersededAt: realNow, supersededBy: user.id }).where(inArray(statusSpans.id, plan.supersedeSpanIds));
    }
    if (plan.insertSpans.length) {
      await tx.insert(statusSpans).values(plan.insertSpans.map((s) => ({
        personId: s.personId, unitId, status: s.status, subType: s.subType, halfDay: s.halfDay, startDate: s.startDate, endDate: s.endDate, remark: s.remark, createdBy: user.id, createdAt: realNow, replacesId: s.replacesId,
      })));
    }
    if (plan.deleteMarksInRange) {
      const { start, end } = plan.deleteMarksInRange;
      const dateFilter = end ? sql`${events.date} >= ${start} AND ${events.date} <= ${end}` : sql`${events.date} >= ${start}`;
      if (plan.deleteMarksHalf) {
        // A half-day absence only clears Present marks on events in that half (and the Roll Call, which has none).
        const candidates = await tx.select().from(events).where(dateFilter);
        const ids = candidates.filter((e) => { const h = eventHalf(e); return h === null || h === plan.deleteMarksHalf; }).map((e) => e.id);
        if (ids.length) await tx.delete(eventMarks).where(and(eq(eventMarks.personId, personId), inArray(eventMarks.eventId, ids)));
      } else {
        const inRange = tx.select({ id: events.id }).from(events).where(dateFilter);
        await tx.delete(eventMarks).where(and(eq(eventMarks.personId, personId), inArray(eventMarks.eventId, inRange)));
      }
    }
    if (plan.upsertPresentMark) {
      await tx.insert(eventMarks).values({ eventId: event.id, personId, unitId, markedBy: user.id, markedAt: realNow }).onConflictDoNothing();
    }
    await touchUnitEvent(tx, unitId, event.id, user.id, realNow);
  });

  const { now } = await resolveNow(db, env, realNow);
  const { statuses, counts, hash } = await computeUnit(db, unitId, event);
  const sub = await submissionStateFor(db, unitId, event, hash, now, statuses);
  const row = statuses.find((s) => s.personId === personId);
  if (!row) throw new AppError('INTERNAL', 'Marked person missing from the recomputed roll');
  return { person: row, counts, submission: sub.state, changes: sub.changes, updatedAt: realNow.toISOString(), contentHash: hash };
}

/** Marks everyone still unmarked as Present in one transaction and returns the refreshed view. */
export async function markRemainingPresent(db: Db, env: Bindings, unitId: string, event: EventRow, user: ProfileRow, realNow: Date): Promise<UnitAttendanceDto> {
  const { statuses } = await computeUnit(db, unitId, event);
  const ids = planMarkRemainingPresent(statuses);
  if (ids.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(eventMarks).values(ids.map((personId) => ({ eventId: event.id, personId, unitId, markedBy: user.id, markedAt: realNow }))).onConflictDoNothing();
      await touchUnitEvent(tx, unitId, event.id, user.id, realNow);
    });
  }
  return loadUnitState(db, env, unitId, event, user, realNow);
}

export async function assertEventDateEditable(db: Db, env: Bindings, event: EventRow, user: ProfileRow, realNow: Date): Promise<void> {
  if (user.role === 'ADMIN') return;
  const { now } = await resolveNow(db, env, realNow);
  if (await isLockedForCommander(db, event.date, now)) {
    throw new AppError('DATE_LOCKED', 'This date is locked. Ask S1 Branch to unlock it to make corrections.');
  }
}

export type { IsoDate };
