import { and, eq, inArray, isNull } from 'drizzle-orm';
import { awaitingRank, contentHash, deriveSubmissionState, effectiveStatuses, platoonBreakdown, sumCounts, unitCounts } from '@shared/domain';
import type { AbsenteeDto, AbsenteesDto, BattalionSummaryDto, EffectiveStatus, UnitSummaryRow } from '@shared/types';
import { ABSENCE_STATUSES } from '@shared/statuses';
import type { Db } from '../db/client';
import { eventMarks, personnel, statusSpans, submissions, unitEventState, type EventRow } from '../db/schema';
import { listUnits } from './platoons';
import type { Bindings } from '../env';
import { toSpanRow } from './attendance';
import { toEventDto } from './events';
import { ensureLateNotifications } from './notifications';
import { resolveNow } from './settings';

/**
 * Every unit's rows for one event, loaded battalion-wide in five queries rather than five per
 * unit: the Worker sits one network round trip away from Postgres for each query, so the
 * dashboard cost is the query count, not the row count.
 */
export async function unitRows(db: Db, event: EventRow, now: Date): Promise<{ row: UnitSummaryRow; statuses: EffectiveStatus[] }[]> {
  const units = await listUnits(db);
  const unitIds = units.map((u) => u.id);
  const [people, spans, marks, subs, activity] = await Promise.all([
    db.select().from(personnel).where(inArray(personnel.unitId, unitIds)),
    db.select().from(statusSpans).where(and(inArray(statusSpans.unitId, unitIds), isNull(statusSpans.supersededAt))),
    db.select({ personId: eventMarks.personId, unitId: eventMarks.unitId }).from(eventMarks).where(eq(eventMarks.eventId, event.id)),
    db.select({ unitId: submissions.unitId, version: submissions.version, submittedAt: submissions.submittedAt, submittedBy: submissions.submittedBy, contentHash: submissions.contentHash }).from(submissions).where(eq(submissions.eventId, event.id)),
    db.select().from(unitEventState).where(eq(unitEventState.eventId, event.id)),
  ]);
  const latestByUnit = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    const cur = latestByUnit.get(s.unitId);
    if (!cur || s.version > cur.version) latestByUnit.set(s.unitId, s);
  }
  const activityByUnit = new Map(activity.map((a) => [a.unitId, a]));
  return Promise.all(
    units.map(async (u) => {
      const unitPeople = people.filter((p) => p.unitId === u.id && p.postedInDate <= event.date && (p.postedOutDate === null || p.postedOutDate > event.date));
      const unitSpans = spans.filter((s) => s.unitId === u.id).map(toSpanRow);
      const unitMarks = new Set(marks.filter((m) => m.unitId === u.id).map((m) => m.personId));
      const statuses = effectiveStatuses(unitPeople, unitSpans, unitMarks, event.date);
      const hash = await contentHash(statuses);
      const latest = latestByUnit.get(u.id);
      const act = activityByUnit.get(u.id);
      const state = deriveSubmissionState({
        latest: latest ? { version: latest.version, submittedAt: latest.submittedAt.toISOString(), submittedBy: latest.submittedBy, contentHash: latest.contentHash } : null,
        activity: act ? { lastChangedAt: act.lastChangedAt.toISOString() } : null,
        cutoffAt: event.cutoffAt.toISOString(),
        now,
        currentHash: hash,
      });
      const row: UnitSummaryRow = { unit: u, counts: unitCounts(statuses), submission: state, platoons: platoonBreakdown(statuses, u.platoons) };
      return { row, statuses };
    }),
  );
}

export async function battalionSummary(db: Db, env: Bindings, event: EventRow, realNow: Date): Promise<BattalionSummaryDto> {
  const { now } = await resolveNow(db, env, realNow);
  await ensureLateNotifications(db, event, now);
  const rows = (await unitRows(db, event, now)).map((r) => r.row);
  rows.sort((a, b) => awaitingRank(a.submission) - awaitingRank(b.submission) || a.unit.sortOrder - b.unit.sortOrder);
  const submitted = rows.filter((r) => r.submission.kind === 'SUBMITTED' || r.submission.kind === 'RESUBMITTED').length;
  return { event: toEventDto(event), totals: sumCounts(rows.map((r) => r.counts)), unitsSubmitted: submitted, unitsTotal: rows.length, units: rows, serverNow: realNow.toISOString() };
}

export async function absentees(db: Db, env: Bindings, event: EventRow, realNow: Date): Promise<AbsenteesDto> {
  const { now } = await resolveNow(db, env, realNow);
  const groups = ABSENCE_STATUSES.map((status) => ({ status, items: [] as AbsenteeDto[] }));
  for (const { row, statuses } of await unitRows(db, event, now)) {
    for (const s of statuses) {
      if (s.status === 'PRESENT' || s.status === 'UNMARKED') continue;
      groups.find((g) => g.status === s.status)!.items.push({
        personId: s.personId, rank: s.rank, name: s.name, unitId: row.unit.id, unitName: row.unit.name,
        status: s.status, subType: s.subType, startDate: s.startDate, endDate: s.endDate, remark: s.remark,
      });
    }
  }
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  return { event: toEventDto(event), total, groups: groups.filter((g) => g.items.length > 0) };
}
