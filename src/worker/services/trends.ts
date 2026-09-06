import { and, eq, inArray } from 'drizzle-orm';
import { awaitingRank, buildTrends, isSubmitted, platoonBreakdown, sumCounts, trendDates, type TrendEvent, type TrendSubmission } from '@shared/domain';
import type { TrendsDto, UnitSummaryRow } from '@shared/types';
import type { Db } from '../db/client';
import { events, submissions, type EventRow } from '../db/schema';
import type { Bindings } from '../env';
import { toEventDto } from './events';
import { getUnitWithPlatoons, listUnits } from './platoons';
import { computeUnit, submissionStateFor } from './attendance';
import { resolveNow } from './settings';
import { unitRows } from './summary';

/** The AM parades before the event date and the latest submission per unit for each. */
async function loadPast(db: Db, event: EventRow, days: number, unitId?: string): Promise<{ pastEvents: TrendEvent[]; submissions: TrendSubmission[] }> {
  const pastDates = trendDates(event.date, days).filter((d) => d !== event.date);
  const pastEvents = pastDates.length ? await db.select().from(events).where(and(inArray(events.date, pastDates), eq(events.type, 'AM'))) : [];
  if (pastEvents.length === 0) return { pastEvents: [], submissions: [] };
  const where = unitId
    ? and(inArray(submissions.eventId, pastEvents.map((e) => e.id)), eq(submissions.unitId, unitId))
    : inArray(submissions.eventId, pastEvents.map((e) => e.id));
  const subs = await db
    .select({ unitId: submissions.unitId, eventId: submissions.eventId, version: submissions.version, submittedAt: submissions.submittedAt, counts: submissions.counts })
    .from(submissions)
    .where(where);
  const latest = new Map<string, (typeof subs)[number]>();
  for (const s of subs) {
    const key = `${s.unitId}|${s.eventId}`;
    const cur = latest.get(key);
    if (!cur || s.version > cur.version) latest.set(key, s);
  }
  return {
    pastEvents: pastEvents.map((e) => ({ id: e.id, date: e.date, cutoffAt: e.cutoffAt.toISOString() })),
    submissions: [...latest.values()].map((s) => ({ unitId: s.unitId, eventId: s.eventId, submittedAt: s.submittedAt.toISOString(), counts: s.counts })),
  };
}

/** Battalion trend over the `days` ending on the event's date, with today live. */
export async function battalionTrends(db: Db, env: Bindings, event: EventRow, days: number, realNow: Date): Promise<TrendsDto> {
  const { now } = await resolveNow(db, env, realNow);
  const past = await loadPast(db, event, days);
  const units = await listUnits(db);
  const rows = await unitRows(db, event, now);
  const today = rows.map((r) => r.row).sort((a, b) => awaitingRank(a.submission) - awaitingRank(b.submission) || a.unit.sortOrder - b.unit.sortOrder);
  const unitsSubmitted = today.filter((r) => isSubmitted(r.submission)).length;
  return buildTrends({
    event: toEventDto(event),
    days,
    units: units.map((u) => ({ id: u.id, name: u.name, sortOrder: u.sortOrder })),
    ...past,
    today: { units: today, totals: sumCounts(today.map((r) => r.counts)), unitsSubmitted, unitsTotal: today.length },
    todayStatuses: rows.flatMap((r) => r.statuses),
    serverNow: realNow.toISOString(),
  });
}

/** One unit's trend: the same shape, so the commander's card and S1's charts agree. */
export async function unitTrends(db: Db, env: Bindings, unitId: string, event: EventRow, days: number, realNow: Date): Promise<TrendsDto> {
  const { now } = await resolveNow(db, env, realNow);
  const unit = await getUnitWithPlatoons(db, unitId);
  const past = await loadPast(db, event, days, unitId);
  const { statuses, counts, hash } = await computeUnit(db, unitId, event);
  const sub = await submissionStateFor(db, unitId, event, hash, now, statuses);
  const row: UnitSummaryRow = { unit, counts, submission: sub.state, platoons: platoonBreakdown(statuses, unit.platoons) };
  return buildTrends({
    event: toEventDto(event),
    days,
    units: [{ id: unit.id, name: unit.name, sortOrder: unit.sortOrder }],
    ...past,
    today: { units: [row], totals: counts, unitsSubmitted: isSubmitted(sub.state) ? 1 : 0, unitsTotal: 1 },
    todayStatuses: statuses,
    serverNow: realNow.toISOString(),
  });
}
