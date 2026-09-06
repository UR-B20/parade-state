/**
 * Unit attendance for one event: derivation from stored rows, marking, submission and history.
 * All derivation goes through the shared domain functions so the client, the seed and the
 * server agree on every count and hash.
 */
import { and, desc, eq, gt, gte, isNull, lte, or } from 'drizzle-orm';
import { assertUnitAccess } from './auth/middleware';
import {
  absenceSpans,
  dateUnlocks,
  notifications,
  personnel,
  presentMarks,
  profiles,
  submissions,
  unitEventState,
  units,
  type AbsenceSpanRow,
  type EventRow,
  type ProfileRow,
  type SubmissionRow,
  type UnitRow,
} from './db/schema';
import type { Db } from './deps';
import { toUnitDto } from './dto';
import { AppError, conflict, notFound, validation } from './errors';
import { eventLabel, resolveEvent, toEventDto } from './events';
import { addDays, formatSgDateMedium, type IsoDate } from '@shared/dates';
import {
  contentHash,
  deriveSubmissionState,
  diffAgainstSnapshot,
  effectiveStatuses,
  isDateLocked,
  toSnapshot,
  unitCounts,
  type SpanRow,
} from '@shared/domain';
import type { MarkBody, MarkResultDto, SubmissionDto, SubmitBody, SubmitResultDto, UnitAttendanceDto, UnitId } from '@shared/types';

export interface AttendanceContext {
  db: Db;
  user: ProfileRow;
  /** The instant treated as now (demo clock aware). */
  now: Date;
  sgToday: IsoDate;
}

async function loadUnit(db: Db, unitId: UnitId): Promise<UnitRow> {
  const [unit] = await db.select().from(units).where(eq(units.id, unitId)).limit(1);
  if (!unit) throw notFound(`Unit ${unitId}`);
  return unit;
}

function toSpanRow(s: AbsenceSpanRow): SpanRow {
  return { ...s, createdAt: s.createdAt.toISOString() };
}

const coversDate = (date: IsoDate) =>
  and(lte(absenceSpans.startDate, date), or(isNull(absenceSpans.endDate), gte(absenceSpans.endDate, date)));

interface UnitState {
  statuses: ReturnType<typeof effectiveStatuses>;
  counts: ReturnType<typeof unitCounts>;
  hash: string;
  latest: SubmissionRow | null;
  submission: UnitAttendanceDto['submission'];
  changes: UnitAttendanceDto['changes'];
  updatedAt: Date | null;
  locked: boolean;
}

/** Derive everything about a unit at an event from the current rows. */
async function computeUnitState(ctx: AttendanceContext, unit: UnitRow, event: EventRow): Promise<UnitState> {
  const { db } = ctx;
  const people = await db
    .select()
    .from(personnel)
    .where(
      and(eq(personnel.unitId, unit.id), lte(personnel.postedInDate, event.date), or(isNull(personnel.postedOutDate), gt(personnel.postedOutDate, event.date))),
    );
  const spans = await db
    .select()
    .from(absenceSpans)
    .where(and(eq(absenceSpans.unitId, unit.id), isNull(absenceSpans.supersededAt), coversDate(event.date)));
  const marks = await db
    .select({ personId: presentMarks.personId })
    .from(presentMarks)
    .where(and(eq(presentMarks.unitId, unit.id), eq(presentMarks.eventId, event.id)));
  const [state] = await db
    .select()
    .from(unitEventState)
    .where(and(eq(unitEventState.unitId, unit.id), eq(unitEventState.eventId, event.id)))
    .limit(1);
  const [latest] = await db
    .select()
    .from(submissions)
    .where(and(eq(submissions.unitId, unit.id), eq(submissions.eventId, event.id)))
    .orderBy(desc(submissions.version))
    .limit(1);
  const unlocks = await db.select().from(dateUnlocks).where(eq(dateUnlocks.date, event.date));

  const statuses = effectiveStatuses(people, spans.map(toSpanRow), new Set(marks.map((m) => m.personId)), event.date);
  const counts = unitCounts(statuses);
  const hash = await contentHash(statuses);
  const submission = deriveSubmissionState({
    latest: latest
      ? { version: latest.version, submittedAt: latest.submittedAt.toISOString(), submittedBy: latest.submittedBy, contentHash: latest.contentHash }
      : null,
    activity: state ? { lastChangedAt: state.lastChangedAt.toISOString() } : null,
    cutoffAt: event.cutoffAt.toISOString(),
    now: ctx.now,
    currentHash: hash,
  });
  const changes = latest ? diffAgainstSnapshot(latest.snapshot, statuses) : [];
  const locked =
    ctx.user.role !== 'ADMIN' &&
    isDateLocked(event.date, ctx.sgToday, unlocks.map((u) => ({ date: u.date, expiresAt: u.expiresAt.toISOString() })), ctx.now);
  return { statuses, counts, hash, latest: latest ?? null, submission, changes, updatedAt: state?.lastChangedAt ?? null, locked };
}

function toAttendanceDto(unit: UnitRow, event: EventRow, s: UnitState): UnitAttendanceDto {
  return {
    unit: toUnitDto(unit),
    event: toEventDto(event),
    persons: s.statuses,
    counts: s.counts,
    submission: s.submission,
    changes: s.changes,
    updatedAt: s.updatedAt?.toISOString() ?? null,
    locked: s.locked,
    contentHash: s.hash,
  };
}

export async function loadUnitAttendance(ctx: AttendanceContext, unitId: UnitId, eventId: string): Promise<UnitAttendanceDto> {
  assertUnitAccess(ctx.user, unitId);
  const unit = await loadUnit(ctx.db, unitId);
  const event = await resolveEvent(ctx.db, eventId);
  return toAttendanceDto(unit, event, await computeUnitState(ctx, unit, event));
}

async function assertUnlocked(ctx: AttendanceContext, event: EventRow): Promise<void> {
  if (ctx.user.role === 'ADMIN') return;
  const unlocks = await ctx.db.select().from(dateUnlocks).where(eq(dateUnlocks.date, event.date));
  const locked = isDateLocked(event.date, ctx.sgToday, unlocks.map((u) => ({ date: u.date, expiresAt: u.expiresAt.toISOString() })), ctx.now);
  if (locked) throw new AppError('DATE_LOCKED', `${formatSgDateMedium(event.date)} is locked. Ask S1 to unlock it.`);
}

async function touchUnitEvent(db: Db, unitId: UnitId, eventId: string, now: Date, userId: string): Promise<void> {
  await db
    .insert(unitEventState)
    .values({ unitId, eventId, firstChangedAt: now, lastChangedAt: now, lastChangedBy: userId })
    .onConflictDoUpdate({ target: [unitEventState.unitId, unitEventState.eventId], set: { lastChangedAt: now, lastChangedBy: userId } });
}

/**
 * Close the active spans covering `date` for a person. A span that started earlier is kept
 * as history by re-issuing it with an end date of the day before; spans are never edited.
 */
async function closeCoveringSpans(db: Db, personId: string, date: IsoDate, now: Date, userId: string): Promise<void> {
  const covering = await db
    .select()
    .from(absenceSpans)
    .where(and(eq(absenceSpans.personId, personId), isNull(absenceSpans.supersededAt), coversDate(date)));
  for (const span of covering) {
    await db.update(absenceSpans).set({ supersededAt: now, supersededBy: userId }).where(eq(absenceSpans.id, span.id));
    if (span.startDate < date) {
      await db.insert(absenceSpans).values({
        personId: span.personId,
        unitId: span.unitId,
        status: span.status,
        subType: span.subType,
        startDate: span.startDate,
        endDate: addDays(date, -1),
        remark: span.remark,
        createdAt: span.createdAt,
        createdBy: span.createdBy,
      });
    }
  }
}

export async function applyMark(ctx: AttendanceContext, unitId: UnitId, eventId: string, personId: string, body: MarkBody): Promise<MarkResultDto> {
  assertUnitAccess(ctx.user, unitId);
  const unit = await loadUnit(ctx.db, unitId);
  const event = await resolveEvent(ctx.db, eventId);
  await assertUnlocked(ctx, event);

  const [person] = await ctx.db
    .select()
    .from(personnel)
    .where(and(eq(personnel.id, personId), eq(personnel.unitId, unitId)))
    .limit(1);
  if (!person || person.postedInDate > event.date || (person.postedOutDate !== null && person.postedOutDate <= event.date)) {
    throw notFound('Person');
  }

  const { now, user } = ctx;
  await ctx.db.transaction(async (tx) => {
    const confirmPresent = () =>
      tx
        .insert(presentMarks)
        .values({ eventId: event.id, personId, unitId, markedBy: user.id, markedAt: now })
        .onConflictDoUpdate({ target: [presentMarks.eventId, presentMarks.personId], set: { markedBy: user.id, markedAt: now } });

    switch (body.action) {
      case 'PRESENT':
        await confirmPresent();
        break;
      case 'BACK_TO_PRESENT':
        await closeCoveringSpans(tx, personId, event.date, now, user.id);
        await confirmPresent();
        break;
      case 'SET': {
        const single = body.status === 'RSI';
        const startDate = single ? event.date : body.startDate;
        const endDate = single ? event.date : body.endDate;
        if (body.status === 'OTHERS' && !body.subType) {
          throw validation('Choose what kind of Others', [{ path: 'subType', message: 'Required for Others' }]);
        }
        if (body.status !== 'OTHERS' && body.subType) {
          throw validation('Sub-type only applies to Others', [{ path: 'subType', message: 'Leave empty' }]);
        }
        if (endDate !== null && endDate < startDate) {
          throw validation('End date is before the start date', [{ path: 'endDate', message: 'Must be on or after the start date' }]);
        }
        if (startDate > event.date || (endDate !== null && endDate < event.date)) {
          throw validation(`Dates must include ${formatSgDateMedium(event.date)}`, [{ path: 'startDate', message: 'Must cover the parade date' }]);
        }
        await closeCoveringSpans(tx, personId, event.date, now, user.id);
        await tx.insert(absenceSpans).values({
          personId,
          unitId,
          status: body.status,
          subType: body.status === 'OTHERS' ? (body.subType ?? null) : null,
          startDate,
          endDate,
          remark: body.remark?.trim() || null,
          createdAt: now,
          createdBy: user.id,
        });
        await tx.delete(presentMarks).where(and(eq(presentMarks.eventId, event.id), eq(presentMarks.personId, personId)));
        break;
      }
    }
    await touchUnitEvent(tx, unitId, event.id, now, user.id);
  });

  const state = await computeUnitState(ctx, unit, event);
  const personStatus = state.statuses.find((s) => s.personId === personId);
  if (!personStatus) throw new AppError('INTERNAL', 'Marked person is missing from the roll');
  return {
    person: personStatus,
    counts: state.counts,
    submission: state.submission,
    changes: state.changes,
    updatedAt: (state.updatedAt ?? now).toISOString(),
    contentHash: state.hash,
  };
}

function toSubmissionDto(s: SubmissionRow, submittedByName: string): SubmissionDto {
  return {
    id: s.id,
    unitId: s.unitId,
    eventId: s.eventId,
    version: s.version,
    submittedAt: s.submittedAt.toISOString(),
    submittedBy: s.submittedBy,
    submittedByName,
    counts: s.counts,
    contentHash: s.contentHash,
  };
}

export async function submitUnit(ctx: AttendanceContext, unitId: UnitId, eventId: string, body: SubmitBody): Promise<SubmitResultDto> {
  assertUnitAccess(ctx.user, unitId);
  const unit = await loadUnit(ctx.db, unitId);
  const event = await resolveEvent(ctx.db, eventId);
  await assertUnlocked(ctx, event);
  const { now, user } = ctx;

  const created = await ctx.db.transaction(async (tx) => {
    const state = await computeUnitState({ ...ctx, db: tx }, unit, event);
    if (body.contentHash && body.contentHash !== state.hash) {
      throw conflict('The roll changed since you reviewed it. Check the changes and submit again.');
    }
    if (state.latest && state.latest.contentHash === state.hash) {
      throw conflict('Nothing has changed since the last submission');
    }
    const version = (state.latest?.version ?? 0) + 1;
    const [row] = await tx
      .insert(submissions)
      .values({
        unitId,
        eventId: event.id,
        version,
        submittedBy: user.id,
        submittedAt: now,
        contentHash: state.hash,
        counts: state.counts,
        snapshot: toSnapshot(state.statuses),
      })
      .returning();
    await tx
      .insert(unitEventState)
      .values({ unitId, eventId: event.id, firstChangedAt: now, lastChangedAt: now, lastChangedBy: user.id })
      .onConflictDoNothing();

    const admins = await tx.select({ id: profiles.id }).from(profiles).where(and(eq(profiles.role, 'ADMIN'), eq(profiles.isActive, true)));
    if (admins.length > 0) {
      const verb = version === 1 ? 'submitted' : `resubmitted (v${version})`;
      const message = `${unit.name} ${verb} ${eventLabel(event)} · ${state.counts.present}/${state.counts.strength} present`;
      await tx.insert(notifications).values(
        admins.map((a) => ({
          userId: a.id,
          type: version === 1 ? ('SUBMITTED' as const) : ('RESUBMITTED' as const),
          unitId,
          eventId: event.id,
          submissionId: row!.id,
          message,
          createdAt: now,
        })),
      );
    }
    return row!;
  });

  return {
    submission: toSubmissionDto(created, user.displayName),
    attendance: toAttendanceDto(unit, event, await computeUnitState(ctx, unit, event)),
  };
}

export async function listSubmissions(ctx: AttendanceContext, unitId: UnitId, eventId: string): Promise<SubmissionDto[]> {
  assertUnitAccess(ctx.user, unitId);
  await loadUnit(ctx.db, unitId);
  const event = await resolveEvent(ctx.db, eventId);
  const rows = await ctx.db
    .select({ submission: submissions, submittedByName: profiles.displayName })
    .from(submissions)
    .innerJoin(profiles, eq(profiles.id, submissions.submittedBy))
    .where(and(eq(submissions.unitId, unitId), eq(submissions.eventId, event.id)))
    .orderBy(desc(submissions.version));
  return rows.map((r) => toSubmissionDto(r.submission, r.submittedByName));
}
