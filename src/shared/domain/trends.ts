import { addDays, type IsoDate, type IsoTimestamp } from '../dates';
import { OTHERS_SUB_TYPES, type OthersSubType } from '../statuses';
import type { EffectiveStatus, EventDto, TrendDay, TrendsDto, UnitCounts, UnitSummaryRow, UnitTimeliness } from '../types';
import { sumCounts } from './counts';

export interface TrendSubmission { unitId: string; eventId: string; submittedAt: IsoTimestamp; counts: UnitCounts }
export interface TrendEvent { id: string; date: IsoDate; cutoffAt: IsoTimestamp }

export interface TrendsInput {
  event: EventDto;
  days: number;
  units: { id: string; name: string; sortOrder: number }[];
  /** AM parades recorded on the days before the event date. */
  pastEvents: TrendEvent[];
  /** The latest submission per unit and event. */
  submissions: TrendSubmission[];
  today: { units: UnitSummaryRow[]; totals: UnitCounts; unitsSubmitted: number; unitsTotal: number };
  todayStatuses: readonly EffectiveStatus[];
  serverNow: IsoTimestamp;
}

/** The `days` calendar dates ending on `endDate`, oldest first. */
export function trendDates(endDate: IsoDate, days: number): IsoDate[] {
  return Array.from({ length: days }, (_, i) => addDays(endDate, i - (days - 1)));
}

/**
 * Battalion trend over a window of days. Past days are read from what units submitted
 * (so the figures are the ones S1 actually received); the event day is the live state.
 */
export function buildTrends(input: TrendsInput): TrendsDto {
  const units = [...input.units].sort((a, b) => a.sortOrder - b.sortOrder);
  const byDate = new Map(input.pastEvents.map((e) => [e.date, e]));
  const latest = new Map(input.submissions.map((s) => [`${s.unitId}|${s.eventId}`, s]));
  const timeliness = new Map<string, UnitTimeliness>(units.map((u) => [u.id, { unitId: u.id, unitName: u.name, onTime: 0, late: 0, missed: 0, pending: 0 }]));

  const days: TrendDay[] = trendDates(input.event.date, input.days).map((date) => {
    if (date === input.event.date) {
      let onTime = 0;
      let late = 0;
      for (const row of input.today.units) {
        const t = timeliness.get(row.unit.id);
        if (!t) continue;
        if (row.submission.kind === 'SUBMITTED' || row.submission.kind === 'RESUBMITTED') {
          if (row.submission.wasLate) { late += 1; t.late += 1; } else { onTime += 1; t.onTime += 1; }
        } else {
          t.pending += 1;
        }
      }
      return { date, eventId: input.event.id, live: true, counts: input.today.totals, unitsSubmitted: input.today.unitsSubmitted, unitsTotal: input.today.unitsTotal, onTime, late };
    }
    const ev = byDate.get(date);
    if (!ev) return { date, eventId: null, live: false, counts: sumCounts([]), unitsSubmitted: 0, unitsTotal: units.length, onTime: 0, late: 0 };
    const counts: UnitCounts[] = [];
    let onTime = 0;
    let late = 0;
    for (const u of units) {
      const s = latest.get(`${u.id}|${ev.id}`);
      const t = timeliness.get(u.id)!;
      if (!s) { t.missed += 1; continue; }
      counts.push(s.counts);
      if (Date.parse(s.submittedAt) <= Date.parse(ev.cutoffAt)) { onTime += 1; t.onTime += 1; } else { late += 1; t.late += 1; }
    }
    return { date, eventId: ev.id, live: false, counts: sumCounts(counts), unitsSubmitted: counts.length, unitsTotal: units.length, onTime, late };
  });

  const othersSubTypes = Object.fromEntries(OTHERS_SUB_TYPES.map((t) => [t, 0])) as Record<OthersSubType, number>;
  for (const s of input.todayStatuses) if (s.status === 'OTHERS' && s.subType) othersSubTypes[s.subType] += 1;

  return { event: input.event, days, units: [...timeliness.values()], othersSubTypes, serverNow: input.serverNow };
}
